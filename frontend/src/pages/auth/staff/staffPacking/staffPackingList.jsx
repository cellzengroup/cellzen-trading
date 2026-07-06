import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StaffPageShell from "../StaffPageShell";
import { loadPackingLists, deletePackingList } from "../../../../utils/packingApi.js";

export default function StaffPackingList() {
  const navigate = useNavigate();
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setLists(await loadPackingLists());
    } catch (e) {
      setError(e.message || "Unable to load packing lists");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePackingList(deleteTarget.packingNumber);
      setLists((cur) => cur.filter((l) => l.packingNumber !== deleteTarget.packingNumber));
      setDeleteTarget(null);
    } catch (e) {
      setError(e.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <StaffPageShell activePage="Packing List" title="Packing List" eyebrow="Cartons, weights, sizes & CBM">
      <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#412460]">Your Packing Lists</h2>
            <p className="text-xs text-[#2D2D2D]/55">Build a carton-by-carton packing list and export it.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/staff-packing/create")}
            className="rounded-full bg-[#412460] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]"
          >
            + New Packing List
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-[#2D2D2D] text-xs uppercase tracking-[0.16em] text-white/80">
              <tr>
                <th className="px-4 py-3">Packing No</th>
                <th className="px-4 py-3">Ref / PI</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3 text-center">Cartons</th>
                <th className="px-4 py-3 text-center">Total Weight</th>
                <th className="px-4 py-3 text-center">Total CBM</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#2D2D2D]/55">Loading...</td></tr>
              ) : lists.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[#2D2D2D]/55">No packing lists yet. Create your first one.</td></tr>
              ) : (
                lists.map((l) => (
                  <tr key={l.packingNumber} className="border-b border-[#E1E3EE] last:border-0">
                    <td className="px-4 py-4 font-semibold text-[#412460]">{l.packingNumber}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/70">{l.reference || "—"}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/70">{l.customerName || "—"}</td>
                    <td className="px-4 py-4 text-center text-[#2D2D2D]/70">{l.totalCartons ?? l.cartons.length}</td>
                    <td className="px-4 py-4 text-center text-[#2D2D2D]/70">{Number(l.totalWeight || 0)} kg</td>
                    <td className="px-4 py-4 text-center text-[#2D2D2D]/70">{Number(l.totalCbm || 0)}</td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/staff-packing/edit?number=${encodeURIComponent(l.packingNumber)}`)}
                          className="rounded-full border border-[#412460] px-4 py-1.5 text-xs font-semibold text-[#412460] transition-colors hover:bg-[#412460] hover:text-white"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(l)}
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
            <h3 className="text-lg font-semibold text-[#412460]">Delete packing list?</h3>
            <p className="mt-3 text-sm text-[#2D2D2D]/70">
              <span className="font-semibold text-[#2D2D2D]">{deleteTarget.packingNumber}</span> will be permanently removed.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="rounded-full border border-[#E1E3EE] bg-[#E5E1DA] px-5 py-2 text-sm font-semibold text-[#2D2D2D] transition-colors hover:bg-[#2D2D2D] hover:text-white disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={confirmDelete} disabled={deleting}
                className="rounded-full bg-[#412460] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B99353] disabled:opacity-60">
                {deleting ? "Deleting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </StaffPageShell>
  );
}
