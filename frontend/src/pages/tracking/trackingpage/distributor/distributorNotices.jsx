import React from "react";
import DistributorPortal from "./DistributorPortal";
import NoticesPanel from "../components/NoticesPanel";

export default function DistributorNotices() {
  return (
    <DistributorPortal activePage="Notices">
      <NoticesPanel
        audience="Distributor"
        intro="Coordinate routes, deliveries, and customer expectations with the latest operational notes."
      />
    </DistributorPortal>
  );
}
