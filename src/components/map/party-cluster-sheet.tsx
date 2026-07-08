"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";

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
              {parties.length} {parties.length === 1 ? "fest" : "fester"} i
              dette postnummer · omtrentligt område
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

        <ul className="mt-4 space-y-2.5">
          {parties.map((p) => {
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
