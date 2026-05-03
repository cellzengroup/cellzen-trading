// Simple in-memory cache with TTL
const cache = new Map();

function get(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(key, data, ttlMs = 60000) {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

function invalidate(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function invalidateAll() {
  cache.clear();
}

module.exports = { get, set, invalidate, invalidateAll };
