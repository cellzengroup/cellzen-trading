import React from "react";
import AdminPortal from "./adminPortal";

export default function AdminPageShell({ activePage, title, eyebrow, children }) {
  return (
    <AdminPortal activePage={activePage} title={title} eyebrow={eyebrow}>
      {children}
    </AdminPortal>
  );
}
