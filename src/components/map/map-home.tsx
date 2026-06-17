"use client";

import dynamic from "next/dynamic";

import { Loader } from "@/components/loader";

// Leaflet needs the browser (window), so load it client-only.
const PartyMap = dynamic(() => import("./party-map"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <Loader withLogo label="Henter kort…" />
    </div>
  ),
});

export function MapHome({ radiusKm }: { radiusKm: number }) {
  return <PartyMap radiusKm={radiusKm} />;
}
