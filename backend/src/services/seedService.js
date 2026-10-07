import bcrypt from 'bcryptjs';
import db from '../db.js';
import { seedUsers, seedRequests, seedDecisions, seedEvents } from '../data/seedData.js';
import { createDedupeHash } from '../utils/requestUtils.js';

export function seedDatabase() {
  const existingUserCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;

  if (existingUserCount > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `);

  const insertRequest = db.prepare(`
    INSERT INTO requests (
      id, request_reference, customer_id, customer_reference, expense_date, amount_inr,
      description, status, dedupe_hash, version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  const insertDecision = db.prepare(`
    INSERT INTO review_decisions (id, request_id, reviewer_id, decision_type, explanation, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertEvent = db.prepare(`
    INSERT INTO request_events (id, request_id, event_type, actor_type, actor_id, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const txn = db.transaction(() => {
    for (const user of seedUsers) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertUser.run(user.id, user.email.toLowerCase(), passwordHash, user.fullName, user.role);
    }

    for (const request of seedRequests) {
      const dedupeHash = createDedupeHash({
        customerReference: request.customerReference,
        expenseDate: request.expenseDate,
        amountInr: request.amountInr,
        description: request.description,
      });

      insertRequest.run(
        request.id,
        request.id,
        request.customerId,
        request.customerReference,
        request.expenseDate,
        request.amountInr,
        request.description,
        request.status,
        dedupeHash
      );
    }

    for (const decision of seedDecisions) {
      insertDecision.run(
        decision.id,
        decision.requestId,
        decision.reviewerId,
        decision.decisionType,
        decision.explanation
      );
    }

    for (const event of seedEvents) {
      insertEvent.run(
        event.id,
        event.requestId,
        event.eventType,
        event.actorType,
        event.actorId,
        event.metadata
      );
    }
  });

  txn();
}
