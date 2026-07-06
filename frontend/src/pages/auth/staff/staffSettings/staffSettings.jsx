import React from "react";
import StaffPageShell from "../StaffPageShell";
import { useCurrency } from "../../../../contexts/CurrencyContext.jsx";

// Staff Settings — VIEW ONLY.
//
// Exchange rates are a company-wide setting (one shared value in the database).
// Staff need to SEE today's rate because it drives invoice currency conversion,
// but only an admin may change it — otherwise a staff edit would change the rate
// for the admin and every other staff member. Transport-cost and HS-code
// management are intentionally not shown here (admin-only).
export default function StaffSettings() {
  const { exchangeRates, currencySymbols } = useCurrency();
  const rateEntries = Object.entries(exchangeRates || {});

  return (
    <StaffPageShell activePage="Settings" title="Settings" eyebrow="Cellzen Staff Settings">
      <div className="space-y-5">
        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#412460]">Today's Exchange Rate</h2>
              <p className="mt-1 text-sm text-[#2D2D2D]/55">
                Rates are set by the admin and used for invoice currency conversion.
              </p>
            </div>
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#F4F2EF] px-4 py-2 text-xs font-semibold text-[#412460]">
              View only
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {rateEntries.map(([code, rate]) => (
              <div key={code} className="rounded-2xl border border-[#E1E3EE] bg-[#F7F6F2] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2D2D2D]/45">
                  {currencySymbols?.[code] || ""} {code}
                </p>
                <p className="mt-2 text-2xl font-bold text-[#2D2D2D]">{Number(rate).toFixed(2)}</p>
                <p className="mt-1 text-[11px] text-[#2D2D2D]/40">1 USD = {Number(rate).toFixed(2)} {code}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[#E1E3EE] bg-white p-6">
          <h2 className="text-lg font-semibold text-[#412460]">Company-wide settings</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#2D2D2D]/55">
            Transport cost management and HS code management are company-wide settings
            managed by the admin. If you need a change, please contact your administrator.
          </p>
        </div>
      </div>
    </StaffPageShell>
  );
}
