import React from "react";
import DistributorPortal from "../DistributorPortal";
import SharedInvoicesList from "../../SharedInvoicesList";

export default function Invoices() {
  return (
    <DistributorPortal activePage="Invoices">
      <SharedInvoicesList subtitle="View invoices shared with your distributor account" allowExcelDownload />
    </DistributorPortal>
  );
}
