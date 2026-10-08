const entries = new Map();
const DEFAULT_TTL_MS = 5000;

export function getCachedWorkflowRead(key) {
  const entry = entries.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return undefined;
  }

  return entry.value;
}

export function cacheWorkflowRead(key, value, ttlMs = DEFAULT_TTL_MS) {
  entries.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateWorkflowReads() {
  entries.clear();
}
