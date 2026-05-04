import React from "react";
import PartnersPortal from "./PartnersPortal";
import NoticesPanel from "../components/NoticesPanel";

export default function PartnerNotices() {
  return (
    <PartnersPortal activePage="Notices">
      <NoticesPanel
        audience="Partner"
        intro="Plan joint shipments and partnership deliverables with the latest Cellzen operational updates."
      />
    </PartnersPortal>
  );
}
