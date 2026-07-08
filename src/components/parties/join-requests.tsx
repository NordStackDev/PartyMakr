"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, MessageCircle, X } from "lucide-react";

import { respondJoinRequest } from "@/lib/parties/actions";
import { Avatar } from "@/components/friends/avatar";
import { VerifiedBadge } from "@/components/verified-badge";

/** Host view: pending join requests with chat + approve/decline. */
export function JoinRequests({
  partyId,
  requests,
}: {
  partyId: string;
  requests: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    verified?: boolean;
    threadId?: string | null;
  }[];
}) {
  const [pending, start] = useTransition();

  if (requests.length === 0) return null;

  return (
    <div>
      <p className="auth-label mb-2">
        Anmodninger om at deltage ({requests.length})
      </p>
      <ul className="space-y-2">
        {requests.map((r) => (
          <li
            key={r.userId}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
          >
            <Link
              href={`/profile/${r.userId}?from=/parties/${partyId}`}
              className="flex min-w-0 items-center gap-3 transition hover:opacity-80"
            >
              <Avatar url={r.avatarUrl ?? null} name={r.name} size={36} />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-sm text-zinc-100">
                  {r.name}
                </span>
                {r.verified ? <VerifiedBadge /> : null}
              </span>
            </Link>
            <span className="flex shrink-0 gap-2">
              {r.threadId ? (
                <Link
                  href={`/messages/${r.threadId}`}
                  aria-label={`Skriv til ${r.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
                >
                  <MessageCircle size={16} />
                </Link>
              ) : null}
              <button
                type="button"
                aria-label={`Godkend ${r.name}`}
                disabled={pending}
                onClick={() =>
                  start(() => respondJoinRequest(partyId, r.userId, true))
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-60"
              >
                <Check size={16} />
              </button>
              <button
                type="button"
                aria-label={`Afvis ${r.name}`}
                disabled={pending}
                onClick={() =>
                  start(() => respondJoinRequest(partyId, r.userId, false))
                }
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
