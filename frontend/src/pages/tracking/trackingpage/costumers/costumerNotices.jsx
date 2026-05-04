import React from "react";
import CostumersPortal from "./CostumersPortal";
import NoticesPanel from "../components/NoticesPanel";

export default function CostumerNotices() {
  return (
    <CostumersPortal activePage="Notices">
      <NoticesPanel
        audience="Customer"
        intro="Stay on top of timelines, customs, inspection planning, and quotation steps so your orders move smoothly."
      />
    </CostumersPortal>
  );
}
