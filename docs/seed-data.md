# Seed Data Set

This document defines the fictional demo data for local development and demonstration of the reimbursement review website.

## 1. Users

### Customers

| id | email | password | role | fullName |
| --- | --- | --- | --- | --- |
| CUST-1001 | customer1@example.com | Password123! | Customer | Priya Sharma |
| CUST-1002 | customer2@example.com | Password123! | Customer | Arjun Mehta |
| CUST-1003 | customer3@example.com | Password123! | Customer | Sara Khan |
| CUST-1004 | customer4@example.com | Password123! | Customer | Daniel Lee |

### Reviewers

| id | email | password | role | fullName |
| --- | --- | --- | --- | --- |
| REV-01 | reviewer1@example.com | Password123! | Reviewer | Nina Patel |
| REV-02 | reviewer2@example.com | Password123! | Reviewer | Michael Brown |
| REV-03 | reviewer3@example.com | Password123! | Reviewer | Omar Hassan |

### Admins

| id | email | password | role | fullName |
| --- | --- | --- | --- | --- |
| ADMIN-01 | admin@example.com | Password123! | Admin | System Administrator |

## 2. Example reimbursement requests

### Request 1

- requestReference: REQ-000101
- customerReference: CUST-1001
- expenseDate: 2026-09-15
- amountInr: 2500.00
- description: Travel expenses for client presentation in Bengaluru
- status: Approved
- createdAt: 2026-09-15T09:30:00Z

### Request 2

- requestReference: REQ-000102
- customerReference: CUST-1002
- expenseDate: 2026-09-18
- amountInr: 1800.00
- description: Hotel stay during vendor meeting
- status: InReview
- createdAt: 2026-09-18T12:15:00Z

### Request 3

- requestReference: REQ-000103
- customerReference: CUST-1003
- expenseDate: 2026-09-20
- amountInr: 4200.00
- description: Conference registration and train tickets
- status: MoreInformationRequested
- createdAt: 2026-09-20T15:45:00Z

### Request 4

- requestReference: REQ-000104
- customerReference: CUST-1001
- expenseDate: 2026-09-22
- amountInr: 760.00
- description: Office supplies and printing charges
- status: Declined
- createdAt: 2026-09-22T10:05:00Z

### Request 5

- requestReference: REQ-000105
- customerReference: CUST-1004
- expenseDate: 2026-09-25
- amountInr: 3200.00
- description: Cab charges for field visit with customer team
- status: New
- createdAt: 2026-09-25T08:40:00Z

## 3. Review decisions

### Review decision examples

| requestReference | reviewerId | decisionType | explanation | createdAt |
| --- | --- | --- | --- | --- |
| REQ-000101 | REV-01 | Approve | Receipt and purpose align with business travel requirements. | 2026-09-15T11:00:00Z |
| REQ-000104 | REV-02 | Decline | Expense description is too generic and missing necessary approval context. | 2026-09-22T11:25:00Z |
| REQ-000103 | REV-03 | RequestMoreInfo | Please share a copy of the conference invoice and attendee confirmation. | 2026-09-20T16:20:00Z |

## 4. Customer responses for more-information flow

### Example customer response

- requestReference: REQ-000103
- customerReference: CUST-1003
- response: Attached the invoice and attendee confirmation as requested.
- createdAt: 2026-09-21T09:10:00Z

This should move the request back into the review lifecycle for reassessment.

## 5. Duplicate submission examples

To demonstrate duplicate detection:

- same customerReference: CUST-1001
- same expenseDate: 2026-09-15
- same amountInr: 2500.00
- same normalized description: travel expenses for client presentation in bengaluru

A second submission attempt should resolve to the original request reference REQ-000101.

## 6. Suggested seeding rules

When loading this test data:

- create all user accounts first
- create request records next
- create review decisions and audit events after requests
- ensure unique request references and stable IDs for demos
- keep fake passwords consistent across local environment usage

## 7. Notes for demonstrations

This dataset is sufficient to demonstrate:

- customer submission flow
- reviewer queue management
- approval and decline actions
- request-more-info workflow
- duplicate submission prevention
- concurrency and conflict handling demonstration

These are intentionally simple fictional records and do not represent real business data.
