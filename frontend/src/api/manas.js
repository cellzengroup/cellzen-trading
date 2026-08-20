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

export const getOrCreateSessionId = () => {
  let sid = localStorage.getItem('manasSessionId');
  if (!sid) {
    sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('manasSessionId', sid);
  }
  return sid;
};

export const resetSession = () => {
  localStorage.removeItem('manasSessionId');
};

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
