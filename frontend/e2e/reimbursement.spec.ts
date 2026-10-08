import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const screenshotDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-artifacts/playwright');
const password = 'Password123!';

test.beforeAll(async () => {
  await fs.mkdir(screenshotDirectory, { recursive: true });
});

function screenshotPath(name: string) {
  return path.join(screenshotDirectory, `${name}.png`);
}

async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();
}

async function apiLogin(request: APIRequestContext, email: string) {
  const response = await request.post('/api/auth/login', { data: { email, password } });
  expect(response.status()).toBe(200);
  return (await response.json()) as { token: string; user: { role: string } };
}

test('health, authentication, role access, and customer review note', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  const healthResult = await health.json();
  expect(healthResult.status).toBe('ok');
  expect(healthResult.database).toContain('reimbursement-playwright-');

  const missingCredentials = await request.post('/api/auth/login', { data: { email: 'customer1@example.com' } });
  const invalidCredentials = await request.post('/api/auth/login', { data: { email: 'customer1@example.com', password: 'bad-password' } });
  expect(missingCredentials.status()).toBe(400);
  expect(invalidCredentials.status()).toBe(401);

  const customer = await apiLogin(request, 'customer1@example.com');
  const reviewer = await apiLogin(request, 'reviewer1@example.com');
  const otherCustomer = await apiLogin(request, 'customer2@example.com');
  const admin = await apiLogin(request, 'admin@example.com');

  expect((await request.get('/api/auth/me')).status()).toBe(401);
  expect((await request.get('/api/auth/me', { headers: { Authorization: 'Bearer invalid-token' } })).status()).toBe(401);
  expect((await request.get('/api/requests/my', { headers: { Authorization: `Bearer ${customer.token}` } })).status()).toBe(200);
  expect((await request.get('/api/requests/my', { headers: { Authorization: `Bearer ${reviewer.token}` } })).status()).toBe(403);
  expect((await request.get('/api/reviewer/requests', { headers: { Authorization: `Bearer ${customer.token}` } })).status()).toBe(403);
  expect((await request.get('/api/reviewer/requests', { headers: { Authorization: `Bearer ${reviewer.token}` } })).status()).toBe(200);
  expect((await request.get('/api/reviewer/requests', { headers: { Authorization: `Bearer ${admin.token}` } })).status()).toBe(200);

  const reviewerSubmission = await request.post('/api/requests', {
    headers: { Authorization: `Bearer ${reviewer.token}` },
    data: { customerReference: 'ROLE-CHECK', expenseDate: '2026-10-07', amountInr: 1, description: 'Role test' },
  });
  const customerSeed = await request.post('/api/admin/seed-demo-data', {
    headers: { Authorization: `Bearer ${customer.token}` },
  });
  expect(reviewerSubmission.status()).toBe(403);
  expect(customerSeed.status()).toBe(403);

  const customer3 = await apiLogin(request, 'customer3@example.com');
  const customerRequests = await request.get('/api/requests/my', {
    headers: { Authorization: `Bearer ${customer3.token}` },
  });
  const moreInfoRequest = (await customerRequests.json()).requests.find((item: { id: string }) => item.id === 'REQ-000103');
  expect(moreInfoRequest.status).toBe('MoreInformationRequested');
  expect(moreInfoRequest.latest_review_explanation).toMatch(/invoice and attendee confirmation/i);

  await page.goto('/');
  await page.screenshot({ path: screenshotPath('01-login'), fullPage: true });
  await login(page, 'customer3@example.com');
  await expect(page.getByText('MoreInformationRequested')).toBeVisible();
  await expect(page.getByText(/Reviewer note:.*invoice and attendee confirmation/i)).toBeVisible();
  await page.getByLabel('Track by request reference').fill('REQ-000103');
  await page.getByRole('button', { name: 'Find request' }).click();
  await expect(page.getByRole('region', { name: 'Request history' })).toContainText('MoreInformationRequested');
  await expect(page.getByRole('region', { name: 'Request history' })).toContainText('Submitted');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: screenshotPath('02-customer-more-info-mobile'), fullPage: true });

  const refreshTokenBefore = await page.evaluate(() => localStorage.getItem('refreshToken'));
  await page.evaluate(() => localStorage.setItem('token', 'expired-access-token'));
  await page.reload();
  await expect(page.getByText('MoreInformationRequested')).toBeVisible();
  const refreshTokenAfter = await page.evaluate(() => localStorage.getItem('refreshToken'));
  expect(refreshTokenAfter).not.toBe(refreshTokenBefore);
});

