"use client";

import dynamic from "next/dynamic";

import { Loader } from "@/components/loader";

// Leaflet needs the browser (window), so load it client-only.
const PartyMap = dynamic(() => import("./party-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader withLogo label="Henter kort…" />
    </div>
  ),
});

export function MapHome() {
  return <PartyMap />;
}
