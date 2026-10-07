import { createHash } from 'crypto';

export function normalizeText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createDedupeHash({ customerReference, expenseDate, amountInr, description }) {
  const payload = [
    String(customerReference || '').trim(),
    String(expenseDate || '').trim(),
    Number(amountInr || 0).toFixed(2),
    normalizeText(description),
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

export function generateRequestReference() {
  const timestamp = Date.now().toString().slice(-6);
  return `REQ-${timestamp.padStart(6, '0')}`;
}
