import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function startServer(port, databasePath) {
  return spawn(process.execPath, ['src/server.js'], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: databasePath,
      JWT_SECRET: 'persistence-test-secret',
    },
    stdio: 'ignore',
  });
}

async function waitForHealth(server, baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend exited before becoming healthy (${server.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Backend did not become healthy in time.');
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', resolve);
    if (!server.kill()) reject(new Error('Could not stop the test backend process.'));
  });
}

async function login(baseUrl) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer1@example.com', password: 'Password123!' }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

test('requests persist across backend process restarts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'reimbursement-persistence-'));
  const databasePath = path.join(directory, 'persisted.db');
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server = startServer(port, databasePath);

  try {
    await waitForHealth(server, baseUrl);
    const token = await login(baseUrl);
    const reference = `PERSIST-${Date.now()}`;
    const submission = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        customerReference: reference,
        expenseDate: '2026-10-07',
        amountInr: 1700,
        description: 'Persistence across restart test',
      }),
    });
    assert.equal(submission.status, 201);
    const submittedRequest = (await submission.json()).request;

    await stopServer(server);
    server = startServer(port, databasePath);
    await waitForHealth(server, baseUrl);

    const restartedToken = await login(baseUrl);
    const retrieved = await fetch(`${baseUrl}/api/requests/${submittedRequest.requestReference}`, {
      headers: { Authorization: `Bearer ${restartedToken}` },
    });
    assert.equal(retrieved.status, 200);
    const persistedRequest = (await retrieved.json()).request;
    assert.equal(persistedRequest.customer_reference, reference);
    assert.equal(persistedRequest.description, 'Persistence across restart test');
    assert.equal(persistedRequest.status, 'New');
  } finally {
    await stopServer(server);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});