"use client";

import dynamic from "next/dynamic";

const Canvas = dynamic(() => import("./mini-map-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-300">
      Henter kort…
    </div>
  ),
});

export function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return <Canvas lat={lat} lng={lng} />;
}
