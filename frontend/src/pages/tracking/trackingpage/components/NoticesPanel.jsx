import React, { useCallback, useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const DEFAULT_NOTICES = [
  {
    type: "Shipping",
    title: "Shipping timelines can vary by season",
    body: "Peak-season demand, customs inspections, carrier availability, and weather can affect final delivery dates. Confirm timelines before placing urgent orders.",
  },
  {
    type: "Quotations",
    title: "Final costs are confirmed before order placement",
    body: "Product cost, local handling, inspection needs, shipping method, and payment terms are reviewed before an order is confirmed.",
  },
  {
    type: "Inspection",
    title: "Inspection should be planned before dispatch",
    body: "Quantity checks, packaging photos, sample review, or third-party inspection should be requested before goods leave the supplier or warehouse.",
  },
  {
    type: "Customs",
    title: "Import rules depend on destination country",
    body: "Duties, taxes, restricted items, and documentation requirements vary by market. Final import rules are set by local authorities.",
  },
];

const DEFAULT_REMINDERS = [
  "Share complete product specifications before quotation.",
  "Confirm packaging requirements before production starts.",
  "Allow extra time around holidays and peak shipping seasons.",
  "Keep order references ready when asking for updates.",
];

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function NoticesPanel({
  audience = "Account",
  intro = "Operational notes to help you plan around quotations, inspections, shipping, and customs.",
  notices = DEFAULT_NOTICES,
  reminders = DEFAULT_REMINDERS,
}) {
  const [inbox, setInbox] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [inboxError, setInboxError] = useState("");

  const fetchInbox = useCallback(async () => {
    const token = localStorage.getItem("customer_token");
    if (!token) {
      setLoadingInbox(false);
      return;
    }

    setLoadingInbox(true);
    setInboxError("");
    try {
      const response = await fetch(`${API_URL}/inventory/auth/me/notices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Unable to load your notices");
      }
      setInbox(data.data || []);
    } catch (loadError) {
      setInboxError(loadError.message);
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const markAsRead = async (notice) => {
    if (notice.read) return;
    const token = localStorage.getItem("customer_token");
    if (!token) return;
    try {
      const response = await fetch(
        `${API_URL}/inventory/auth/me/notices/${notice.id}/read`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return;
      setInbox((current) =>
        current.map((item) => (item.id === notice.id ? { ...item, read: true } : item))
      );
    } catch {
      /* ignore */
    }
  };

  const unreadCount = inbox.filter((notice) => !notice.read).length;

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-[#E1E3EE] bg-[#412460] p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B99353]">
          {audience} Notices
        </p>
        <h2 className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">
          Important notes before you order or ship.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">{intro}</p>
      </div>

      <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B99353]">
              Inbox
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[#412460]">
              Messages from Cellzen Admin
            </h3>
          </div>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#B99353] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {loadingInbox ? (
            <p className="text-sm text-[#2D2D2D]/55">Loading your messages...</p>
          ) : inboxError ? (
            <p className="text-sm text-red-600">{inboxError}</p>
          ) : inbox.length === 0 ? (
            <p className="text-sm text-[#2D2D2D]/55">
              You don't have any personal notices yet. Admin messages will appear here.
            </p>
          ) : (
            inbox.map((notice) => (
              <button
                key={notice.id}
                type="button"
                onClick={() => markAsRead(notice)}
                className={`flex w-full flex-col gap-2 rounded-2xl border p-4 text-left transition-colors ${
                  notice.read
                    ? "border-[#E1E3EE] bg-white"
                    : "border-[#B99353]/40 bg-[#F6F1EA]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-[#412460]">
                    {notice.title || "Message from Cellzen"}
                  </p>
                  <div className="flex items-center gap-2">
                    {!notice.read && (
                      <span className="h-2 w-2 rounded-full bg-[#B99353]" aria-label="Unread" />
                    )}
                    <span className="text-[10px] text-[#2D2D2D]/45">
                      {formatTime(notice.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[#2D2D2D]/75">{notice.message}</p>
                {notice.sentByName && (
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#2D2D2D]/45">
                    From {notice.sentByName}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {notices.map((notice, index) => (
          <article
            key={notice.title}
            className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-[#412460]/30"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="bg-[#B99353]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#B99353]">
                {notice.type}
              </span>
              <span className="text-xs font-black text-[#412460]/35">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-bold text-[#412460]">{notice.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/65">{notice.body}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-6 rounded-[2rem] border border-[#E1E3EE] bg-[#E5E1DA] p-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B99353]">
            Reminders
          </p>
          <h3 className="mt-3 text-2xl font-semibold text-[#412460]">
            Small details prevent shipment delays.
          </h3>
        </div>
        <div className="space-y-3">
          {reminders.map((reminder, index) => (
            <div
              key={reminder}
              className="flex gap-4 border border-[#412460]/10 bg-white p-4"
            >
              <span className="text-xs font-black text-[#B99353]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm font-medium text-[#2D2D2D]/75">{reminder}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
