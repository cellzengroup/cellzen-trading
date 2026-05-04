import React from "react";
import LogisticsPortal from "./LogisticsPortal";
import NoticesPanel from "../components/NoticesPanel";

export default function LogisticsNotices() {
  return (
    <LogisticsPortal activePage="Notices">
      <NoticesPanel
        audience="Logistics"
        intro="Track customs windows, freight readiness, and inspection plans across active shipments."
      />
    </LogisticsPortal>
  );
}
