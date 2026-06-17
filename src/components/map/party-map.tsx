"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, LocateFixed, Users } from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  AttributionControl,
  LayersControl,
} from "react-leaflet";

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

// Base map tiles. Cap zoom (see MAX_ZOOM) so individual house numbers are never
// shown — together with the fuzzed party circles this keeps exact spots private.
const MAX_ZOOM = 16;
const TILES = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
    subdomains: "",
  },
};

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
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px ${color}59,0 2px 6px rgba(0,0,0,.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
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
const AREA_RADIUS_M = 150; // size of the "somewhere around here" circle
const MAX_OFFSET_M = 70; // how far the centre is nudged (always < radius)

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
  const [locating, setLocating] = useState(false);
  const [supabase] = useState(createClient);
  const mapRef = useRef<L.Map | null>(null);
  const loaded = useRef(false);

  const loadParties = useCallback(
    async (lat: number, lng: number) => {
      const { data } = await supabase.rpc("nearby_parties", {
        lat,
        lng,
        radius_m: Math.round(radiusKm * 1000),
      });
      setParties((data ?? []) as NearbyParty[]);
    },
    [supabase, radiusKm],
  );

  useEffect(() => {
    // Guard against React StrictMode running the effect twice in dev.
    if (loaded.current) return;
    loaded.current = true;

    const onPos = (lat: number, lng: number, isMe: boolean) => {
      setCenter((c) => c ?? [lat, lng]);
      if (isMe) {
        setMe([lat, lng]);
        writePos(lat, lng);
      }
      loadParties(lat, lng);
    };

    const fallback = readPos() ?? FALLBACK;

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => onPos(pos.coords.latitude, pos.coords.longitude, true),
        () => onPos(fallback[0], fallback[1], false),
        // Accept a position up to 10 min old so revisits resolve instantly.
        { timeout: 8000, maximumAge: 600000 },
      );
    } else {
      onPos(fallback[0], fallback[1], false);
    }
  }, [loadParties]);

  // Re-locate the user and fly the map to them (tap target on the map).
  const recenter = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setMe([lat, lng]);
        writePos(lat, lng);
        const map = mapRef.current;
        if (map) {
          map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
        }
        loadParties(lat, lng);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  }, [loadParties]);

  if (!center) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-300">
        Finder din placering…
      </div>
    );
  }

  return (
    <>
      <MapContainer
        center={center}
        zoom={12}
        maxZoom={MAX_ZOOM}
        scrollWheelZoom
        zoomControl
        preferCanvas
        attributionControl={false}
        ref={mapRef}
        className="pm-fullmap absolute inset-0"
        style={{ background: "#120d22" }}
      >
        <AttributionControl position="bottomleft" prefix={false} />
        <LayersControl position="bottomright">
          <LayersControl.BaseLayer checked name="Satellit">
            <TileLayer
              url={TILES.satellite.url}
              attribution={TILES.satellite.attribution}
              maxZoom={MAX_ZOOM}
              keepBuffer={4}
              updateWhenIdle={false}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Mørkt">
            <TileLayer
              url={TILES.dark.url}
              attribution={TILES.dark.attribution}
              subdomains={TILES.dark.subdomains}
              maxZoom={MAX_ZOOM}
              keepBuffer={4}
              updateWhenIdle={false}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {me ? <Marker position={me} icon={meIcon} interactive={false} /> : null}

        {parties.map((p) => {
          const c = fuzzedCenter(p.lat, p.lon, p.id);
          const going = p.going_count ?? 0;
          const fill = fillFor(going, p.capacity);
          return (
            <Fragment key={p.id}>
              {/* The whole area circle is the tap target (easy on a phone). */}
              <Circle
                center={c}
                radius={AREA_RADIUS_M}
                pathOptions={areaStyle(fill.color)}
              >
                <Popup>
                  <div className="w-[13.5rem]">
                    <p className="text-sm font-semibold leading-snug text-white">
                      {p.title}
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          backgroundColor: `${fill.color}26`,
                          color: fill.color,
                        }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: fill.color }}
                        />
                        {fill.label}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {distance(p.distance_m)}
                      </span>
                    </div>

                    <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300">
                      <CalendarDays size={13} className="text-amber-300" />
                      {fmt(p.starts_at)}
                    </p>
                    {p.capacity ? (
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-400">
                        <Users size={13} className="text-zinc-500" />
                        {going}/{p.capacity} pladser · omtrentligt område
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Omtrentligt område
                      </p>
                    )}

                    <Link
                      href={`/parties/${p.id}`}
                      className="mt-3 flex items-center justify-center gap-1 rounded-full bg-[var(--brand)] px-3 py-2 text-xs font-semibold text-zinc-950 transition active:brightness-95"
                    >
                      Se fest <ArrowRight size={14} />
                    </Link>
                  </div>
                </Popup>
              </Circle>
              <Marker
                position={c}
                icon={partyIcon(fill.color)}
                interactive={false}
              />
            </Fragment>
          );
        })}
      </MapContainer>

      {/* Find-my-location button — thumb-reachable, clears the bottom bar. */}
      <button
        type="button"
        onClick={recenter}
        aria-label="Find min placering"
        className="absolute bottom-[calc(var(--nav-height)+2.75rem)] left-3 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#120d22]/70 text-zinc-100 shadow-lg shadow-black/40 backdrop-blur-md transition active:scale-95"
      >
        <LocateFixed
          size={20}
          className={locating ? "animate-spin text-amber-300" : ""}
        />
      </button>
    </>
  );
}
