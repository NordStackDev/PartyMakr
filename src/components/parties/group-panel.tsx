"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Users, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  cancelGroup,
  createGroup,
  respondGroupInvite,
  submitGroup,
} from "@/lib/parties/actions";
import { Avatar } from "@/components/friends/avatar";
import { FriendMultiSelect } from "@/components/friends/friend-multi-select";

type MemberStatus = "pending" | "accepted" | "declined";
type GroupStatus =
  | "forming"
  | "requested"
  | "approved"
  | "paid"
  | "declined"
  | "cancelled";

type Member = {
  userId: string;
  status: MemberStatus;
  name: string;
  avatarUrl: string | null;
};
type Group = {
  id: string;
  leaderId: string;
  status: GroupStatus;
  members: Member[];
};

// Statuses that count as "an active group I'm part of" (declined/cancelled let
// the user start over, so we treat them as no group).
const LIVE: GroupStatus[] = ["forming", "requested", "approved", "paid"];

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
  accepted: {
    label: "Deltager",
    cls: "bg-emerald-400/15 text-emerald-300",
  },
  pending: { label: "Afventer", cls: "bg-amber-400/15 text-amber-300" },
  declined: { label: "Takkede nej", cls: "bg-red-400/10 text-red-300" },
};

/**
 * Guest-side group signup on the party page: form a group with friends, invited
 * friends accept/decline, the leader submits to the host. For free parties an
 * approval confirms everyone immediately (Phase A). Self-fetches the caller's
 * group (RLS returns only groups they lead or are invited to).
 */
