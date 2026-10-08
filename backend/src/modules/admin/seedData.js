export const seedUsers = [
  {
    id: 'CUST-1001',
    email: 'customer1@example.com',
    password: 'Password123!',
    fullName: 'Priya Sharma',
    role: 'Customer',
  },
  {
    id: 'CUST-1002',
    email: 'customer2@example.com',
    password: 'Password123!',
    fullName: 'Arjun Mehta',
    role: 'Customer',
  },
  {
    id: 'CUST-1003',
    email: 'customer3@example.com',
    password: 'Password123!',
    fullName: 'Sara Khan',
    role: 'Customer',
  },
  {
    id: 'CUST-1004',
    email: 'customer4@example.com',
    password: 'Password123!',
    fullName: 'Daniel Lee',
    role: 'Customer',
  },
  {
    id: 'REV-01',
    email: 'reviewer1@example.com',
    password: 'Password123!',
    fullName: 'Nina Patel',
    role: 'Reviewer',
  },
  {
    id: 'REV-02',
    email: 'reviewer2@example.com',
    password: 'Password123!',
    fullName: 'Michael Brown',
    role: 'Reviewer',
  },
  {
    id: 'REV-03',
    email: 'reviewer3@example.com',
    password: 'Password123!',
    fullName: 'Omar Hassan',
    role: 'Reviewer',
  },
  {
    id: 'ADMIN-01',
    email: 'admin@example.com',
    password: 'Password123!',
    fullName: 'System Administrator',
    role: 'Admin',
  },
];

export const seedRequests = [
  {
    id: 'REQ-000101',
    customerId: 'CUST-1001',
    customerReference: 'CUST-1001',
    expenseDate: '2026-09-15',
    amountInr: 2500.0,
    description: 'Travel expenses for client presentation in Bengaluru',
    status: 'Approved',
  },
  {
    id: 'REQ-000102',
    customerId: 'CUST-1002',
    customerReference: 'CUST-1002',
    expenseDate: '2026-09-18',
    amountInr: 1800.0,
    description: 'Hotel stay during vendor meeting',
    status: 'InReview',
  },
  {
    id: 'REQ-000103',
    customerId: 'CUST-1003',
    customerReference: 'CUST-1003',
    expenseDate: '2026-09-20',
    amountInr: 4200.0,
    description: 'Conference registration and train tickets',
    status: 'MoreInformationRequested',
  },
  {
    id: 'REQ-000104',
    customerId: 'CUST-1001',
    customerReference: 'CUST-1001',
    expenseDate: '2026-09-22',
    amountInr: 760.0,
    description: 'Office supplies and printing charges',
    status: 'Declined',
  },
  {
    id: 'REQ-000105',
    customerId: 'CUST-1004',
    customerReference: 'CUST-1004',
    expenseDate: '2026-09-25',
    amountInr: 3200.0,
    description: 'Cab charges for field visit with customer team',
    status: 'New',
  },
];

export const seedDecisions = [
  {
    id: 'REV-DEC-001',
    requestId: 'REQ-000101',
    reviewerId: 'REV-01',
    decisionType: 'Approve',
    explanation: 'Receipt and purpose align with business travel requirements.',
  },
  {
    id: 'REV-DEC-002',
    requestId: 'REQ-000104',
    reviewerId: 'REV-02',
    decisionType: 'Decline',
    explanation: 'Expense description is too generic and missing necessary approval context.',
  },
  {
    id: 'REV-DEC-003',
    requestId: 'REQ-000103',
    reviewerId: 'REV-03',
    decisionType: 'RequestMoreInfo',
    explanation: 'Please share a copy of the conference invoice and attendee confirmation.',
  },
];

export const seedEvents = [
  { id: 'EVT-001', requestId: 'REQ-000101', eventType: 'Submitted', actorType: 'Customer', actorId: 'CUST-1001', metadata: JSON.stringify({ source: 'web-form' }) },
  { id: 'EVT-002', requestId: 'REQ-000101', eventType: 'Approved', actorType: 'Reviewer', actorId: 'REV-01', metadata: JSON.stringify({ reason: 'Receipt and purpose align with business travel requirements.' }) },
  { id: 'EVT-003', requestId: 'REQ-000104', eventType: 'Submitted', actorType: 'Customer', actorId: 'CUST-1001', metadata: JSON.stringify({ source: 'web-form' }) },
  { id: 'EVT-004', requestId: 'REQ-000104', eventType: 'Declined', actorType: 'Reviewer', actorId: 'REV-02', metadata: JSON.stringify({ reason: 'Expense description is too generic and missing necessary approval context.' }) },
  { id: 'EVT-005', requestId: 'REQ-000103', eventType: 'Submitted', actorType: 'Customer', actorId: 'CUST-1003', metadata: JSON.stringify({ source: 'web-form' }) },
  { id: 'EVT-006', requestId: 'REQ-000103', eventType: 'MoreInformationRequested', actorType: 'Reviewer', actorId: 'REV-03', metadata: JSON.stringify({ reason: 'Please share the invoice and attendee confirmation.' }) },
];
