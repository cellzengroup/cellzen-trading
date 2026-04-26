import React from "react";
import { Link } from "react-router-dom";

function getPartnerUser() {
  try {
    return JSON.parse(sessionStorage.getItem("customer_user") || "null");
  } catch {
    return null;
  }
}

export default function PartnersDashboard() {
  const user = getPartnerUser();

  return (
    <section className="min-h-screen bg-[#2A1740] px-6 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <img src="/Images/DarkLogo.svg" alt="Cellzen Trading" className="h-12 w-auto brightness-0 invert" />
          <Link to="/login" className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70 hover:text-[#B99353]">
            Login
          </Link>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#B99353]">Partners Dashboard</p>
            <h1 className="mt-4 premium-font-galdgderbold text-4xl leading-tight sm:text-5xl">
              Partner workspace{user?.firstName ? ` for ${user.firstName}` : ""}.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/58">
              Review partnership activity, shared opportunities, performance updates, and collaborative shipments.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {["Partner Leads", "Shared Orders", "Performance Updates", "Collaboration Notes"].map((item) => (
              <div key={item} className="border border-white/12 bg-white/[0.07] p-6 backdrop-blur-xl">
                <h2 className="text-sm font-bold text-[#B99353]">{item}</h2>
                <p className="mt-2 text-xs leading-relaxed text-white/50">
                  Partner tracking workspace module.
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
