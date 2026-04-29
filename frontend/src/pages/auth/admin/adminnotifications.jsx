import React, { useEffect, useMemo, useState } from "react";
import AdminPageShell from "./AdminPageShell";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const formatRequestTime = (dateValue) => {
  if (!dateValue) return "New request";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "New request";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminNotifications() {
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const approvalCount = approvalRequests.length;

  const token = useMemo(() => localStorage.getItem("inv_token") || "", []);

  const loadApprovalRequests = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/inventory/auth/approval-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load approval requests");
      }

      setApprovalRequests(data.data || []);
      window.dispatchEvent(new CustomEvent("admin-notifications-updated", {
        detail: { count: data.count || 0 },
      }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request) => {
    setApprovingId(request.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`${API_URL}/inventory/auth/approval-requests/${request.id}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to approve account");
      }

      setApprovalRequests((currentRequests) => {
        const nextRequests = currentRequests.filter((item) => item.id !== request.id);
        window.dispatchEvent(new CustomEvent("admin-notifications-updated", {
          detail: { count: nextRequests.length },
        }));
        return nextRequests;
      });
      setSuccess(`${request.name || request.email} has been approved. They can now login.`);
    } catch (approveError) {
      setError(approveError.message);
    } finally {
      setApprovingId("");
    }
  };

  useEffect(() => {
    loadApprovalRequests();
  }, []);

  return (
    <AdminPageShell activePage="Notifications" title="Notifications" eyebrow="Cellzen Admin Alerts">
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Notification Center</h2>
              <p className="text-xs text-[#2D2D2D]/45">Approve pending supplier, distributor, and partner accounts.</p>
            </div>
            <button
              type="button"
              onClick={loadApprovalRequests}
              disabled={loading}
              className="rounded-full bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-6 rounded-[2rem] border border-[#E1E3EE] bg-[#F7F6F2] p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#B99353]">Approval Requests</p>
                <h3 className="mt-2 text-xl font-semibold text-[#412460]">{approvalCount} pending</h3>
              </div>
              <span className="w-fit rounded-full bg-white px-3 py-1 text-[10px] font-semibold text-[#2D2D2D]/55">
                Header badge syncs with this count
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {loading && (
              <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-5 text-sm text-[#2D2D2D]/50">
                Loading approval requests...
              </div>
            )}

            {!loading && approvalRequests.length === 0 && (
              <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-5 text-sm text-[#2D2D2D]/50">
                No approval requests right now.
              </div>
            )}

            {!loading && approvalRequests.map((request) => (
              <div key={request.id} className="rounded-[2rem] border border-[#E1E3EE] bg-white p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#412460]">Approval Request</h3>
                      <span className="rounded-full bg-[#B99353]/12 px-3 py-1 text-[10px] font-semibold text-[#8B6A31]">
                        {request.accountType}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[#2D2D2D]/60">
                      {request.name || request.email} registered as {request.accountType}. Approve this request to allow portal login.
                    </p>
                    <div className="mt-4 grid gap-2 text-xs text-[#2D2D2D]/45 sm:grid-cols-2">
                      <span>Email: {request.email}</span>
                      <span>Phone: {request.phone || "-"}</span>
                      <span>Country: {request.country || "-"}</span>
                      <span>Requested: {formatRequestTime(request.createdAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApprove(request)}
                    disabled={approvingId === request.id}
                    className="w-full rounded-full bg-[#412460] px-5 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60 lg:w-auto"
                  >
                    {approvingId === request.id ? "Approving..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}

          </div>
        </div>

        <div className="rounded-[2rem] bg-[#412460] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Alerts</p>
          <h2 className="mt-4 text-2xl font-semibold">Approval requests are now live.</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            When a distributor, supplier, or partner verifies email, their request appears here and in the header notification badge.
          </p>
        </div>
      </div>
    </AdminPageShell>
  );
}
