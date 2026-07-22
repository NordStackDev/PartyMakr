"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Users, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { respondGroupRequest } from "@/lib/parties/actions";
import { Avatar } from "@/components/friends/avatar";

type PendingGroup = {
  id: string;
  leaderName: string;
  leaderAvatar: string | null;
  size: number; // accepted members, incl. leader
};

/**
 * Host view: groups awaiting approval. Shows the group size and the remaining
 * capacity; approving turns every accepted member into 'going' (capacity is
 * enforced server-side, and its Danish error is surfaced inline).
 */
export function HostGroupRequests({
  partyId,
  capacity,
  goingCount,
}: {
  partyId: string;
  capacity: number | null;
  goingCount: number;
}) {
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped after each successful action to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const { data: grows } = await supabase
        .from("party_groups")
        .select("id, leader_id")
        .eq("party_id", partyId)
        .eq("status", "requested");
      if (!active) return;

      const rows = (grows ?? []) as { id: string; leader_id: string }[];
      if (rows.length === 0) {
        setGroups([]);
        setLoaded(true);
        return;
      }

      const { data: members } = await supabase
        .from("party_group_members")
        .select("group_id, user_id, status")
        .in(
          "group_id",
          rows.map((g) => g.id),
        );
      const mrows = (members ?? []) as {
        group_id: string;
        user_id: string;
        status: string;
      }[];

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in(
          "id",
          rows.map((g) => g.leader_id),
        );
      if (!active) return;

      const pmap = new Map(
        ((profs ?? []) as {
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }[]).map((p) => [p.id, p]),
      );

      setGroups(
        rows.map((g) => {
          const lp = pmap.get(g.leader_id);
          return {
            id: g.id,
            leaderName: lp?.display_name || lp?.username || "Ukendt bruger",
            leaderAvatar: lp?.avatar_url ?? null,
            size: mrows.filter(
              (m) => m.group_id === g.id && m.status === "accepted",
            ).length,
          };
        }),
      );
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [partyId, reloadKey]);

  function respond(groupId: string, accept: boolean) {
    setError(null);
    start(async () => {
      const res = await respondGroupRequest(partyId, groupId, accept);
      if (res.error) {
        setError(res.error);
        return;
      }
      setReloadKey((k) => k + 1);
    });
  }

  if (!loaded || groups.length === 0) return null;

  const remaining = capacity != null ? Math.max(capacity - goingCount, 0) : null;

  return (
    <div>
      <p className="auth-label mb-2">Gruppeanmodninger ({groups.length})</p>
      {error ? (
        <p className="mb-2 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
      <ul className="space-y-2">
        {groups.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          >
            <span className="flex min-w-0 items-center gap-3">
              <Avatar url={g.leaderAvatar} name={g.leaderName} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm text-zinc-100">
                  {g.leaderName}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Users size={12} />
                  {g.size} {g.size === 1 ? "person" : "personer"}
                  {remaining != null ? ` · ${remaining} pladser tilbage` : ""}
                </span>
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label={`Godkend ${g.leaderName}s gruppe`}
                disabled={pending}
                onClick={() => respond(g.id, true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-60"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                aria-label={`Afvis ${g.leaderName}s gruppe`}
                disabled={pending}
                onClick={() => respond(g.id, false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-red-400/15 text-red-300 transition hover:bg-red-400/25 disabled:opacity-60"
              >
                <X size={16} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
