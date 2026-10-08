import express from 'express';
import db from '../../shared/db.js';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { cacheWorkflowRead, getCachedWorkflowRead, invalidateWorkflowReads } from '../../shared/services/workflowReadCache.js';
import { logEvent } from '../../shared/middleware/observability.js';
import { isValidRequestVersion } from '../../utils/workflowUtils.js';
import { AdvisoryAgentError, generateReviewAdvisory } from '../../agents/reimbursementAdvisory/index.js';

const router = express.Router();

router.post('/requests/:id/advisory', requireAuth, requireRole('Reviewer', 'Admin'), async (req, res) => {
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  const events = db.prepare('SELECT event_type, metadata, created_at FROM request_events WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const decisions = db.prepare('SELECT decision_type, explanation, created_at FROM review_decisions WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const candidates = db.prepare(`
    SELECT request_reference, expense_date, amount_inr, description, status
    FROM requests
    WHERE id != ? AND customer_reference = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(request.id, request.customer_reference);

  try {
    const result = await generateReviewAdvisory({
      request: {
        reference: request.request_reference,
        customerReference: request.customer_reference,
        expenseDate: request.expense_date,
        amountInr: request.amount_inr,
        description: request.description,
        status: request.status,
      },
      history: events,
      priorDecisions: decisions,
      candidates,
    });

    logEvent('review.advisory.generated', {
      correlationId: req.correlationId,
      requestId: request.id,
      reviewerId: req.user.id,
      engine: result.engine,
    });

    return res.json({
      ...result,
      generatedAt: new Date().toISOString(),
      notice: 'Rules-based advisory only. Verify these details against source records; the reviewer makes the decision.',
    });
  } catch (error) {
    logEvent('review.advisory.failed', {
      correlationId: req.correlationId,
      requestId: request.id,
      reviewerId: req.user.id,
      errorName: error.name,
    });
    const statusCode = error instanceof AdvisoryAgentError ? error.statusCode : 502;
    const message = error instanceof AdvisoryAgentError
      ? error.message
      : 'The advisory could not be generated.';
    return res.status(statusCode).json({ message });
  }
});

router.post('/requests/:id/start', requireAuth, requireRole('Reviewer', 'Admin'), (req, res) => {
  const { version } = req.body || {};
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  if (!isValidRequestVersion(version)) {
    return res.status(400).json({ message: 'A valid request version is required.' });
  }

  if (request.status !== 'New') {
    return res.status(409).json({ message: 'Only new requests can be started for review.' });
  }

  if (Number(version) !== Number(request.version)) {
    return res.status(409).json({ message: 'This request was updated by another reviewer. Please refresh and retry.' });
  }

  const now = new Date().toISOString();
  const startReview = db.transaction(() => {
    const update = db.prepare(`
      UPDATE requests SET status = 'InReview', version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'New'
    `).run(now, request.id, Number(version));

    if (update.changes !== 1) return false;

    db.prepare(`
      INSERT INTO request_events (id, request_id, event_type, actor_type, actor_id, metadata, created_at)
      VALUES (?, ?, 'StartedReview', 'Reviewer', ?, '{}', ?)
    `).run(`EVT-${Date.now()}`, request.id, req.user.id, now);

    return true;
  }).immediate();

  if (!startReview) {
    return res.status(409).json({ message: 'This request has changed. Refresh and try again.' });
  }

  invalidateWorkflowReads();
  logEvent('request.review_started', {
    correlationId: req.correlationId,
    requestId: request.id,
    reviewerId: req.user.id,
    status: 'InReview',
  });

  return res.json({ message: 'Review started successfully.', status: 'InReview' });
});

router.get('/requests', requireAuth, requireRole('Reviewer', 'Admin'), (req, res) => {
  const availableStatuses = ['New', 'InReview', 'AwaitingCustomerResponse', 'MoreInformationRequested'];
  const requestedStatuses = req.query.status === undefined
    ? null
    : Array.isArray(req.query.status) ? req.query.status : [req.query.status];

  if (requestedStatuses?.some((status) => !availableStatuses.includes(status))) {
    return res.status(400).json({ message: `Status filters must be one of: ${availableStatuses.join(', ')}.` });
  }

  const statusFilter = requestedStatuses?.length
    ? `AND status IN (${requestedStatuses.map(() => '?').join(', ')})`
    : '';
  const cacheKey = `reviewer-queue:${(requestedStatuses || availableStatuses).join(',')}`;
  const cachedRequests = getCachedWorkflowRead(cacheKey);
  if (cachedRequests) {
    res.setHeader('x-cache', 'HIT');
    return res.json({ requests: cachedRequests });
  }

  const requests = db
    .prepare(`
      SELECT * FROM requests
      WHERE status IN ('New', 'InReview', 'AwaitingCustomerResponse', 'MoreInformationRequested')
      ${statusFilter}
      ORDER BY created_at DESC
    `)
    .all(...(requestedStatuses || []));

  cacheWorkflowRead(cacheKey, requests);
  res.setHeader('x-cache', 'MISS');
  return res.json({ requests });
});

router.get('/requests/:id', requireAuth, requireRole('Reviewer', 'Admin'), (req, res) => {
  const cacheKey = `reviewer-detail:${req.user.role}:${req.params.id}`;
  const cachedRequest = getCachedWorkflowRead(cacheKey);
  if (cachedRequest) {
    res.setHeader('x-cache', 'HIT');
    return res.json({ request: cachedRequest });
  }

  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  const decisions = db.prepare('SELECT * FROM review_decisions WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const events = db.prepare('SELECT * FROM request_events WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
  const requestDetails = { ...request, decisions, events };

  cacheWorkflowRead(cacheKey, requestDetails);
  res.setHeader('x-cache', 'MISS');
  return res.json({ request: requestDetails });
});

router.post('/requests/:id/review', requireAuth, requireRole('Reviewer', 'Admin'), (req, res) => {
  const { decision, explanation, version } = req.body || {};
  const request = db.prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);

  if (!request) {
    return res.status(404).json({ message: 'Request not found.' });
  }

  if (request.status !== 'InReview') {
    return res.status(409).json({ message: 'Only requests in review can receive a decision.' });
  }

  if (typeof explanation !== 'string' || !explanation.trim()) {
    return res.status(400).json({ message: 'An explanation is required for each decision.' });
  }

  if (!isValidRequestVersion(version)) {
    return res.status(400).json({ message: 'A valid request version is required.' });
  }

  if (Number(version) !== Number(request.version)) {
    return res.status(409).json({ message: 'This request was updated by another reviewer. Please refresh and retry.' });
  }

  const normalizedDecision = String(decision || '').toLowerCase();
  const mapping = {
    approve: 'Approved',
    decline: 'Declined',
    'request-more-info': 'MoreInformationRequested',
    requestmoreinfo: 'MoreInformationRequested',
  };

  const nextStatus = mapping[normalizedDecision];

  if (!nextStatus) {
    return res.status(400).json({ message: 'Decision must be approve, decline, or request-more-info.' });
  }

  const now = new Date().toISOString();

  const recordDecision = db.transaction(() => {
    const update = db.prepare(`
      UPDATE requests SET status = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ? AND status = 'InReview'
    `).run(nextStatus, now, request.id, Number(version));

    if (update.changes !== 1) return false;

    db.prepare(`
      INSERT INTO review_decisions (id, request_id, reviewer_id, decision_type, explanation, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`REV-DEC-${Date.now()}`, request.id, req.user.id, normalizedDecision === 'approve' ? 'Approve' : normalizedDecision === 'decline' ? 'Decline' : 'RequestMoreInfo', explanation.trim(), now);

    db.prepare(`
      INSERT INTO request_events (id, request_id, event_type, actor_type, actor_id, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`EVT-${Date.now()}`, request.id, nextStatus, 'Reviewer', req.user.id, JSON.stringify({ explanation: explanation.trim() }), now);

    return true;
  }).immediate();

  if (!recordDecision) {
    return res.status(409).json({ message: 'This request has changed. Refresh and try again.' });
  }

  invalidateWorkflowReads();
  logEvent('request.decision_recorded', {
    correlationId: req.correlationId,
    requestId: request.id,
    reviewerId: req.user.id,
    status: nextStatus,
  });

  return res.json({
    message: 'Request decision recorded successfully.',
    status: nextStatus,
  });
});

export default router;