test('customer request validation, creation, duplicate detection, and ownership', async ({ page, request }) => {
  const customer = await apiLogin(request, 'customer1@example.com');
  const reviewer = await apiLogin(request, 'reviewer1@example.com');
  const otherCustomer = await apiLogin(request, 'customer2@example.com');
  const auth = { Authorization: `Bearer ${customer.token}` };

  const incomplete = await request.post('/api/requests', {
    headers: auth,
    data: { customerReference: 'INCOMPLETE' },
  });
  expect(incomplete.status()).toBe(400);

  const customerReference = `PW-${Date.now()}`;
  const description = 'Playwright claim for duplicate detection';
  await login(page, 'customer1@example.com');
  await page.getByLabel('Customer reference').fill(customerReference);
  await page.getByLabel('Expense date').fill('2026-10-06');
  await page.getByLabel('Amount in INR').fill('875.5');
  await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: 'Submit request' }).click();

  const statusMessage = page.locator('.status-box');
  await expect(statusMessage).toContainText('Request submitted successfully');
  const firstReference = (await statusMessage.innerText()).match(/REQ-[A-Z0-9-]+/)?.[0];
  expect(firstReference).toBeTruthy();
  const requestRow = page.locator('.item-list li').filter({ hasText: firstReference! });
  await expect(requestRow).toContainText('New');
  await page.screenshot({ path: screenshotPath('03-customer-request-created'), fullPage: true });

  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(statusMessage).toContainText('already exists');
  await expect(page.locator('.item-list li').filter({ hasText: firstReference! })).toHaveCount(1);
  await page.screenshot({ path: screenshotPath('04-duplicate-detected'), fullPage: true });

  expect((await request.get(`/api/requests/${firstReference}`, { headers: auth })).status()).toBe(200);
  expect((await request.get(`/api/requests/${firstReference}`, { headers: { Authorization: `Bearer ${reviewer.token}` } })).status()).toBe(200);
  expect((await request.get(`/api/requests/${firstReference}`, { headers: { Authorization: `Bearer ${otherCustomer.token}` } })).status()).toBe(403);
  expect((await request.get('/api/requests/REQ-NOT-FOUND', { headers: { Authorization: `Bearer ${reviewer.token}` } })).status()).toBe(404);
});

