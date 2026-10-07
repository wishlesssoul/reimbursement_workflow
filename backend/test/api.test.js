import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'reimbursement-tests-'));
process.env.DB_PATH = path.join(testDirectory, 'test.db');
process.env.JWT_SECRET = 'test-only-secret';

const [{ default: app }, { seedDatabase }, { default: db }] = await Promise.all([
  import('../src/app.js'),
  import('../src/services/seedService.js'),
  import('../src/db.js'),
]);

let server;
let baseUrl;
const tokens = {};

before(async () => {
  seedDatabase();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const [role, email] of [
    ['customer', 'customer1@example.com'],
    ['otherCustomer', 'customer2@example.com'],
    ['moreInfoCustomer', 'customer3@example.com'],
    ['reviewer', 'reviewer1@example.com'],
    ['reviewer2', 'reviewer2@example.com'],
    ['admin', 'admin@example.com'],
  ]) {
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'Password123!' },
    });
    assert.equal(response.status, 200);
    tokens[role] = response.body.token;
  }
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  db.close();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

async function request(route, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const responseBody = await response.json();
  return { status: response.status, body: responseBody, headers: Object.fromEntries(response.headers.entries()) };
}

async function createRequest(overrides = {}) {
  return request('/api/requests', {
    method: 'POST',
    token: tokens.customer,
    body: {
      customerReference: `TEST-${Date.now()}-${Math.random()}`,
      expenseDate: '2026-10-07',
      amountInr: 2500,
      description: 'POC test travel expense',
      ...overrides,
    },
  });
}

