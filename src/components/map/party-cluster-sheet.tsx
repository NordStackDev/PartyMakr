"use client";

import Link from "next/link";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Search, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { requestJoin } from "@/lib/parties/actions";
import { formatDistance, haversineM } from "@/lib/geo";
import { fillFor } from "@/lib/party-display";
import { Avatar } from "@/components/friends/avatar";
import type { NearbyParty } from "./party-map";

// "tir. 7. jul. kl. 21.00" — the weekday makes the list scannable at a glance.
function fmtDay(value: string): string {
  const d = new Date(value);
  const date = d.toLocaleDateString("da-DK", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} kl. ${time}`;
}

/** My relationship to a party: attendee status and/or join-request status. */
type Mine = { att?: string; req?: string };

type DateSel = "all" | "today" | "weekend";

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function isWeekend(iso: string): boolean {
  const wd = new Date(iso).getDay();
  return wd === 0 || wd === 6;
}

function hasRoom(p: NearbyParty): boolean {
  if (!p.capacity || p.capacity <= 0) return true;
  return (p.going_count ?? 0) < p.capacity;
}

// Below this many parties a postcode reads fine as a plain list — filters only
// appear once it's big enough to get unwieldy (e.g. 8000 Aarhus C).
const FILTER_THRESHOLD = 4;

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-[var(--brand)] text-zinc-950"
          : "border border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Bottom sheet listing every party inside a tapped postcode circle, each with
 * the distance from the user (whole km, never below 1) and an inline
 * "request to join" action. Styled like the nav pull-up sheet.
 */
export function PartyClusterSheet({
  navn,
  nr,
  parties,
  me,
  onClose,
}: {
  navn: string;
  nr: string;
  parties: NearbyParty[];
  me: [number, number] | null;
  onClose: () => void;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [mine, setMine] = useState<Record<string, Mine>>({});
  const [hosts, setHosts] = useState<
    Record<string, { name: string; avatarUrl: string | null }>
  >({});
  const [pending, start] = useTransition();

  // Search + quick filters (only surfaced for busy postcodes, see below).
  const [query, setQuery] = useState("");
  const [dateSel, setDateSel] = useState<DateSel>("all");
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  // Portal to <body> (same pattern as the help guide): rendered inside the
  // map subtree the sheet would stack UNDER the bottom nav and be clipped by
  // the phone-frame card. useSyncExternalStore gives false during SSR and
  // true on the client, without a setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // My own request/attendance rows for the listed parties (RLS-scoped).
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      setUid(user.id);

      const ids = parties.map((p) => p.id);
      const hostIds = [...new Set(parties.map((p) => p.host_id))];
      const [{ data: reqs }, { data: atts }, { data: profs }] =
        await Promise.all([
          supabase
            .from("party_join_requests")
            .select("party_id, status")
            .eq("user_id", user.id)
            .in("party_id", ids),
          supabase
            .from("party_attendees")
            .select("party_id, status")
            .eq("user_id", user.id)
            .in("party_id", ids),
          supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", hostIds),
        ]);
      if (!active) return;

      const hostMap: Record<
        string,
        { name: string; avatarUrl: string | null }
      > = {};
      for (const p of profs ?? []) {
        hostMap[p.id] = {
          name: p.display_name || p.username || "Vært",
          avatarUrl: p.avatar_url ?? null,
        };
      }
      setHosts(hostMap);

      const next: Record<string, Mine> = {};
      for (const r of reqs ?? []) {
        next[r.party_id] = { ...next[r.party_id], req: r.status };
      }
      for (const a of atts ?? []) {
        next[a.party_id] = { ...next[a.party_id], att: a.status };
      }
      setMine(next);
    })();
    return () => {
      active = false;
    };
  }, [parties]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function ask(partyId: string) {
    start(async () => {
      try {
        await requestJoin(partyId);
        setMine((m) => ({
          ...m,
          [partyId]: { ...m[partyId], req: "pending" },
        }));
      } catch {
        // Leave the button as-is so the user can retry.
      }
    });
  }

  const showFilters = parties.length > FILTER_THRESHOLD;
  const q = query.trim().toLowerCase();
  const filtersActive =
    q !== "" || dateSel !== "all" || onlyFree || onlyAvailable;

  // Filter then sort chronologically (soonest first).
  const shown = useMemo(() => {
    return [...parties]
      .filter((p) => {
        if (q) {
          const host = hosts[p.host_id]?.name?.toLowerCase() ?? "";
          if (!p.title.toLowerCase().includes(q) && !host.includes(q)) {
            return false;
          }
        }
        if (dateSel === "today" && !isToday(p.starts_at)) return false;
        if (dateSel === "weekend" && !isWeekend(p.starts_at)) return false;
        if (onlyFree && p.entre_dkk && p.entre_dkk > 0) return false;
        if (onlyAvailable && !hasRoom(p)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
  }, [parties, q, dateSel, onlyFree, onlyAvailable, hosts]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1300]">
      <button
        type="button"
        aria-label="Luk"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Fester i ${navn}`}
        className="absolute inset-x-0 bottom-0 max-h-[75%] overflow-y-auto rounded-t-3xl border-t border-white/12 bg-[#1c1610]/95 p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-2xl"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              {navn} {nr}
            </h2>
            <p className="text-xs text-zinc-400">
              {filtersActive
                ? `${shown.length} af ${parties.length} fester`
                : `${parties.length} ${parties.length === 1 ? "fest" : "fester"} i dette postnummer`}{" "}
              · omtrentligt område
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {showFilters ? (
          <div className="mt-3">
            <div className="relative">
              <Search
                size={15}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Søg efter fest eller vært"
                aria-label="Søg i fester"
                className="w-full rounded-full border border-white/12 bg-white/5 py-2 pl-9 pr-8 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-white/25"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Ryd søgning"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
              <FilterChip
                active={dateSel === "today"}
                onClick={() =>
                  setDateSel((s) => (s === "today" ? "all" : "today"))
                }
              >
                I dag
              </FilterChip>
              <FilterChip
                active={dateSel === "weekend"}
                onClick={() =>
                  setDateSel((s) => (s === "weekend" ? "all" : "weekend"))
                }
              >
                Weekend
              </FilterChip>
              <FilterChip active={onlyFree} onClick={() => setOnlyFree((f) => !f)}>
                Gratis
              </FilterChip>
              <FilterChip
                active={onlyAvailable}
                onClick={() => setOnlyAvailable((a) => !a)}
              >
                Ledige pladser
              </FilterChip>
            </div>
          </div>
        ) : null}

        {shown.length === 0 ? (
          <p className="mt-6 text-center text-sm text-zinc-400">
            Ingen fester matcher dine filtre.
          </p>
        ) : null}

        <ul className="mt-4 space-y-2.5">
          {shown.map((p) => {
            const fill = fillFor(p.going_count ?? 0, p.capacity);
            const m = mine[p.id];
            const isHost = uid != null && p.host_id === uid;
            const distM = me
              ? haversineM(me[0], me[1], p.lat, p.lon)
              : p.distance_m;
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <Link
                  href={`/parties/${p.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar
                    url={hosts[p.host_id]?.avatarUrl ?? null}
                    name={hosts[p.host_id]?.name}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: fill.color }}
                      />
                      <span className="truncate text-[15px] font-semibold tracking-tight text-white">
                        {p.title}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-zinc-400">
                      {hosts[p.host_id]?.name ?? "Vært"} ·{" "}
                      {fmtDay(p.starts_at)}
                      <span className="text-zinc-500">
                        {" "}
                        · {formatDistance(distM)}
                      </span>
                    </span>
                  </span>
                </Link>

                {isHost ? (
                  <span className="shrink-0 rounded-full bg-zinc-500/20 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
                    Din fest
                  </span>
                ) : m?.att === "going" ? (
                  <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    Du deltager
                  </span>
                ) : m?.req === "pending" ? (
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                    Afventer svar
                  </span>
                ) : p.entre_dkk && p.entre_dkk > 0 ? (
                  // Paid: joining + payment happens on the party page (row links).
                  <span className="shrink-0 rounded-full bg-[var(--brand)]/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
                    {p.entre_dkk} kr.
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => ask(p.id)}
                    className="shrink-0 rounded-full bg-[var(--brand)] px-3 py-1.5 text-[11px] font-semibold text-zinc-950 transition active:brightness-95 disabled:opacity-60"
                  >
                    {m?.req === "declined" ? "Anmod igen" : "Anmod"}
                  </button>
                )}
                <ChevronRight size={16} className="shrink-0 text-zinc-500" />
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
