import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

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

const POLL_INTERVAL_MS = 60_000;

export default function NotificationBell({ noticesPath }) {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef(null);

  const fetchNotices = useCallback(async () => {
    const token = localStorage.getItem("customer_token");
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/inventory/auth/me/notices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Unable to load notices");
      }
      setNotices(data.data || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotices();
    const interval = window.setInterval(fetchNotices, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchNotices]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      setNotices((current) =>
        current.map((item) => (item.id === notice.id ? { ...item, read: true } : item))
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    } catch {
      /* ignore */
    }
  };

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F2EF] text-[#2D2D2D]/60 transition-colors hover:bg-[#412460] hover:text-white"
        aria-label="Notifications"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#B99353] px-1 text-[10px] font-bold text-white shadow">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-[#E1E3EE] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[#E1E3EE] px-4 py-3">
            <p className="text-sm font-semibold text-[#412460]">Notifications</p>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B99353]">
              {unreadCount} unread
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notices.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#2D2D2D]/55">Loading...</p>
            ) : error ? (
              <p className="px-4 py-6 text-center text-xs text-red-600">{error}</p>
            ) : notices.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#2D2D2D]/55">
                You don't have any notifications yet.
              </p>
            ) : (
              notices.slice(0, 8).map((notice) => (
                <button
                  key={notice.id}
                  type="button"
                  onClick={() => markAsRead(notice)}
                  className={`flex w-full flex-col gap-1 border-b border-[#F4F2EF] px-4 py-3 text-left text-xs transition-colors last:border-0 hover:bg-[#F7F6F2] ${
                    notice.read ? "opacity-70" : "bg-[#F6F1EA]/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[#412460]">
                      {notice.title || "Message from Cellzen"}
                    </span>
                    {!notice.read && (
                      <span className="h-2 w-2 rounded-full bg-[#B99353]" aria-label="Unread" />
                    )}
                  </div>
                  <p className="text-[#2D2D2D]/75">{notice.message}</p>
                  <p className="text-[10px] text-[#2D2D2D]/45">{formatTime(notice.createdAt)}</p>
                </button>
              ))
            )}
          </div>

          {noticesPath && (
            <div className="border-t border-[#E1E3EE] px-4 py-3 text-center">
              <Link
                to={noticesPath}
                onClick={() => setOpen(false)}
                className="text-xs font-semibold text-[#412460] hover:text-[#B99353]"
              >
                View all notices
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
