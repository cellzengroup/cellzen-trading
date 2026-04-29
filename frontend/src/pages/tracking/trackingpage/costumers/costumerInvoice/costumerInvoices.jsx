import React from "react";
import CostumersPortal from "../CostumersPortal";
import SharedInvoicesList from "../../SharedInvoicesList";

export default function Invoices() {
  return (
    <CostumersPortal activePage="Invoices">
      <SharedInvoicesList subtitle="View invoices shared with your customer account" />
    </CostumersPortal>
  );
}
