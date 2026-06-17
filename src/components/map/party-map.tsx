"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";

import { createClient } from "@/lib/supabase/client";

type NearbyParty = {
  id: string;
  title: string;
  description: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: "public" | "private";
  capacity: number | null;
  lon: number;
  lat: number;
  distance_m: number;
};

// Copenhagen fallback if geolocation is denied/unavailable.
const FALLBACK: [number, number] = [55.6761, 12.5683];

const partyIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:9999px;background:#FCBE4F;border:2px solid #120d22;box-shadow:0 0 0 2px rgba(252,190,79,.35),0 2px 6px rgba(0,0,0,.5)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#63bfcb;border:2px solid #fff;box-shadow:0 0 0 4px rgba(99,191,203,.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function fmt(value: string): string {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function distance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m væk` : `${(m / 1000).toFixed(1)} km væk`;
}

// Remember the last known position across navigations so the map appears
// instantly instead of re-running geolocation from scratch every time.
const POS_KEY = "pm_last_pos";

function readPos(): [number, number] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { lat: number; lng: number };
    return [p.lat, p.lng];
  } catch {
    return null;
  }
}

function writePos(lat: number, lng: number) {
  try {
    sessionStorage.setItem(POS_KEY, JSON.stringify({ lat, lng }));
  } catch {
    /* ignore */
  }
}

export default function PartyMap({ radiusKm = 25 }: { radiusKm?: number }) {
  const cached = readPos();
  const [center, setCenter] = useState<[number, number] | null>(cached);
  const [me, setMe] = useState<[number, number] | null>(cached);
  const [parties, setParties] = useState<NearbyParty[]>([]);
  const loaded = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode running the effect twice in dev.
    if (loaded.current) return;
    loaded.current = true;

    const supabase = createClient();

    async function load(lat: number, lng: number, isMe: boolean) {
      setCenter((c) => c ?? [lat, lng]);
      if (isMe) {
        setMe([lat, lng]);
        writePos(lat, lng);
      }
      const { data } = await supabase.rpc("nearby_parties", {
        lat,
        lng,
        radius_m: Math.round(radiusKm * 1000),
      });
      setParties((data ?? []) as NearbyParty[]);
    }

    const fallback = readPos() ?? FALLBACK;

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude, true),
        () => load(fallback[0], fallback[1], false),
        // Accept a position up to 10 min old so revisits resolve instantly
        // and don't re-prompt.
        { timeout: 8000, maximumAge: 600000 },
      );
    } else {
      load(fallback[0], fallback[1], false);
    }
  }, [radiusKm]);

  if (!center) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-300">
        Finder din placering…
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={12}
      scrollWheelZoom
      className="absolute inset-0"
      style={{ background: "#120d22" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {me ? <Marker position={me} icon={meIcon} /> : null}

      {parties.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lon]} icon={partyIcon}>
          <Popup>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-zinc-900">{p.title}</p>
              <p className="text-xs text-zinc-600">{fmt(p.starts_at)}</p>
              <p className="text-xs text-zinc-500">{distance(p.distance_m)}</p>
              <Link
                href={`/parties/${p.id}`}
                className="inline-block pt-1 text-xs font-semibold text-amber-700 underline"
              >
                Se fest →
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
