import express from 'express';
import db from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createDedupeHash, generateRequestReference } from '../utils/requestUtils.js';
import { cacheWorkflowRead, getCachedWorkflowRead, invalidateWorkflowReads } from '../services/workflowReadCache.js';
import { logEvent } from '../middleware/observability.js';
import { isValidRequestVersion } from '../utils/workflowUtils.js';

const router = express.Router();

router.get('/my', requireAuth, requireRole('Customer'), (req, res) => {
  const cacheKey = `customer-requests:${req.user.id}`;
  const cachedRequests = getCachedWorkflowRead(cacheKey);
  if (cachedRequests) {
    res.setHeader('x-cache', 'HIT');
    return res.json({ requests: cachedRequests });
  }

  const requests = db
    .prepare(`
      SELECT requests.*,
        (SELECT explanation FROM review_decisions
          WHERE review_decisions.request_id = requests.id
          ORDER BY created_at DESC LIMIT 1) AS latest_review_explanation
      FROM requests
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `)
    .all(req.user.id);

  cacheWorkflowRead(cacheKey, requests);
  res.setHeader('x-cache', 'MISS');
  return res.json({ requests });
});

router.get('/:reference', requireAuth, (req, res) => {
  const cacheKey = `request-detail:${req.user.role}:${req.user.id}:${req.params.reference}`;
  const cachedRequest = getCachedWorkflowRead(cacheKey);
  if (cachedRequest) {
    res.setHeader('x-cache', 'HIT');
    return res.json({ request: cachedRequest });
  }

  const request = db.prepare('SELECT * FROM requests WHERE request_reference = ?').get(req.params.reference);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  const isOwner = req.user.role === 'Customer' && request.customer_id === req.user.id;
  const isReviewerOrAdmin = req.user.role === 'Reviewer' || req.user.role === 'Admin';

  if (!isOwner && !isReviewerOrAdmin) {
    return res.status(403).json({ message: 'You are not allowed to view this request.' });
  }

  const decisions = db.prepare('SELECT * FROM review_decisions WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const events = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const requestDetails = { ...request, decisions, events };

  cacheWorkflowRead(cacheKey, requestDetails);
  res.setHeader('x-cache', 'MISS');
  return res.json({ request: requestDetails });
});

router.post('/', requireAuth, requireRole('Customer'), (req, res) => {
  const { customerReference, expenseDate, amountInr, description } = req.body || {};
  const normalizedAmount = Number(amountInr);
  const normalizedDate = typeof expenseDate === 'string' ? new Date(`${expenseDate}T00:00:00.000Z`) : null;
  const validDate = normalizedDate && !Number.isNaN(normalizedDate.getTime()) && normalizedDate.toISOString().slice(0, 10) === expenseDate;

  if (
    typeof customerReference !== 'string' || !customerReference.trim() ||
    !validDate ||
    !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 ||
    typeof description !== 'string' || !description.trim()
  ) {
    return res.status(400).json({ message: 'Provide a customer reference, valid expense date, positive amount, and description.' });
  }

  const normalizedCustomerReference = customerReference.trim();
  const normalizedDescription = description.trim();

  const dedupeHash = createDedupeHash({
    customerReference: normalizedCustomerReference,
    expenseDate,
    amountInr: normalizedAmount,
    description: normalizedDescription,
  });

  const existing = db
    .prepare('SELECT * FROM requests WHERE customer_reference = ? AND dedupe_hash = ?')
    .get(normalizedCustomerReference, dedupeHash);

  if (existing) {
    logEvent('request.duplicate_detected', {
      correlationId: req.correlationId,
      customerReference: normalizedCustomerReference,
      requestId: existing.id,
    });
    return res.status(200).json({
      message: 'This request already exists and is being processed.',
      request: {
        id: existing.id,
        requestReference: existing.request_reference,
        status: existing.status,
      },
    });
  }

  const requestId = `REQ-${Date.now().toString().slice(-6)}`;
  const requestReference = generateRequestReference();
  const now = new Date().toISOString();

  const requestRow = {
    id: requestReference,
    request_reference: requestReference,
    customer_id: req.user.id,
    customer_reference: normalizedCustomerReference,
    expense_date: expenseDate,
    amount_inr: normalizedAmount,
    description: normalizedDescription,
    status: 'New',
    dedupe_hash: dedupeHash,
    version: 0,
    created_at: now,
    updated_at: now,
  };

  const insertResult = db.prepare(`
    INSERT INTO requests (id, request_reference, customer_id, customer_reference, expense_date, amount_inr, description, status, dedupe_hash, version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(customer_reference, dedupe_hash) DO NOTHING
  `).run(
    requestRow.id,
    requestRow.request_reference,
    requestRow.customer_id,
    requestRow.customer_reference,
    requestRow.expense_date,
    requestRow.amount_inr,
    requestRow.description,
    requestRow.status,
    requestRow.dedupe_hash,
    requestRow.version,
    requestRow.created_at,
    requestRow.updated_at
  );

  if (insertResult.changes === 0) {
    const concurrentDuplicate = db
      .prepare('SELECT * FROM requests WHERE customer_reference = ? AND dedupe_hash = ?')
      .get(normalizedCustomerReference, dedupeHash);
    logEvent('request.duplicate_detected', {
      correlationId: req.correlationId,
      customerReference: normalizedCustomerReference,
      requestId: concurrentDuplicate.id,
    });
    return res.status(200).json({
      message: 'This request already exists and is being processed.',
      request: {
        id: concurrentDuplicate.id,
        requestReference: concurrentDuplicate.request_reference,
        status: concurrentDuplicate.status,
      },
    });
  }

  db.prepare(`
    INSERT INTO request_events (id, request_id, event_type, actor_type, actor_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `EVT-${Date.now()}`,
    requestRow.id,
    'Submitted',
    'Customer',
    req.user.id,
    JSON.stringify({ source: 'web-form' }),
    now
  );

  invalidateWorkflowReads();
  logEvent('request.submitted', {
    correlationId: req.correlationId,
    customerReference: normalizedCustomerReference,
    requestId: requestRow.id,
  });

  return res.status(201).json({
    message: 'Request submitted successfully.',
    request: {
      id: requestRow.id,
      requestReference: requestRow.request_reference,
      status: requestRow.status,
    },
  });
});

router.post('/:id/respond', requireAuth, requireRole('Customer'), (req, res) => {
  const { response, version } = req.body || {};
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  if (request.customer_id !== req.user.id) {
    return res.status(403).json({ message: 'You cannot respond to this request.' });
  }

  const normalizedResponse = typeof response === 'string' ? response.trim() : '';
  if (!normalizedResponse || !isValidRequestVersion(version)) {
    return res.status(400).json({ message: 'A response and valid request version are required.' });
  }

  if (!['MoreInformationRequested', 'AwaitingCustomerResponse'].includes(request.status)) {
    return res.status(409).json({ message: 'This request is not awaiting a customer response.' });
  }

  if (Number(version) !== Number(request.version)) {
    return res.status(409).json({ message: 'This request has been updated. Please refresh and try again.' });
  }

  const nextStatus = 'InReview';
  const now = new Date().toISOString();

  const submitResponse = db.transaction(() => {
    const update = db.prepare(`
      UPDATE requests SET status = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status IN ('MoreInformationRequested', 'AwaitingCustomerResponse')
    `).run(nextStatus, now, request.id, Number(version));

    if (update.changes !== 1) return false;

    db.prepare(`
      INSERT INTO request_events (id, request_id, event_type, actor_type, actor_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`EVT-${Date.now()}`, request.id, 'CustomerResponded', 'Customer', req.user.id, JSON.stringify({ response: normalizedResponse }), now);

    return true;
  }).immediate();

  if (!submitResponse) {
    return res.status(409).json({ message: 'This request has changed. Refresh and try again.' });
  }

  invalidateWorkflowReads();
  logEvent('request.customer_responded', {
    correlationId: req.correlationId,
    requestId: request.id,
    customerId: req.user.id,
    status: nextStatus,
  });

  return res.json({
    message: 'Your response was submitted and the review has resumed.',
    status: nextStatus,
  });
});

export default router;
