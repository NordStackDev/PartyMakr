"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  LocateFixed,
  Search,
  Users,
} from "lucide-react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  AttributionControl,
} from "react-leaflet";

import { createClient } from "@/lib/supabase/client";
import { setMapApi } from "@/lib/map-controls";
import { formatDistance, haversineM } from "@/lib/geo";
import { fillFor, fmtDateTime } from "@/lib/party-display";
import {
  lookupPostcode,
  reversePostcode,
  type PostcodeRef,
} from "@/lib/postcode";
import { PartyClusterSheet } from "./party-cluster-sheet";

export type NearbyParty = {
  id: string;
  host_id: string;
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
    attribution: "&copy; Esri",
    subdomains: "",
  },
};

function partyIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:9999px;background:${color};box-shadow:0 0 0 2px ${color}59,0 2px 6px rgba(0,0,0,.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

// Postcode pin: a gold map pin showing how many parties the postcode holds.
// The teardrop is a rotated square; the count sits in an unrotated overlay.
function postcodePin(count: number) {
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:34px;height:42px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))">
      <div style="position:absolute;left:1px;top:1px;width:32px;height:32px;background:#FCBE4F;border:2px solid #63bfcb;border-radius:50% 50% 50% 0;transform:rotate(-45deg)"></div>
      <div style="position:absolute;left:1px;top:1px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#14100b">${count}</div>
    </div>`,
    iconSize: [34, 42],
    iconAnchor: [17, 40],
  });
}

const meIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#63bfcb;border:2px solid #fff;box-shadow:0 0 0 4px rgba(99,191,203,.3)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});


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

// Parties in the SAME POSTCODE render as one pin (with an area circle around
// it) placed on the postcode's town centre — tapping it opens a sheet listing
// every party inside. Postcodes come from DAWA reverse lookup (lib/postcode).
const POSTCODE_RADIUS_M = 450;

export type PostcodeGroup = {
  nr: string;
  navn: string;
  center: [number, number];
  parties: NearbyParty[];
};

// Remember the last known position across visits so the map opens at the user's
// real location instead of the Copenhagen fallback. localStorage (not session)
// so it survives full reloads, new tabs and reopening the PWA.
const POS_KEY = "pm_last_pos";

function readPos(): [number, number] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { lat: number; lng: number };
    return [p.lat, p.lng];
  } catch {
    return null;
  }
}

function writePos(lat: number, lng: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ lat, lng }));
  } catch {
    /* ignore */
  }
}

export default function PartyMap({
  radiusKm = 250,
  admin = false,
}: {
  radiusKm?: number;
  admin?: boolean;
}) {
  const cached = readPos();
  const [center, setCenter] = useState<[number, number] | null>(cached);
  const [me, setMe] = useState<[number, number] | null>(cached);
  const [parties, setParties] = useState<NearbyParty[]>([]);
  const [base, setBase] = useState<"satellite" | "dark">("satellite");
  const [locating, setLocating] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [supabase] = useState(createClient);
  const mapRef = useRef<L.Map | null>(null);
  const loaded = useRef(false);
  const [pcByParty, setPcByParty] = useState<
    Record<string, PostcodeRef | null>
  >({});
  const [pcCenters, setPcCenters] = useState<Record<string, [number, number]>>(
    {},
  );
  const [sheet, setSheet] = useState<PostcodeGroup | null>(null);

  // Always the distance from the USER — parties may have been loaded around a
  // searched postcode, whose RPC distance_m would mislead here.
  const distFromMe = useCallback(
    (p: NearbyParty) =>
      me ? haversineM(me[0], me[1], p.lat, p.lon) : p.distance_m,
    [me],
  );

  // Resolve each party's postcode + each postcode's town centre (both cached
  // in lib/postcode, so revisits are instant and offline-safe).
  useEffect(() => {
    let active = true;
    (async () => {
      const entries = await Promise.all(
        parties.map(
          async (p) => [p.id, await reversePostcode(p.lat, p.lon)] as const,
        ),
      );
      if (!active) return;
      setPcByParty(Object.fromEntries(entries));

      const nrs = [...new Set(entries.flatMap(([, r]) => (r ? [r.nr] : [])))];
      const centers = await Promise.all(
        nrs.map(async (nr) => [nr, await lookupPostcode(nr)] as const),
      );
      if (!active) return;
      const next: Record<string, [number, number]> = {};
      for (const [nr, hit] of centers) {
        if (hit) next[nr] = [hit.lat, hit.lng];
      }
      setPcCenters((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      active = false;
    };
  }, [parties]);

  // EVERY party renders inside its postcode's circle on the town — also when
  // it's alone there (best privacy: the circle never narrows down the spot).
  // Only parties whose postcode can't be resolved (lookup failed / outside
  // DK) fall back to an individual fuzzed circle.
  const { groups, singles } = useMemo(() => {
    const byNr = new Map<string, NearbyParty[]>();
    const singles: NearbyParty[] = [];
    for (const p of parties) {
      const nr = pcByParty[p.id]?.nr;
      if (nr) byNr.set(nr, [...(byNr.get(nr) ?? []), p]);
      else singles.push(p);
    }
    const groups: PostcodeGroup[] = [];
    for (const [nr, list] of byNr) {
      const center = pcCenters[nr];
      if (center) {
        groups.push({
          nr,
          navn: pcByParty[list[0].id]?.navn ?? "",
          center,
          parties: list,
        });
      } else {
        singles.push(...list);
      }
    }
    return { groups, singles };
  }, [parties, pcByParty, pcCenters]);

  const loadParties = useCallback(
    async (lat: number, lng: number) => {
      const { data } = await supabase.rpc("nearby_parties", {
        lat,
        lng,
        radius_m: Math.round(radiusKm * 1000),
      });
      setParties((data ?? []) as NearbyParty[]);
      setSheet(null); // the open list may no longer match the loaded area
    },
    [supabase, radiusKm],
  );

  useEffect(() => {
    // Guard against React StrictMode running the effect twice in dev.
    if (loaded.current) return;
    loaded.current = true;

    const onPos = (lat: number, lng: number, isMe: boolean) => {
      // Initial render uses `center`; once the map is mounted, fly to the user
      // so we always end up at their real location (even if we opened at a
      // cached spot or the user only just granted permission).
      setCenter((c) => c ?? [lat, lng]);
      if (isMe) {
        setMe([lat, lng]);
        writePos(lat, lng);
        const map = mapRef.current;
        if (map) {
          map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
        }
      }
      loadParties(lat, lng);
    };

    const applyFallback = () => {
      const fb = readPos() ?? FALLBACK;
      onPos(fb[0], fb[1], false);
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      applyFallback();
      return;
    }

    const locate = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => onPos(pos.coords.latitude, pos.coords.longitude, true),
        applyFallback,
        // Accept a position up to 10 min old so revisits resolve instantly.
        { timeout: 8000, maximumAge: 600000 },
      );

    // Use the Permissions API (where available) so we know whether a prompt
    // will appear, and so we can auto-recenter the moment the user enables
    // location later — instead of silently staying on the fallback.
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "denied") applyFallback();
          else locate();
          status.onchange = () => {
            if (status.state === "granted") locate();
          };
        })
        .catch(locate);
    } else {
      locate();
    }
  }, [loadParties]);

  // Re-locate the user and fly the map to them.
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

  // Jump to a Danish postcode's city and load the parties around it. The
  // popups still show the distance from the user (see haversineM).
  const searchPostcode = useCallback(
    async (value: string) => {
      const hit = await lookupPostcode(value);
      if (!hit) {
        setSearchError(true);
        return;
      }
      setSearchError(false);
      setQuery("");
      setSearchOpen(false);
      mapRef.current?.flyTo([hit.lat, hit.lng], 12, { duration: 0.8 });
      loadParties(hit.lat, hit.lng);
    },
    [loadParties],
  );

  // Publish map actions to the pull-up menu (cleared on unmount / leaving map).
  useEffect(() => {
    setMapApi({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      toggleBase: () =>
        setBase((b) => (b === "satellite" ? "dark" : "satellite")),
      admin,
    });
    return () => setMapApi(null);
  }, [admin]);

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
        zoomControl={false}
        preferCanvas
        attributionControl={false}
        ref={mapRef}
        className="pm-fullmap absolute inset-0"
        style={{ background: "#14100b" }}
      >
        <AttributionControl position="bottomright" prefix={false} />
        <TileLayer
          key={base}
          url={TILES[base].url}
          attribution={TILES[base].attribution}
          subdomains={TILES[base].subdomains}
          maxZoom={MAX_ZOOM}
          keepBuffer={4}
          updateWhenIdle={false}
        />

        {me ? <Marker position={me} icon={meIcon} interactive={false} /> : null}

        {groups.map((g) => (
          /* Pin + area circle on the postcode's town — tap opens the list. */
          <Fragment key={g.nr}>
            <Circle
              center={g.center}
              radius={POSTCODE_RADIUS_M}
              pathOptions={areaStyle("#FCBE4F")}
              eventHandlers={{ click: () => setSheet(g) }}
            />
            <Marker
              position={g.center}
              icon={postcodePin(g.parties.length)}
              eventHandlers={{ click: () => setSheet(g) }}
            />
          </Fragment>
        ))}

        {singles.map((p) => {
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
                        {formatDistance(distFromMe(p))}
                      </span>
                    </div>

                    <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300">
                      <CalendarDays size={13} className="text-amber-300" />
                      {fmtDateTime(p.starts_at)}
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

      {/* Postcode search — jump the map to any Danish city. Stacked above the
          locate button. */}
      <div className="absolute bottom-[calc(var(--nav-height)+4.25rem)] left-10 z-[1000] flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o);
            setSearchError(false);
          }}
          aria-label="Søg postnummer"
          aria-expanded={searchOpen}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#14100b]/70 text-zinc-100 shadow-lg shadow-black/40 backdrop-blur-md transition active:scale-95"
        >
          <Search size={20} />
        </button>
        {searchOpen ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setQuery(v);
              setSearchError(false);
              if (v.length === 4) searchPostcode(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") searchPostcode(query);
            }}
            inputMode="numeric"
            maxLength={4}
            placeholder="Postnr."
            aria-label="Postnummer"
            className={`h-11 w-28 rounded-full border bg-[#14100b]/70 px-4 text-sm text-zinc-100 placeholder-zinc-500 shadow-lg shadow-black/40 outline-none backdrop-blur-md ${
              searchError ? "border-red-400/60" : "border-white/15"
            }`}
          />
        ) : null}
      </div>

      {/* Party list for a tapped postcode circle — request to join inline. */}
      {sheet ? (
        <PartyClusterSheet
          navn={sheet.navn}
          nr={sheet.nr}
          parties={sheet.parties}
          me={me}
          onClose={() => setSheet(null)}
        />
      ) : null}

      {/* Find-my-location — standalone on the map (other controls live in the
          pull-up menu). Thumb-reachable, just above the floating tab bar. */}
      <button
        type="button"
        onClick={recenter}
        aria-label="Find min placering"
        className="absolute bottom-[calc(var(--nav-height)+0.75rem)] left-10 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#14100b]/70 text-zinc-100 shadow-lg shadow-black/40 backdrop-blur-md transition active:scale-95"
      >
        <LocateFixed
          size={20}
          className={locating ? "animate-spin text-amber-300" : ""}
        />
      </button>
    </>
  );
}
