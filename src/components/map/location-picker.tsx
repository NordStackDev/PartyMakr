"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";

const FALLBACK: [number, number] = [55.6761, 12.5683];

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#FCBE4F;border:2px solid #14100b;box-shadow:0 0 0 2px rgba(252,190,79,.35),0 2px 6px rgba(0,0,0,.5)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// A target to fly the map to (e.g. a postcode's city). `nonce` changes on
// every request so searching the same postcode twice still recenters.
export type FlyTarget = { lat: number; lng: number; nonce: number };

function FlyTo({ target }: { target: FlyTarget | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 13), {
        duration: 0.6,
      });
    }
  }, [target, map]);
  return null;
}

function ClickCapture({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({
  value,
  onPick,
  flyTo = null,
}: {
  value: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
  flyTo?: FlyTarget | null;
}) {
  const [center, setCenter] = useState<[number, number]>(FALLBACK);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setCenter([p.coords.latitude, p.coords.longitude]);
          setReady(true);
        },
        () => setReady(true),
        { timeout: 8000, maximumAge: 600000 },
      );
      return;
    }
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        Henter kort…
      </div>
    );
  }

  return (
    <MapContainer
      center={value ? [value.lat, value.lng] : center}
      zoom={13}
      // Street names, no house numbers (CARTO renders none; cap zoom too).
      maxZoom={16}
      className="h-full w-full"
      style={{ background: "#14100b" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={16}
      />
      <FlyTo target={flyTo} />
      <ClickCapture onPick={onPick} />
      {value ? <Marker position={[value.lat, value.lng]} icon={pinIcon} /> : null}
    </MapContainer>
  );
}
