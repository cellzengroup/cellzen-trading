import React, { useEffect, useMemo, useState } from "react";
import AdminPageShell from "./AdminPageShell";

const API_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? `${window.location.origin}/api` : "http://localhost:5300/api");

const ENROLLMENT_CARDS = [
  {
    key: "costumers",
    label: "Costumers",
    description: "Registered customer accounts in the tracking portal.",
    accent: "bg-white text-[#2D2D2D]",
  },
  {
    key: "distributors",
    label: "Distributors",
    description: "Distributor users enrolled for shipment coordination.",
    accent: "bg-[#EAE8E5] text-[#2D2D2D]",
  },
  {
    key: "logistics",
    label: "Logistics",
    description: "Logistics teams managing transport and delivery updates.",
    accent: "bg-white text-[#2D2D2D]",
  },
  {
    key: "partners",
    label: "Partners",
    description: "Partner accounts connected to Cellzen operations.",
    accent: "bg-[#EAE8E5] text-[#2D2D2D]",
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Supplier users enrolled for sourcing and fulfillment.",
    accent: "bg-white text-[#2D2D2D]",
  },
];

const TEAM_TASKS = [
  { item: "Approve new supplier account", owner: "Operations", status: "Pending" },
  { item: "Review logistics partner rates", owner: "Logistics", status: "In Review" },
  { item: "Update customer credit terms", owner: "Finance", status: "Ready" },
  { item: "Check delayed shipment report", owner: "Support", status: "Urgent" },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AdminManagements() {
  const [enrollments, setEnrollments] = useState({
    costumers: 0,
    distributors: 0,
    logistics: 0,
    partners: 0,
    suppliers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadEnrollments = async () => {
      setLoading(true);
      setError("");

      try {
        let response;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            response = await fetch(`${API_URL}/inventory/auth/enrollments`, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("inv_token") || ""}`,
              },
            });
            break;
          } catch (fetchError) {
            if (attempt === 2) throw fetchError;
            await wait(500);
          }
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load enrollments");
        }

        const nextCounts = {
          costumers: 0,
          distributors: 0,
          logistics: 0,
          partners: 0,
          suppliers: 0,
        };

        (data.types || []).forEach((type) => {
          nextCounts[type.key] = type.count || 0;
        });

        setEnrollments(nextCounts);
      } catch (enrollmentError) {
        setError(
          enrollmentError.message === "Failed to fetch"
            ? "Enrollment data is unavailable right now. Please refresh after the backend finishes restarting."
            : enrollmentError.message
        );
      } finally {
        setLoading(false);
      }
    };

    loadEnrollments();
  }, []);

  const managementCards = useMemo(
    () => ENROLLMENT_CARDS.map((card) => ({
      ...card,
      count: loading ? "..." : enrollments[card.key].toLocaleString(),
    })),
    [enrollments, loading]
  );

  return (
    <AdminPageShell activePage="Management" title="Management" eyebrow="Cellzen Operations Control">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {managementCards.map((card) => (
          <div
            key={card.key}
            className={`${card.accent} rounded-[2rem] border border-[#E1E3EE] p-6`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2D2D2D]/40">
              {card.label}
            </p>
            <p className="mt-4 text-3xl font-bold">{card.count}</p>
            <p className="mt-3 text-sm leading-relaxed text-[#2D2D2D]/55">
              {card.description}
            </p>
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-[2rem] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Management Tasks</h2>
              <p className="text-xs text-[#2D2D2D]/45">Operational actions for admin review.</p>
            </div>
            <button className="bg-[#412460] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#B99353]">
              Add Task
            </button>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#2A1740] text-xs uppercase tracking-[0.16em] text-white/70">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {TEAM_TASKS.map((task) => (
                  <tr key={task.item} className="border-b border-[#E1E3EE] last:border-0">
                    <td className="px-4 py-4 font-semibold text-[#412460]">{task.item}</td>
                    <td className="px-4 py-4 text-[#2D2D2D]/60">{task.owner}</td>
                    <td className="px-4 py-4">
                      <span className="bg-[#F6F1EA] px-3 py-1 text-xs font-semibold text-[#B99353]">{task.status}</span>
                    </td>
                    <td className="px-4 py-4">
                      <button className="text-xs font-semibold text-[#412460] hover:text-[#B99353]">Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-[#2A1740] p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#B99353]">Admin Note</p>
          <h2 className="mt-4 text-2xl font-semibold">Manage the full Cellzen workflow.</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            This page is ready for customer, supplier, logistics, and internal team management modules.
          </p>
        </div>
      </div>
    </AdminPageShell>
  );
}
