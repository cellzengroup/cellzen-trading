import React from "react";
import StaffPortal from "./staffPortal";

export default function StaffPageShell({ activePage, title, eyebrow, children }) {
  return (
    <StaffPortal activePage={activePage} title={title} eyebrow={eyebrow}>
      {children}
    </StaffPortal>
  );
}
