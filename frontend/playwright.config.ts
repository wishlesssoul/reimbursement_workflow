import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(frontendRoot, '../backend');
const testDatabase = path.join(os.tmpdir(), `reimbursement-playwright-${process.pid}-${Date.now()}.db`);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'node src/server.js',
      cwd: backendRoot,
      url: 'http://127.0.0.1:3002/api/health',
      reuseExistingServer: false,
      env: {
        PORT: '3002',
        DB_PATH: testDatabase,
        JWT_SECRET: 'playwright-test-secret',
      },
    },
    {
      command: 'npm run dev -- --config vite.playwright.config.ts --host 127.0.0.1 --port 5174',
      cwd: frontendRoot,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: {
        API_PROXY_TARGET: 'http://127.0.0.1:3002',
      },
    },
  ],
});