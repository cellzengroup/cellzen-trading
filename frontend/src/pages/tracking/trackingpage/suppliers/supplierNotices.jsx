import React from "react";
import SupplierPortal from "./SupplierPortal";
import NoticesPanel from "../components/NoticesPanel";

export default function SupplierNotices() {
  return (
    <SupplierPortal activePage="Notices">
      <NoticesPanel
        audience="Supplier"
        intro="Stay aligned on production timelines, inspection windows, and dispatch readiness for Cellzen orders."
      />
    </SupplierPortal>
  );
}
