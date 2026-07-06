import React, { useCallback, useEffect, useMemo, useState } from "react";
import StaffPageShell from "./StaffPageShell";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const CATEGORIES = [
  { key: "distributors", label: "Distributors" },
  { key: "customers", label: "Costumers" },
  { key: "suppliers", label: "Suppliers" },
  { key: "partners", label: "Partners" },
  { key: "logistics", label: "Logistics" },
];

// accountType stored on the user record when a staff member enrols someone of
// the active category. The backend GET /users filter matches on these.
const ACCOUNT_TYPE_BY_KEY = {
  distributors: "Distributor",
  customers: "Customer",
  suppliers: "Supplier",
  partners: "Partner",
  logistics: "Logistics",
};

const buildAuthHeaders = (extra = {}) => ({
  Authorization: `Bearer ${localStorage.getItem("staff_token") || ""}`,
  ...extra,
});

export default function StaffManagements() {
  const [activeKey, setActiveKey] = useState(CATEGORIES[0].key);
  const [usersByCategory, setUsersByCategory] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", country: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [sendingNotice, setSendingNotice] = useState(false);

  // Create (enrol) a new person under the active category — staff-owned.
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", email: "", password: "", phone: "", country: "" });
  const [creating, setCreating] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const activeCategory = useMemo(
    () => CATEGORIES.find((category) => category.key === activeKey) || CATEGORIES[0],
    [activeKey]
  );

  const loadUsers = useCallback(async (key) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/inventory/auth/users?type=${encodeURIComponent(key)}`,
        { headers: buildAuthHeaders() }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load users");
      }

      setUsersByCategory((current) => ({ ...current, [key]: data.data || [] }));
    } catch (loadError) {
      setError(
        loadError.message === "Failed to fetch"
          ? "User data is unavailable right now. Please try again shortly."
          : loadError.message
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers(activeKey);
  }, [activeKey, loadUsers]);

  const users = usersByCategory[activeKey] || [];

  const openDelete = (user) => {
    setFeedback("");
    setError("");
    setDeleteTarget(user);
  };

  const closeDelete = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/inventory/auth/users/${deleteTarget.id}`,
        { method: "DELETE", headers: buildAuthHeaders() }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete user");
      }

      setUsersByCategory((current) => ({
        ...current,
        [activeKey]: (current[activeKey] || []).filter((item) => item.id !== deleteTarget.id),
      }));
      setFeedback(`${deleteTarget.name || deleteTarget.email} has been deleted.`);
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (user) => {
    setFeedback("");
    setError("");
    setEditTarget(user);
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      country: user.country || "",
    });
    setNoticeMessage("");
  };

  const closeEdit = () => {
    if (savingEdit || sendingNotice) return;
    setEditTarget(null);
    setNoticeMessage("");
  };

  const sendNotice = async () => {
    if (!editTarget) return;
    const trimmed = noticeMessage.trim();
    if (!trimmed) {
      setError("Please write a message to send.");
      return;
    }
    setSendingNotice(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/inventory/auth/users/${editTarget.id}/notices`,
        {
          method: "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ message: trimmed }),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to send message");
      }

      setFeedback(`Message sent to ${editTarget.name || editTarget.email}.`);
      setNoticeMessage("");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setSendingNotice(false);
    }
  };

  const handleEditChange = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value }));
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    if (!editTarget) return;
    setSavingEdit(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/inventory/auth/users/${editTarget.id}`,
        {
          method: "PUT",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(editForm),
        }
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to update user");
      }

      setUsersByCategory((current) => ({
        ...current,
        [activeKey]: (current[activeKey] || []).map((item) =>
          item.id === editTarget.id ? { ...item, ...data.data } : item
        ),
      }));
      setFeedback(`${data.data?.name || editForm.name} has been updated.`);
      setEditTarget(null);
    } catch (editError) {
      setError(editError.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const openCreate = () => {
    setError("");
    setFeedback("");
    setCreateForm({ name: "", email: "", password: "", phone: "", country: "" });
    setShowCreatePassword(false);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (creating) return;
    setCreateOpen(false);
  };

  const handleCreateChange = (event) => {
    const { name, value } = event.target;
    setCreateForm((current) => ({ ...current, [name]: value }));
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    setCreating(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/inventory/auth/users`, {
        method: "POST",
        headers: buildAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...createForm,
          accountType: ACCOUNT_TYPE_BY_KEY[activeKey] || "Customer",
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Unable to create record");
      }

      setFeedback(`${createForm.name || createForm.email} has been added to ${activeCategory.label}.`);
      setCreateOpen(false);
      await loadUsers(activeKey);
    } catch (createError) {
      setError(createError.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <StaffPageShell activePage="Management" title="Management" eyebrow="Cellzen Operations Control">
      <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const isActive = category.key === activeKey;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveKey(category.key)}
                className={`rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                  isActive
                    ? "border-[#412460] bg-[#412460] text-white"
                    : "border-[#E1E3EE] bg-white text-[#2D2D2D]/70 hover:border-[#B99353] hover:text-[#B99353]"
                }`}
              >
                {category.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">{activeCategory.label}</h2>
            <p className="text-xs text-[#2D2D2D]/55">
              Registered users under {activeCategory.label.toLowerCase()}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2D2D2D]/45">
              {loading ? "Loading..." : `${users.length} ${users.length === 1 ? "record" : "records"}`}
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-full bg-[#412460] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
            >
              + Add {activeCategory.label.replace(/s$/, "")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {feedback && (
          <div className="mt-4 rounded-2xl border border-[#B99353]/40 bg-[#F6F1EA] p-4 text-sm text-[#412460]">
            {feedback}
          </div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[#2D2D2D] text-xs uppercase tracking-[0.16em] text-white/80">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#2D2D2D]/55">
                    Loading {activeCategory.label.toLowerCase()}...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-[#2D2D2D]/55">
                    No {activeCategory.label.toLowerCase()} registered yet.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b border-[#E1E3EE] last:border-0">
                    <td className="px-4 py-4 font-semibold text-[#412460]">{user.name || "—"}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/70">{user.email || "—"}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/70">{user.phone || "—"}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/70">{user.country || "—"}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-full border border-[#412460] px-4 py-1.5 text-xs font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => openDelete(user)}
                          className="rounded-full border border-[#B99353] bg-[#B99353] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#412460] hover:border-[#412460]"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/60 px-4">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#412460]">
              Are you sure you want to delete?
            </h3>
            <p className="mt-3 text-sm text-[#2D2D2D]/70">
              <span className="font-semibold text-[#2D2D2D]">{deleteTarget.name || deleteTarget.email}</span>
              {" "}will be permanently removed from {activeCategory.label}. This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={deleting}
                className="rounded-full border border-[#E1E3EE] bg-[#E5E1DA] px-5 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-white disabled:opacity-50"
              >
                Not sure
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-full bg-[#412460] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {deleting ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/60 px-4">
          <form
            onSubmit={submitEdit}
            className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-[#412460]">Edit {activeCategory.label.slice(0, -1)}</h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">Update the registered details for this user.</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Name
                <input
                  name="name"
                  type="text"
                  value={editForm.name}
                  onChange={handleEditChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                  required
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Email
                <input
                  name="email"
                  type="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                  required
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Phone
                <input
                  name="phone"
                  type="text"
                  value={editForm.phone}
                  onChange={handleEditChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Country
                <input
                  name="country"
                  type="text"
                  value={editForm.country}
                  onChange={handleEditChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-6 rounded-2xl border border-[#E1E3EE] bg-[#F7F6F2] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#412460]">
                  Message to Send
                </p>
                <p className="text-[10px] text-[#2D2D2D]/45">
                  Sent only to {editTarget.name || editTarget.email}
                </p>
              </div>
              <textarea
                value={noticeMessage}
                onChange={(event) => setNoticeMessage(event.target.value)}
                placeholder="Write a message — it will appear in this user's notices and notification bell."
                rows={3}
                className="mt-3 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
              />
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={sendNotice}
                  disabled={sendingNotice || !noticeMessage.trim()}
                  className="rounded-full border border-[#B99353] bg-[#B99353] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#412460] hover:border-[#412460] disabled:opacity-50"
                >
                  {sendingNotice ? "Sending..." : "Send Message"}
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingEdit || sendingNotice}
                className="rounded-full border border-[#E1E3EE] bg-[#E5E1DA] px-5 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit || sendingNotice}
                className="rounded-full bg-[#412460] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2D2D2D]/60 px-4">
          <form
            onSubmit={submitCreate}
            className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-[#412460]">
              Add {activeCategory.label.replace(/s$/, "")}
            </h3>
            <p className="mt-1 text-xs text-[#2D2D2D]/55">
              Create a new {activeCategory.label.toLowerCase().replace(/s$/, "")} account. It will appear only in your list.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Name
                <input
                  name="name"
                  type="text"
                  value={createForm.name}
                  onChange={handleCreateChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                  required
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Email
                <input
                  name="email"
                  type="email"
                  value={createForm.email}
                  onChange={handleCreateChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                  required
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Password
                <div className="relative mt-1">
                  <input
                    name="password"
                    type={showCreatePassword ? "text" : "password"}
                    value={createForm.password}
                    onChange={handleCreateChange}
                    placeholder="Min 6 characters"
                    className="block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 pr-11 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#412460]/55 transition-colors hover:text-[#B99353]"
                    aria-label={showCreatePassword ? "Hide password" : "Show password"}
                  >
                    {showCreatePassword ? (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                        <path d="M9.9 4.2A10.8 10.8 0 0112 4c5 0 9.3 3.2 11 8a11.8 11.8 0 01-3.1 4.6" />
                        <path d="M6.2 6.2A11.8 11.8 0 001 12c1.7 4.8 6 8 11 8a10.9 10.9 0 005.1-1.2" />
                      </svg>
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60">
                Phone
                <input
                  name="phone"
                  type="text"
                  value={createForm.phone}
                  onChange={handleCreateChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-[#2D2D2D]/60 sm:col-span-2">
                Country
                <input
                  name="country"
                  type="text"
                  value={createForm.country}
                  onChange={handleCreateChange}
                  className="mt-1 block w-full rounded-2xl border border-[#E1E3EE] bg-white px-3 py-2 text-sm text-[#2D2D2D] focus:border-[#412460] focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCreate}
                disabled={creating}
                className="rounded-full border border-[#E1E3EE] bg-[#E5E1DA] px-5 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-full bg-[#412460] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </StaffPageShell>
  );
}
