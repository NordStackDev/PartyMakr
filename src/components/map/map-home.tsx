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

export function MapHome({
  radiusKm,
  admin = false,
}: {
  radiusKm: number;
  admin?: boolean;
}) {
  return <PartyMap radiusKm={radiusKm} admin={admin} />;
}
