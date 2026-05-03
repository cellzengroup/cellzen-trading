// Shared API base URL resolution + resilient fetch fallback.
//
// In production we don't always know whether the frontend is served from the
// same origin as the backend, so this tries the configured/same-origin first
// and falls back to the known production hosts. Once a base works, it's cached
// for the rest of the session so subsequent calls go straight to it.

const KNOWN_PROD_BASES = [
  "https://cellzen-trading.onrender.com/api",
  "https://www.cellzen.com.np/api",
  "https://cellzen.com.np/api",
];

const explicitBase = import.meta.env.VITE_API_URL;

export const PRIMARY_API_BASE =
  explicitBase ||
  (typeof window !== "undefined" && import.meta.env.PROD
    ? `${window.location.origin}/api`
    : "http://localhost:5300/api");

export function getApiBaseCandidates() {
  const candidates = [PRIMARY_API_BASE];
  if (typeof window !== "undefined" && !explicitBase) {
    const sameOrigin = `${window.location.origin}/api`;
    if (!candidates.includes(sameOrigin)) candidates.push(sameOrigin);
  }
  if (import.meta.env.PROD) {
    KNOWN_PROD_BASES.forEach((u) => {
      if (!candidates.includes(u)) candidates.push(u);
    });
  }
  return candidates;
}

let cachedWorkingBase = null;

export function getCachedBase() {
  return cachedWorkingBase || PRIMARY_API_BASE;
}

// Try each candidate base in turn. Returns the first response that completes
// (regardless of HTTP status) and caches the base that worked. Throws only if
// every candidate hits a network/CORS error.
export async function resilientFetch(path, init = {}) {
  // If we already have a working base, use it directly
  if (cachedWorkingBase) {
    return fetch(`${cachedWorkingBase}${path}`, init);
  }

  const bases = getApiBaseCandidates();
  let lastErr = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, init);
      cachedWorkingBase = base;
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All API hosts failed");
}

// Token kinds — different parts of the app store under different keys
export const TOKENS = {
  admin: "inv_token",
  customer: "customer_token",
};

function buildAuthHeaders(tokenKind) {
  const key = TOKENS[tokenKind] || tokenKind;
  if (!key) return {};
  const t = localStorage.getItem(key);
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Auth-aware fetch wrapper. Adds bearer header, surfaces 401 by clearing the
// matching token (so the next mount/redirect knows the session is gone), and
// dispatches a window event so a global listener can route to the login page.
export async function authFetch(path, { tokenKind = "admin", headers = {}, ...init } = {}) {
  const auth = buildAuthHeaders(tokenKind);
  const finalHeaders = { ...headers, ...auth };
  const res = await resilientFetch(path, { ...init, headers: finalHeaders });
  if (res.status === 401) {
    const key = TOKENS[tokenKind] || tokenKind;
    if (key) localStorage.removeItem(key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired", { detail: { tokenKind } }));
    }
  }
  return res;
}

export async function authJson(path, init = {}) {
  const res = await authFetch(path, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

// Convenience JSON helpers
export async function apiGetJson(path, init = {}) {
  const res = await resilientFetch(path, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function apiPostJson(path, body, init = {}) {
  const headers = { "Content-Type": "application/json", ...(init.headers || {}) };
  const res = await resilientFetch(path, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}
