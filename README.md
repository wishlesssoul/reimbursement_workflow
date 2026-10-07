# Reimbursement Review POC

A modular reimbursement workflow demo with a React/TypeScript frontend, Express API, SQLite persistence, role-based access, and browser/API tests.

## Requirements

- Node.js 22 or later
- npm

## Install

Run these commands from separate terminal sessions or from the workspace root:

```powershell
Set-Location backend
npm ci
```

```powershell
Set-Location frontend
npm ci
```

Install the Playwright Chromium browser once before running browser tests:

```powershell
npx playwright install chromium
```

## Run locally

Start the backend in one terminal:

```powershell
Set-Location backend
npm start
```

The API listens on `http://localhost:3001`. It creates and seeds `backend/data/reimbursement.db` on first startup.

Start the frontend in another terminal:

```powershell
Set-Location frontend
npm run dev
```

Open <http://localhost:5173/>. Vite proxies `/api` calls to the backend on port 3001.

To stop the app, stop both terminal processes with `Ctrl+C`.

## Demo accounts

All seeded accounts use the fictional demo password `Password123!`.

| Role | Email | Demo use |
| --- | --- | --- |
| Customer | `customer1@example.com` | Submit claims and track requests |
| Customer | `customer3@example.com` | See the seeded more-information request `REQ-000103` |
| Reviewer | `reviewer1@example.com` | Filter the queue and review claims |
| Admin | `admin@example.com` | Inspect users and invoke the idempotent seed endpoint |

The full fictional seed set is maintained in [docs/seed-data.md](docs/seed-data.md).

## Main workflows

- Customers submit reimbursement requests and receive a request reference.
- Customers view status/history, and reply to a reviewer’s request for more information.
- Reviewers filter the open queue, start a review, and approve, decline, or request more information with an explanation.
- Admins can view the seeded user directory and invoke the seed endpoint. Seed data is loaded automatically on first backend startup; the endpoint does not reset existing data.
- Duplicate submissions resolve to the existing request. Version checks prevent stale or competing workflow updates.

## Verification

Backend API tests, including workflow rules, cache invalidation, authentication refresh/revocation, concurrency, and persistence across a backend restart:

```powershell
Set-Location backend
npm test
```

Frontend TypeScript check and production build:

```powershell
Set-Location frontend
npm run build
```

Playwright browser workflows:

```powershell
Set-Location frontend
npm run test:e2e
```

Playwright starts its own backend and frontend on ports 3002 and 5174, uses a temporary SQLite database, and does not use the local demo database. It saves screenshots under [test-artifacts/playwright](test-artifacts/playwright/01-login.png). The test scenarios and runner configuration are in [frontend/e2e/reimbursement.spec.ts](frontend/e2e/reimbursement.spec.ts) and [frontend/playwright.config.ts](frontend/playwright.config.ts).

GitHub Actions runs the backend tests, frontend build, and Playwright suite; browser screenshots are uploaded as a workflow artifact. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Configuration

The backend reads these optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Backend HTTP port |
| `DB_PATH` | `./data/reimbursement.db` | SQLite database path, relative to the backend working directory unless absolute |
| `JWT_SECRET` | `reimbursement-demo-secret` | JWT signing secret; set a private value outside the demo environment |

## POC boundaries

This is a local demo, not a production deployment. It uses SQLite and a five-second in-process read cache; move to PostgreSQL and Redis before scaling across backend processes. Logs are structured JSON written to stdout, but no centralized log sink, tracing, or alerting is configured. CI verifies builds and tests but does not deploy to staging or production. Refresh tokens are stored in browser local storage for this POC; production should use a secure cookie/session design. The optional AI assistant is not implemented and must never make final reimbursement decisions if added.

See [docs/technical-design.md](docs/technical-design.md) for the architecture, workflow model, API specification, and implementation status.
