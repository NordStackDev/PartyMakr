"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";

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
  going_count: number;
  lon: number;
  lat: number;
  distance_m: number;
};

// Copenhagen fallback if geolocation is denied/unavailable.
const FALLBACK: [number, number] = [55.6761, 12.5683];

// Party fullness → colour. Green = room to spare, orange = almost full,
// red = full. Parties without a capacity count as open (green).
type Fill = { color: string; label: string };
const FILL_OPEN: Fill = { color: "#34d399", label: "Ledige pladser" };
const FILL_ALMOST: Fill = { color: "#f97316", label: "Næsten fuld" };
const FILL_FULL: Fill = { color: "#ef4444", label: "Fuld" };

function fillFor(going: number, capacity: number | null): Fill {
  if (!capacity || capacity <= 0) return FILL_OPEN;
  const ratio = going / capacity;
  if (ratio >= 1) return FILL_FULL;
  if (ratio >= 0.7) return FILL_ALMOST;
  return FILL_OPEN;
}

function partyIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px ${color}59,0 2px 6px rgba(0,0,0,.5)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

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

// Privacy: don't reveal a party's exact address on the discovery map. Each
// party is drawn as an approximate area instead of a precise pin. The shown
// centre is also nudged off the true point by a small, deterministic offset
// (seeded by the party id) so the circle's centre isn't the real spot either —
// stable across renders, but never exact.
const AREA_RADIUS_M = 250; // size of the "somewhere around here" circle
const MAX_OFFSET_M = 120; // how far the centre is nudged (always < radius)

function areaStyle(color: string) {
  return {
    color,
    weight: 1.5,
    opacity: 0.7,
    fillColor: color,
    fillOpacity: 0.15,
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function fuzzedCenter(lat: number, lon: number, id: string): [number, number] {
  const h = hashStr(id);
  const angle = ((h % 360) * Math.PI) / 180;
  const dist = (((h >>> 9) % 1000) / 1000) * MAX_OFFSET_M;
  const dLat = (dist * Math.cos(angle)) / 111320;
  const dLon =
    (dist * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lon + dLon];
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
      className="pm-fullmap absolute inset-0"
      style={{ background: "#120d22" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {me ? <Marker position={me} icon={meIcon} /> : null}

      {parties.map((p) => {
        const center = fuzzedCenter(p.lat, p.lon, p.id);
        const going = p.going_count ?? 0;
        const fill = fillFor(going, p.capacity);
        return (
          <Fragment key={p.id}>
            <Circle
              center={center}
              radius={AREA_RADIUS_M}
              pathOptions={areaStyle(fill.color)}
            />
            <Marker position={center} icon={partyIcon(fill.color)}>
              <Popup>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-zinc-900">{p.title}</p>
                  <p className="text-xs text-zinc-600">{fmt(p.starts_at)}</p>
                  <p className="text-xs text-zinc-500">{distance(p.distance_m)}</p>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium">
                    <span
                      style={{ background: fill.color }}
                      className="inline-block h-2 w-2 rounded-full"
                    />
                    <span className="text-zinc-700">
                      {fill.label}
                      {p.capacity ? ` · ${going}/${p.capacity}` : ""}
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-400">Omtrentligt område</p>
                  <Link
                    href={`/parties/${p.id}`}
                    className="inline-block pt-1 text-xs font-semibold text-amber-700 underline"
                  >
                    Se fest →
                  </Link>
                </div>
              </Popup>
            </Marker>
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
