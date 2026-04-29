import React from "react";
import PartnersPortal from "../PartnersPortal";
import SharedInvoicesList from "../../SharedInvoicesList";

export default function Invoices() {
  return (
    <PartnersPortal activePage="Invoices">
      <SharedInvoicesList subtitle="View invoices shared with your partner account" allowExcelDownload />
    </PartnersPortal>
  );
}