test('reviewer requests more information, customer responds, reviewer approves', async ({ browser, request }) => {
  const customer = await apiLogin(request, 'customer1@example.com');
  const reviewer = await apiLogin(request, 'reviewer1@example.com');
  const otherCustomer = await apiLogin(request, 'customer2@example.com');
  const customerAuth = { Authorization: `Bearer ${customer.token}` };

  const created = await request.post('/api/requests', {
    headers: customerAuth,
    data: {
      customerReference: `PW-INFO-${Date.now()}`,
      expenseDate: '2026-10-05',
      amountInr: 1250,
      description: 'Playwright more-info workflow',
    },
  });
  expect(created.status()).toBe(201);
  const newRequest = (await created.json()).request as { id: string; requestReference: string };

  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await login(reviewerPage, 'reviewer1@example.com');
  await reviewerPage.getByLabel('Filter by status').selectOption('New');
  const queueSelection = reviewerPage.getByRole('button', { name: `${newRequest.requestReference} · New` });
  await expect(queueSelection).toBeVisible();
  await queueSelection.click();
  await reviewerPage.getByRole('button', { name: 'Start review' }).click();
  await expect(reviewerPage.locator('.status-box')).toContainText('Review started successfully');

  const invalidDecision = await request.post(`/api/reviewer/requests/${newRequest.id}/review`, {
    headers: { Authorization: `Bearer ${reviewer.token}` },
    data: { decision: 'maybe', explanation: 'Invalid', version: 1 },
  });
  const staleDecision = await request.post(`/api/reviewer/requests/${newRequest.id}/review`, {
    headers: { Authorization: `Bearer ${reviewer.token}` },
    data: { decision: 'approve', explanation: 'Stale version', version: 0 },
  });
  expect(invalidDecision.status()).toBe(400);
  expect(staleDecision.status()).toBe(409);

  await reviewerPage.getByLabel('Decision').selectOption('request-more-info');
  await reviewerPage.getByLabel('Explanation').fill('Please attach the itemized receipt.');
  await reviewerPage.getByRole('button', { name: 'Submit decision' }).click();
  await expect(reviewerPage.locator('.status-box')).toContainText('Request decision recorded successfully');
  await reviewerPage.screenshot({ path: screenshotPath('05-reviewer-more-info-request'), fullPage: true });

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await login(customerPage, 'customer1@example.com');
  const customerRow = customerPage.locator('.item-list li').filter({ hasText: newRequest.requestReference });
  await expect(customerRow).toContainText('MoreInformationRequested');
  await expect(customerRow).toContainText('Please attach the itemized receipt.');
  await customerPage.setViewportSize({ width: 390, height: 844 });
  await customerPage.screenshot({ path: screenshotPath('06-customer-reply-prompt'), fullPage: true });

  const staleResponse = await request.post(`/api/requests/${newRequest.id}/respond`, {
    headers: customerAuth,
    data: { response: 'Receipt attached.', version: 0 },
  });
  const wrongOwnerResponse = await request.post(`/api/requests/${newRequest.id}/respond`, {
    headers: { Authorization: `Bearer ${otherCustomer.token}` },
    data: { response: 'Not my request.', version: 1 },
  });
  expect(staleResponse.status()).toBe(409);
  expect(wrongOwnerResponse.status()).toBe(403);

  await customerRow.getByLabel('Additional information').fill('The itemized receipt is attached to this claim.');
  await customerRow.getByRole('button', { name: 'Send response' }).click();
  await expect(customerPage.locator('.status-box')).toContainText('Your response was submitted');
  await expect(customerRow).toContainText('InReview');
  await customerPage.screenshot({ path: screenshotPath('07-customer-response-submitted'), fullPage: true });

  const responseDetails = await request.get(`/api/requests/${newRequest.requestReference}`, { headers: customerAuth });
  const responseRecord = (await responseDetails.json()).request;
  expect(responseRecord.version).toBe(3);
  expect(responseRecord.events.some((event: { event_type: string }) => event.event_type === 'CustomerResponded')).toBe(true);

  await reviewerPage.reload();
  await expect(reviewerPage.getByRole('button', { name: `${newRequest.requestReference} · InReview` })).toBeVisible();
  await reviewerPage.getByRole('button', { name: `${newRequest.requestReference} · InReview` }).click();
  await reviewerPage.getByLabel('Decision').selectOption('approve');
  await reviewerPage.getByLabel('Explanation').fill('Receipt reviewed and approved.');
  await reviewerPage.getByRole('button', { name: 'Submit decision' }).click();
  await expect(reviewerPage.locator('.status-box')).toContainText('Request decision recorded successfully');

  const approved = await request.get(`/api/requests/${newRequest.requestReference}`, { headers: customerAuth });
  expect((await approved.json()).request.status).toBe('Approved');
  await reviewerPage.screenshot({ path: screenshotPath('08-reviewer-approved'), fullPage: true });
  await reviewerContext.close();
  await customerContext.close();
});

