// Shared API base URL resolution + resilient fetch fallback.
//
// In production we don't always know whether the frontend is served from the
// same origin as the backend, so this tries the configured/same-origin first
// and falls back to the known production hosts. Once a base works, it's cached
// for the rest of the session so subsequent calls go straight to it.

const KNOWN_PROD_BASES = [
  "https://cellzen-trading.onrender.com/api",
  "https://www.cellzengroup.com/api",
  "https://cellzengroup.com/api",
];

const explicitBase = import.meta.env.VITE_API_URL;

// In the browser, always talk same-origin (`<origin>/api`). In production the
// backend serves the SPA from the same origin; in dev the Vite proxy forwards
// `/api` to the backend. This avoids cross-origin/CORS failures that silently
// fell back to the dev server and produced 404s. Only non-browser contexts
// (SSR/scripts) fall back to the explicit localhost backend.
export const PRIMARY_API_BASE =
  explicitBase ||
  (typeof window !== "undefined"
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
// without a network error, and caches the base ONLY if the response code is
// 2xx/3xx — never caches a 4xx/5xx response. This avoids the "sticky-cache"
// bug where a 401 from a stale Render replica would lock the whole session
// onto that bad host and produce intermittent login failures.
export async function resilientFetch(path, init = {}) {
  // If we already have a known-good base, use it directly.
  if (cachedWorkingBase) {
    try {
      return await fetch(`${cachedWorkingBase}${path}`, init);
    } catch (err) {
      // Network error on the cached base — clear the cache and re-try the
      // full candidate list. (Don't propagate stale routing decisions.)
      cachedWorkingBase = null;
    }
  }

  const bases = getApiBaseCandidates();
  let lastErr = null;
  let firstResponse = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${path}`, init);
      // Cache the base only if it actually answered successfully — a 401
      // from a stale replica should NOT pin the session to it.
      if (res.ok || (res.status >= 300 && res.status < 400)) {
        cachedWorkingBase = base;
        return res;
      }
      // Non-2xx/3xx — keep this response as a fallback but try the next base
      // first to see if a better one exists.
      if (!firstResponse) firstResponse = res;
    } catch (err) {
      lastErr = err;
    }
  }
  // No base returned 2xx/3xx — return the first non-success response (so the
  // caller still gets a real error code/body) without poisoning the cache.
  if (firstResponse) return firstResponse;
  throw lastErr || new Error("All API hosts failed");
}

// Token kinds — different parts of the app store under different keys
export const TOKENS = {
  admin: "inv_token",
  staff: "staff_token",
  customer: "customer_token",
};

// The Staff portal reuses the Admin portal's page code (copied into pages/auth/
// staff/) but must authenticate with a SEPARATE token so a staff and an admin
// session in the same browser never collide. Staff pages all live under the
// /staff* path prefix, so we resolve the "admin" token kind to the staff token
// whenever the current location is a staff page. This keeps the copied pages
// working unchanged (they still call authFetch with the default kind).
function isStaffContext() {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/staff");
}

// Resolve the active inventory-portal token (admin vs staff) by current path.
// Used by helpers that read the token directly (e.g. invoiceSync).
export function activeInvToken() {
  const key = isStaffContext() ? TOKENS.staff : TOKENS.admin;
  return localStorage.getItem(key) || "";
}

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
  // On staff pages the default "admin" kind is transparently upgraded to "staff"
  // so the copied admin pages use the staff token + route to the staff login.
  const effectiveKind = tokenKind === "admin" && isStaffContext() ? "staff" : tokenKind;
  const auth = buildAuthHeaders(effectiveKind);
  const finalHeaders = { ...headers, ...auth };
  const res = await resilientFetch(path, { ...init, headers: finalHeaders });
  if (res.status === 401) {
    const key = TOKENS[effectiveKind] || effectiveKind;
    if (key) localStorage.removeItem(key);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired", { detail: { tokenKind: effectiveKind } }));
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
