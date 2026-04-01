import React from "react";

import Footer from "../../components/ui/Footer";
import Section1 from "./Section1";
import Section2 from "./Section2";
import Section3 from "./Section3";
import Section4 from "./Section4";
import Section5 from "./Section5";
import Section6 from "./Section6";
import Section7 from "./Section7";

export default function Landingpage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#412460", width: "100vw", marginLeft: "calc(-50vw + 50%)", marginTop: "-2rem", marginBottom: "-2rem" }}>
      <main className="flex-grow">
        <Section1 />
        <Section2 />
        <Section3 />
        <Section4 />
        <Section5 />
        <Section6 />
        <Section7 />
      </main>
      <Footer />
    </div>
  );
}