test('health, authentication, and role authorization', async (t) => {
  await t.test('health endpoint responds', async () => {
    const response = await request('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'ok');
    assert.match(response.headers['x-correlation-id'], /^[0-9a-f-]{36}$/i);
  });

  await t.test('login validates credentials and returns the user role', async () => {
    const missing = await request('/api/auth/login', { method: 'POST', body: { email: 'customer1@example.com' } });
    const invalid = await request('/api/auth/login', { method: 'POST', body: { email: 'customer1@example.com', password: 'wrong' } });
    const valid = await request('/api/auth/login', { method: 'POST', body: { email: 'customer1@example.com', password: 'Password123!' } });

    assert.equal(missing.status, 400);
    assert.equal(invalid.status, 401);
    assert.equal(valid.status, 200);
    assert.equal(valid.body.user.role, 'Customer');
    assert.ok(valid.body.token);
    assert.ok(valid.body.refreshToken);

    const rotated = await request('/api/auth/refresh', {
      method: 'POST', body: { refreshToken: valid.body.refreshToken },
    });
    assert.equal(rotated.status, 200);
    assert.notEqual(rotated.body.refreshToken, valid.body.refreshToken);
    assert.equal((await request('/api/auth/refresh', {
      method: 'POST', body: { refreshToken: valid.body.refreshToken },
    })).status, 401);

    const logout = await request('/api/auth/logout', {
      method: 'POST', body: { refreshToken: rotated.body.refreshToken },
    });
    assert.equal(logout.status, 200);
    assert.equal((await request('/api/auth/refresh', {
      method: 'POST', body: { refreshToken: rotated.body.refreshToken },
    })).status, 401);
    assert.equal((await request('/api/auth/refresh', { method: 'POST', body: {} })).status, 400);
  });

  await t.test('protected endpoints reject missing and malformed tokens', async () => {
    const missing = await request('/api/auth/me');
    const invalid = await request('/api/auth/me', { token: 'not-a-valid-token' });
    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
  });

  await t.test('customer and reviewer routes enforce roles', async () => {
    assert.equal((await request('/api/requests/my', { token: tokens.customer })).status, 200);
    assert.equal((await request('/api/requests/my', { token: tokens.reviewer })).status, 403);
    assert.equal((await request('/api/requests', {
      method: 'POST', token: tokens.reviewer,
      body: { customerReference: 'ROLE-CHECK', expenseDate: '2026-10-07', amountInr: 1, description: 'Not a customer' },
    })).status, 403);
    assert.equal((await request('/api/reviewer/requests', { token: tokens.customer })).status, 403);
    assert.equal((await request('/api/reviewer/requests', { token: tokens.reviewer })).status, 200);
    assert.equal((await request('/api/reviewer/requests', { token: tokens.admin })).status, 200);
    const filteredQueue = await request('/api/reviewer/requests?status=New', { token: tokens.reviewer });
    assert.equal(filteredQueue.status, 200);
    assert.equal(filteredQueue.headers['x-cache'], 'MISS');
    assert.ok(filteredQueue.body.requests.every((item) => item.status === 'New'));
    assert.equal((await request('/api/reviewer/requests?status=New', { token: tokens.reviewer })).headers['x-cache'], 'HIT');
    assert.equal((await request('/api/reviewer/requests?status=Approved', { token: tokens.reviewer })).status, 400);
    assert.equal((await request('/api/admin/seed-demo-data', { method: 'POST', token: tokens.customer })).status, 403);
  });

  await t.test('customer request list includes the latest reviewer explanation', async () => {
    const response = await request('/api/requests/my', { token: tokens.moreInfoCustomer });
    const moreInfoRequest = response.body.requests.find((item) => item.id === 'REQ-000103');

    assert.ok(moreInfoRequest);
    assert.equal(moreInfoRequest.status, 'MoreInformationRequested');
    assert.match(moreInfoRequest.latest_review_explanation, /invoice and attendee confirmation/i);
  });

  await t.test('admin user directory is role protected and omits password hashes', async () => {
    assert.equal((await request('/api/admin/users', { token: tokens.customer })).status, 403);
    assert.equal((await request('/api/admin/users', { token: tokens.reviewer })).status, 403);
    assert.equal((await request('/api/admin/health', { token: tokens.reviewer })).status, 403);
    const response = await request('/api/admin/users', { token: tokens.admin });
    assert.equal(response.status, 200);
    assert.ok(response.body.users.some((user) => user.email === 'admin@example.com'));
    assert.ok(response.body.users.every((user) => !('password_hash' in user)));
  });
});

test('customer request submission, duplicate detection, and ownership', async (t) => {
  const payload = {
    customerReference: `DEDUPE-${Date.now()}`,
    expenseDate: '2026-10-06',
    amountInr: 875.5,
    description: 'Airport transfer for business trip',
  };

  await t.test('requires all request fields', async () => {
    const response = await request('/api/requests', {
      method: 'POST',
      token: tokens.customer,
      body: { customerReference: 'INCOMPLETE' },
    });
    assert.equal(response.status, 400);
  });

  await t.test('rejects invalid expense dates and non-positive or non-numeric amounts', async () => {
    const invalidValues = [
      { expenseDate: 'not-a-date' },
      { amountInr: 0 },
      { amountInr: -5 },
      { amountInr: 'not-a-number' },
    ];

    for (const invalid of invalidValues) {
      const response = await request('/api/requests', {
        method: 'POST', token: tokens.customer,
        body: { ...payload, customerReference: `INVALID-${Math.random()}`, ...invalid },
      });
      assert.equal(response.status, 400);
    }
  });

  let reference;
  await t.test('creates a new request', async () => {
    const response = await request('/api/requests', { method: 'POST', token: tokens.customer, body: payload });
    assert.equal(response.status, 201);
    assert.equal(response.body.request.status, 'New');
    assert.ok(response.body.request.requestReference);
    reference = response.body.request.requestReference;
  });

  await t.test('returns the existing request for a duplicate submission', async () => {
    const response = await request('/api/requests', { method: 'POST', token: tokens.customer, body: payload });
    assert.equal(response.status, 200);
    assert.match(response.body.message, /already exists/i);
    assert.equal(response.body.request.requestReference, reference);
  });

  await t.test('coalesces simultaneous duplicate submissions', async () => {
    const concurrentPayload = {
      ...payload,
      customerReference: `CONCURRENT-${Date.now()}`,
    };
    const responses = await Promise.all([
      request('/api/requests', { method: 'POST', token: tokens.customer, body: concurrentPayload }),
      request('/api/requests', { method: 'POST', token: tokens.customer, body: concurrentPayload }),
    ]);

    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    assert.equal(responses[0].body.request.requestReference, responses[1].body.request.requestReference);
  });

  await t.test('allows owner and reviewer access but denies another customer', async () => {
    assert.equal((await request(`/api/requests/${reference}`, { token: tokens.customer })).status, 200);
    assert.equal((await request(`/api/requests/${reference}`, { token: tokens.reviewer })).status, 200);
    assert.equal((await request(`/api/requests/${reference}`, { token: tokens.otherCustomer })).status, 403);
    assert.equal((await request('/api/requests/REQ-NOT-FOUND', { token: tokens.reviewer })).status, 404);
  });

  await t.test('caches request lists and invalidates cached data after submission', async () => {
    const firstRead = await request('/api/requests/my', { token: tokens.customer });
    const cachedRead = await request('/api/requests/my', { token: tokens.customer });
    assert.equal(firstRead.headers['x-cache'], 'MISS');
    assert.equal(cachedRead.headers['x-cache'], 'HIT');

    const addedRequest = await createRequest({ customerReference: `CACHE-${Date.now()}` });
    assert.equal(addedRequest.status, 201);

    const refreshedRead = await request('/api/requests/my', { token: tokens.customer });
    assert.equal(refreshedRead.headers['x-cache'], 'MISS');
    assert.ok(refreshedRead.body.requests.some((item) => item.id === addedRequest.body.request.id));
  });
});

test('review decisions, version checks, and customer response', async (t) => {
  const created = await createRequest();
  assert.equal(created.status, 201);
  const requestId = created.body.request.id;

  await t.test('starts review and rejects invalid decisions and stale versions', async () => {
    const missingVersion = await request(`/api/reviewer/requests/${requestId}/start`, {
      method: 'POST', token: tokens.reviewer, body: {},
    });
    assert.equal(missingVersion.status, 400);

    const queueBeforeStart = await request('/api/reviewer/requests?status=New', { token: tokens.reviewer });
    assert.equal(queueBeforeStart.headers['x-cache'], 'MISS');
    assert.equal((await request('/api/reviewer/requests?status=New', { token: tokens.reviewer })).headers['x-cache'], 'HIT');

    const started = await request(`/api/reviewer/requests/${requestId}/start`, {
      method: 'POST', token: tokens.reviewer, body: { version: 0 },
    });
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'InReview');

    const queueAfterStart = await request('/api/reviewer/requests?status=New', { token: tokens.reviewer });
    assert.equal(queueAfterStart.headers['x-cache'], 'MISS');
    assert.ok(!queueAfterStart.body.requests.some((item) => item.id === requestId));

    const invalid = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'maybe', explanation: 'Invalid option', version: 1 },
    });
    assert.equal(invalid.status, 400);

    const stale = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'approve', explanation: 'Stale decision', version: 0 },
    });
    assert.equal(stale.status, 409);

    const missingExplanation = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'approve', explanation: ' ', version: 1 },
    });
    assert.equal(missingExplanation.status, 400);
  });

  await t.test('records request for more information and increments the version', async () => {
    const response = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'request-more-info', explanation: 'Please attach the receipt.', version: 1 },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'MoreInformationRequested');

    const details = await request(`/api/requests/${created.body.request.requestReference}`, { token: tokens.customer });
    assert.equal(details.body.request.version, 2);
    assert.equal(details.body.request.decisions.length, 1);
    const cachedDetails = await request(`/api/requests/${created.body.request.requestReference}`, { token: tokens.customer });
    assert.equal(cachedDetails.headers['x-cache'], 'HIT');
  });

  await t.test('customer can respond at the current version and stale responses conflict', async () => {
    const emptyResponse = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.customer, body: { response: ' ', version: 2 },
    });
    assert.equal(emptyResponse.status, 400);
    const nullVersion = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.customer, body: { response: 'Receipt attached.', version: null },
    });
    assert.equal(nullVersion.status, 400);

    const stale = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.customer, body: { response: 'Receipt attached.', version: 1 },
    });
    assert.equal(stale.status, 409);

    const wrongOwner = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.otherCustomer, body: { response: 'Not my request.', version: 2 },
    });
    assert.equal(wrongOwner.status, 403);

    const accepted = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.customer, body: { response: 'Receipt attached.', version: 2 },
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'InReview');

    const updated = await request(`/api/requests/${created.body.request.requestReference}`, { token: tokens.customer });
    assert.equal(updated.body.request.version, 3);
    assert.equal(updated.headers['x-cache'], 'MISS');
    assert.ok(updated.body.request.events.some((event) => event.event_type === 'CustomerResponded'));
  });

  await t.test('final approval records the terminal status', async () => {
    const approved = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'approve', explanation: 'Receipt reviewed.', version: 3 },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, 'Approved');

    const terminalDecision = await request(`/api/reviewer/requests/${requestId}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'decline', explanation: 'Cannot reverse a final decision.', version: 4 },
    });
    const terminalResponse = await request(`/api/requests/${requestId}/respond`, {
      method: 'POST', token: tokens.customer,
      body: { response: 'Cannot respond after approval.', version: 4 },
    });
    assert.equal(terminalDecision.status, 409);
    assert.equal(terminalResponse.status, 409);
  });

  await t.test('decline records the declined status', async () => {
    const declineRequest = await createRequest({ description: 'POC test expense to decline' });
    const started = await request(`/api/reviewer/requests/${declineRequest.body.request.id}/start`, {
      method: 'POST', token: tokens.reviewer, body: { version: 0 },
    });
    assert.equal(started.status, 200);
    const declined = await request(`/api/reviewer/requests/${declineRequest.body.request.id}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'decline', explanation: 'The expense is outside policy.', version: 1 },
    });
    assert.equal(declined.status, 200);
    assert.equal(declined.body.status, 'Declined');
  });

  await t.test('accepts only one competing decision for the same version', async () => {
    const concurrentRequest = await createRequest({ description: 'POC concurrent review test' });
    await request(`/api/reviewer/requests/${concurrentRequest.body.request.id}/start`, {
      method: 'POST', token: tokens.reviewer, body: { version: 0 },
    });

    const decisions = await Promise.all([
      request(`/api/reviewer/requests/${concurrentRequest.body.request.id}/review`, {
        method: 'POST', token: tokens.reviewer,
        body: { decision: 'approve', explanation: 'First competing decision.', version: 1 },
      }),
      request(`/api/reviewer/requests/${concurrentRequest.body.request.id}/review`, {
        method: 'POST', token: tokens.reviewer2,
        body: { decision: 'decline', explanation: 'Second competing decision.', version: 1 },
      }),
    ]);
    const reviewerConflict = await request(`/api/reviewer/requests/${concurrentRequest.body.request.id}/review`, {
      method: 'POST', token: tokens.reviewer,
      body: { decision: 'decline', explanation: 'Competing reviewer action.', version: 1 },
    });

    assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
    assert.equal(reviewerConflict.status, 409);
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM review_decisions WHERE request_id = ?').get(concurrentRequest.body.request.id).count,
      1
    );
  });
});

test('admin-only demo data seeding', async () => {
  const customerResponse = await request('/api/admin/seed-demo-data', { method: 'POST', token: tokens.customer });
  const reviewerResponse = await request('/api/admin/seed-demo-data', { method: 'POST', token: tokens.reviewer });
  const adminResponse = await request('/api/admin/seed-demo-data', { method: 'POST', token: tokens.admin });

  assert.equal(customerResponse.status, 403);
  assert.equal(reviewerResponse.status, 403);
  assert.equal(adminResponse.status, 200);
});