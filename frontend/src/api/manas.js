// MANAS chat client — streams the assistant reply from the backend.
//
// Usage:
//   const stop = streamChat({ message, history, sessionId, verify, onToken, onDone, onError });
//   stop(); // call to abort mid-stream

// Every other client in the app sets VITE_API_URL *with* the /api suffix
// already on it (see api/client.js and the inventory hooks), but this module
// appends its own /api to each path below. Strip a trailing /api so both
// spellings collapse to the same base — otherwise a deployment that sets the
// var the usual way silently requests /api/api/manas/chat and 404s.
const API_ROOT = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? window.location.origin : 'http://localhost:5300');
const API_URL = String(API_ROOT).replace(/[/]+$/, '').replace(/[/]api$/, '');

const getAuthToken = () => {
  // Match the keys used elsewhere in the app for admin + customer JWTs
  return (
    localStorage.getItem('adminToken') ||
    localStorage.getItem('customerToken') ||
    localStorage.getItem('token') ||
    ''
  );
};

export const newSessionId = () =>
  `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// ---------------------------------------------------------------------------
// Local chat history
//
// Opening the panel always starts a brand-new conversation, so this store is
// the only route back to an earlier one. It holds the MAX_SAVED_CHATS most
// recent chats besides the one currently on screen, and forgets anything left
// untouched for HISTORY_TTL_DAYS.
//
// Restoring is purely client-side: /chat is stateless and takes the whole
// `history` array per request, so replaying a stored chat's messages (under
// its original session id) resumes the conversation exactly where it left off
// and keeps appending to the same `manas_conversations` row server-side.
// ---------------------------------------------------------------------------
const HISTORY_KEY = 'manasChatHistory';
export const MAX_SAVED_CHATS = 5;
export const HISTORY_TTL_DAYS = 10;
const HISTORY_TTL_MS = HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
// Matches the backend's own `.slice(-50)` cap, so a stored chat can never
// carry more turns than the server kept for the same session.
const MAX_MESSAGES_PER_CHAT = 50;

// Sessions used to be pinned in localStorage and reused across opens. They
// aren't any more; drop the stale key so it doesn't linger in every browser
// that ran the old build.
try { localStorage.removeItem('manasSessionId'); } catch { /* private mode */ }

const readStore = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(c => c && c.sessionId && Array.isArray(c.messages));
  } catch {
    return [];
  }
};

const writeStore = (chats) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
  } catch { /* quota exceeded or private mode — history is best-effort */ }
};

// Newest first, with anything past its TTL dropped.
const prune = (chats, now) =>
  chats
    .filter(c => now - (c.updatedAt || 0) < HISTORY_TTL_MS)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

// Label a chat by the first thing the user actually asked in it.
const deriveTitle = (messages) => {
  const first = messages.find(m => m.role === 'user' && String(m.content || '').trim());
  const text = String(first?.content || '').trim().replace(/\s+/g, ' ');
  if (!text) return 'New chat';
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
};

// Every saved chat except `exceptSessionId` (normally the live one), newest
// first. Expired entries are dropped from storage as a side effect so they
// don't accumulate in browsers that never open the history panel.
export const loadChatHistory = (exceptSessionId) => {
  const now = Date.now();
  const all = readStore();
  const kept = prune(all, now);
  if (kept.length !== all.length) writeStore(kept);
  return kept.filter(c => c.sessionId !== exceptSessionId).slice(0, MAX_SAVED_CHATS);
};

// Upsert the live conversation, keyed by session id so repeated calls update
// one entry instead of piling up duplicates. The active chat is never evicted
// by the cap — MAX_SAVED_CHATS counts the *other* chats kept alongside it.
export const saveChatToHistory = (sessionId, messages) => {
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) return;
  const now = Date.now();
  const trimmed = messages.slice(-MAX_MESSAGES_PER_CHAT);
  const stored = readStore();
  const existing = stored.find(c => c.sessionId === sessionId);
  const entry = {
    sessionId,
    title: deriveTitle(trimmed),
    messages: trimmed,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  const others = prune(stored.filter(c => c.sessionId !== sessionId), now);
  writeStore([entry, ...others.slice(0, MAX_SAVED_CHATS)]);
};

export const deleteChatFromHistory = (sessionId) => {
  writeStore(readStore().filter(c => c.sessionId !== sessionId));
};

export const clearChatHistory = () => writeStore([]);

export const streamChat = ({ message, history, sessionId, verify, onToken, onDone, onError }) => {
  const controller = new AbortController();

  (async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/api/manas/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message, history, sessionId, verify }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errMsg = `MANAS error (${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.message) errMsg = errBody.message;
        } catch (_) { /* response wasn't JSON */ }
        onError?.(new Error(errMsg));
        return;
      }

      // Server tells us whether a nav link is authorized for THIS reply.
      // 'none' (or missing header) → no link button, even if the model added [NAV:...].
      const approvedNav = res.headers.get('X-Manas-Nav') || 'none';
      // If a verified invoice was matched, the server returns the invoice
      // number plus the verified identifiers from the matched DB row. We use
      // these for the PDF download buttons.
      const matchedInvoice = res.headers.get('X-Manas-Invoice') || null;
      // Server-signed download token (preferred over contact matching).
      const invoiceToken = matchedInvoice ? (res.headers.get('X-Manas-Invoice-Token') || null) : null;
      const verifiedIdentifiers = matchedInvoice ? { invoiceToken } : null;

      const reader = res.body?.getReader();
      if (!reader) {
        onError?.(new Error('Streaming not supported in this browser'));
        return;
      }

      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        full += chunk;
        onToken?.(chunk, full, approvedNav, matchedInvoice, verifiedIdentifiers);
      }
      onDone?.(full, approvedNav, matchedInvoice, verifiedIdentifiers);
    } catch (err) {
      if (err.name === 'AbortError') return;
      onError?.(err);
    }
  })();

  return () => controller.abort();
};

export const fetchHistory = async (sessionId) => {
  try {
    const res = await fetch(`${API_URL}/api/manas/history/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.messages || [];
  } catch {
    return [];
  }
};