test('reviewer can decline and admin-only demo seeding is enforced', async ({ browser, request }) => {
  const customer = await apiLogin(request, 'customer1@example.com');
  const reviewer = await apiLogin(request, 'reviewer1@example.com');
  const admin = await apiLogin(request, 'admin@example.com');

  const created = await request.post('/api/requests', {
    headers: { Authorization: `Bearer ${customer.token}` },
    data: {
      customerReference: `PW-DECLINE-${Date.now()}`,
      expenseDate: '2026-10-04',
      amountInr: 300,
      description: 'Playwright decline workflow',
    },
  });
  expect(created.status()).toBe(201);
  const newRequest = (await created.json()).request as { id: string; requestReference: string };

  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await login(reviewerPage, 'reviewer1@example.com');
  await reviewerPage.getByRole('button', { name: `${newRequest.requestReference} · New` }).click();
  await reviewerPage.getByRole('button', { name: 'Start review' }).click();
  await expect(reviewerPage.locator('.status-box')).toContainText('Review started successfully');
  await reviewerPage.getByLabel('Decision').selectOption('decline');
  await reviewerPage.getByLabel('Explanation').fill('The expense is outside policy.');
  await reviewerPage.getByRole('button', { name: 'Submit decision' }).click();
  await expect(reviewerPage.locator('.status-box')).toContainText('Request decision recorded successfully');

  const details = await request.get(`/api/requests/${newRequest.requestReference}`, {
    headers: { Authorization: `Bearer ${customer.token}` },
  });
  expect((await details.json()).request.status).toBe('Declined');
  await reviewerPage.screenshot({ path: screenshotPath('09-reviewer-declined'), fullPage: true });

  expect((await request.post('/api/admin/seed-demo-data', {
    headers: { Authorization: `Bearer ${reviewer.token}` },
  })).status()).toBe(403);
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'admin@example.com');
  await expect(adminPage.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(adminPage.locator('.admin-users-panel')).toContainText('admin@example.com');
  await expect(adminPage.locator('.admin-users-panel')).toContainText('reviewer1@example.com');
  await expect(adminPage.getByRole('button', { name: 'Seed demo data' })).toBeVisible();
  await adminPage.getByRole('button', { name: 'Seed demo data' }).click();
  await expect(adminPage.locator('.status-box')).toContainText('Demo data was loaded successfully');
  await adminPage.screenshot({ path: screenshotPath('10-admin-seed'), fullPage: true });
  expect((await request.post('/api/admin/seed-demo-data', {
    headers: { Authorization: `Bearer ${admin.token}` },
  })).status()).toBe(200);
  await adminPage.getByRole('button', { name: 'Logout' }).click();
  await expect(adminPage.getByRole('button', { name: 'Login' })).toBeVisible();
  await adminContext.close();
  await reviewerContext.close();
});

test('reviewer can generate a rules-based advisory without changing a request', async ({ browser, request }) => {
  const customer = await apiLogin(request, 'customer1@example.com');
  const reviewer = await apiLogin(request, 'reviewer1@example.com');
  const created = await request.post('/api/requests', {
    headers: { Authorization: `Bearer ${customer.token}` },
    data: {
      customerReference: `PW-ADVISORY-${Date.now()}`,
      expenseDate: '2026-10-07',
      amountInr: 1800,
      description: 'Travel to customer planning meeting in Bengaluru',
    },
  });
  expect(created.status()).toBe(201);
  const newRequest = (await created.json()).request as { id: string; requestReference: string };
  const reviewerAuth = { Authorization: `Bearer ${reviewer.token}` };
  const beforeResponse = await request.get(`/api/reviewer/requests/${newRequest.id}`, { headers: reviewerAuth });
  const before = (await beforeResponse.json()).request;

  const reviewerContext = await browser.newContext();
  const reviewerPage = await reviewerContext.newPage();
  await login(reviewerPage, 'reviewer1@example.com');
  await reviewerPage.getByRole('button', { name: `${newRequest.requestReference} · New` }).click();
  const advisoryRegion = reviewerPage.getByRole('region', { name: 'Review advisory' });
  await expect(advisoryRegion.getByRole('heading', { name: 'Advisory agent' })).toBeVisible();
  await advisoryRegion.getByRole('button', { name: 'Generate advisory' }).click();
  await expect(advisoryRegion.locator('.advisory-results')).toContainText(newRequest.requestReference);
  await expect(advisoryRegion.locator('.advisory-results')).toContainText('python-rules-v1');
  await expect(advisoryRegion).toContainText('reviewer makes the decision');
  await expect(reviewerPage.getByRole('button', { name: 'Start review' })).toBeVisible();

  const afterResponse = await request.get(`/api/reviewer/requests/${newRequest.id}`, { headers: reviewerAuth });
  const after = (await afterResponse.json()).request;
  expect(after.status).toBe(before.status);
  expect(after.version).toBe(before.version);
  expect(after.decisions).toHaveLength(before.decisions.length);
  expect(after.events).toHaveLength(before.events.length);
  await reviewerContext.close();
});