export function GroupPanel({
  partyId,
  entreDkk,
  feeDkk = 0,
}: {
  partyId: string;
  entreDkk: number | null;
  /** Marketplace mode: the platform fee per ticket on top of the price. */
  feeDkk?: number;
}) {
  const [uid, setUid] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bumped after each successful action to re-run the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;
      setUid(user.id);

      // RLS scopes this to groups the caller can see (their own, as a guest).
      const { data: groups } = await supabase
        .from("party_groups")
        .select("id, leader_id, status")
        .eq("party_id", partyId);
      if (!active) return;

      const rows = (groups ?? []) as {
        id: string;
        leader_id: string;
        status: GroupStatus;
      }[];
      // Prefer an active group; fall back to a paid one. Ignore declined/cancelled.
      const mine =
        rows.find((g) => LIVE.includes(g.status) && g.status !== "paid") ??
        rows.find((g) => g.status === "paid") ??
        null;

      if (!mine) {
        setGroup(null);
        setLoading(false);
        return;
      }

      const { data: memberRows } = await supabase
        .from("party_group_members")
        .select("user_id, status")
        .eq("group_id", mine.id);

      const mrows = (memberRows ?? []) as {
        user_id: string;
        status: MemberStatus;
      }[];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in(
          "id",
          mrows.map((m) => m.user_id),
        );
      if (!active) return;

      const pmap = new Map(
        ((profs ?? []) as {
          id: string;
          display_name: string | null;
          username: string | null;
          avatar_url: string | null;
        }[]).map((p) => [
          p.id,
          {
            name: p.display_name || p.username || "Ven",
            avatarUrl: p.avatar_url ?? null,
          },
        ]),
      );

      setGroup({
        id: mine.id,
        leaderId: mine.leader_id,
        status: mine.status,
        members: mrows.map((m) => ({
          userId: m.user_id,
          status: m.status,
          name: pmap.get(m.user_id)?.name ?? "Ven",
          avatarUrl: pmap.get(m.user_id)?.avatarUrl ?? null,
        })),
      });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [partyId, reloadKey]);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      setReloadKey((k) => k + 1);
    });
  }

  // Start a Mollie checkout for the group and redirect the leader to it.
  function pay() {
    if (!group) return;
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/payments/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partyId, groupId: group.id }),
        });
        const json = await res.json();
        if (!res.ok || !json.checkout) {
          setError(json.error ?? "Kunne ikke starte betaling.");
          return;
        }
        window.location.href = json.checkout;
      } catch {
        setError("Kunne ikke starte betaling.");
      }
    });
  }

  if (loading) return null;

  // ---- No active group: offer to form one with friends ------------------
  if (!group) {
    return (
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Users size={16} className="text-amber-300" />
          Kom med en gruppe
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Inviter venner der også kommer, og meld jer til samlet
          {entreDkk && entreDkk > 0
            ? ` — I betaler ${entreDkk} kr. pr. person, når værten har godkendt.`
            : "."}
        </p>

        {picking ? (
          <div className="mt-3 space-y-3">
            <FriendMultiSelect selected={selected} onChange={setSelected} />
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || selected.length === 0}
                onClick={() => run(() => createGroup(partyId, selected))}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                Send invitationer ({selected.length})
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPicking(false);
                  setSelected([]);
                  setError(null);
                }}
                className="rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
              >
                Annullér
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="btn-secondary mt-3"
          >
            Vælg venner
          </button>
        )}
      </div>
    );
  }

  // ---- I'm in a group ----------------------------------------------------
  const amLeader = group.leaderId === uid;
  const me = group.members.find((m) => m.userId === uid);
  const acceptedOthers = group.members.filter(
    (m) => m.status === "accepted" && m.userId !== group.leaderId,
  ).length;
  const acceptedCount = group.members.filter(
    (m) => m.status === "accepted",
  ).length;
  // Total the leader pays: (entré + evt. platformgebyr) × accepted members.
  const total = ((entreDkk ?? 0) + feeDkk) * acceptedCount;
  const leaderName =
    group.members.find((m) => m.userId === group.leaderId)?.name ?? "Lederen";

  const MemberList = (
    <ul className="mt-3 space-y-1.5">
      {group.members.map((m) => (
        <li
          key={m.userId}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
        >
          <Avatar url={m.avatarUrl} name={m.name} size={32} />
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
            {m.name}
            {m.userId === group.leaderId ? (
              <span className="ml-1.5 text-xs text-amber-300">· leder</span>
            ) : null}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              STATUS_BADGE[m.status].cls
            }`}
          >
            {STATUS_BADGE[m.status].label}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <Users size={16} className="text-amber-300" />
        {amLeader ? "Din gruppe" : `${leaderName}s gruppe`}
      </p>

      {/* Invited friend who hasn't answered yet */}
      {!amLeader && me?.status === "pending" ? (
        <>
          <p className="mt-1 text-xs text-zinc-400">
            {leaderName} vil have dig med til festen som gruppe.
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-300">{error}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => respondGroupInvite(partyId, group.id, true))
              }
              className="btn-primary flex-1 disabled:opacity-60"
            >
              <Check size={16} className="mr-1 inline" />
              Accepter
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => respondGroupInvite(partyId, group.id, false))
              }
              className="rounded-full border border-red-400/40 px-4 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
            >
              <X size={16} className="mr-1 inline" />
              Nej tak
            </button>
          </div>
        </>
      ) : null}

      {/* Status line for everyone once past the invite */}
      {group.status === "paid" ? (
        <p className="mt-1 text-sm text-emerald-300">
          Gruppen er tilmeldt festen.
        </p>
      ) : !amLeader && me?.status === "accepted" ? (
        <p className="mt-1 text-xs text-zinc-400">
          Du er med — afventer at værten godkender gruppen.
        </p>
      ) : !amLeader && me?.status === "declined" ? (
        <p className="mt-1 text-xs text-zinc-400">Du takkede nej til gruppen.</p>
      ) : amLeader &&
        (group.status === "requested" || group.status === "approved") ? (
        <p className="mt-1 text-xs text-zinc-400">
          {entreDkk && entreDkk > 0
            ? "Betalt · sendt til værten — afventer godkendelse. Afviser værten, refunderes hele beløbet."
            : "Sendt til værten — afventer godkendelse."}
        </p>
      ) : amLeader && group.status === "forming" ? (
        <p className="mt-1 text-xs text-zinc-400">
          Afventer at dine venner accepterer invitationen.
          {entreDkk && entreDkk > 0
            ? ` Du betaler ${entreDkk} kr. pr. deltager, når gruppen sendes til værten.`
            : ""}
        </p>
      ) : null}

      {MemberList}

      {error && !(!amLeader && me?.status === "pending") ? (
        <p className="mt-2 text-sm text-red-300">{error}</p>
      ) : null}

      {/* Leader controls. Paid party: sending the group to the host IS the
          payment (pay-at-request); free party: plain submit. */}
      {amLeader && group.status === "forming" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending || acceptedOthers < 1}
            onClick={() =>
              entreDkk && entreDkk > 0
                ? pay()
                : run(() => submitGroup(partyId, group.id))
            }
            className="btn-primary flex-1 disabled:opacity-60"
            title={
              acceptedOthers < 1
                ? "Mindst én ven skal acceptere først"
                : undefined
            }
          >
            {entreDkk && entreDkk > 0
              ? `Send til vært og betal (${total} kr.)`
              : "Send til vært"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => cancelGroup(partyId, group.id))}
            className="rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
          >
            Opløs
          </button>
        </div>
      ) : amLeader &&
        (group.status === "requested" || group.status === "approved") ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => cancelGroup(partyId, group.id))}
          className="mt-3 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
        >
          {entreDkk && entreDkk > 0
            ? "Træk tilbage (refunderes)"
            : "Træk tilbage"}
        </button>
      ) : null}
    </div>
  );
}
