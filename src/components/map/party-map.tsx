"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
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
const RADIUS_M = 50000;

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

export default function PartyMap() {
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [parties, setParties] = useState<NearbyParty[]>([]);

  useEffect(() => {
    const supabase = createClient();

    async function load(lat: number, lng: number, isMe: boolean) {
      setCenter([lat, lng]);
      if (isMe) setMe([lat, lng]);
      const { data } = await supabase.rpc("nearby_parties", {
        lat,
        lng,
        radius_m: RADIUS_M,
      });
      setParties((data ?? []) as NearbyParty[]);
    }

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude, true),
        () => load(FALLBACK[0], FALLBACK[1], false),
        { timeout: 8000 },
      );
    } else {
      load(FALLBACK[0], FALLBACK[1], false);
    }
  }, []);

  if (!center) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        Finder din placering…
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full"
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
