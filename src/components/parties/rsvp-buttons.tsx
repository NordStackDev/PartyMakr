"use client";

import { useTransition } from "react";

import {
  cancelJoinRequest,
  requestJoin,
  withdrawRsvp,
  type JoinRequestStatus,
  type RsvpStatus,
} from "@/lib/parties/actions";

/** Guest actions for requesting or withdrawing party attendance. */
export function RsvpButtons({
  partyId,
  current,
  request,
}: {
  partyId: string;
  current: RsvpStatus | null;
  request: JoinRequestStatus | null;
}) {
  const [pending, start] = useTransition();
  const going = current === "going";

  return (
    <div className="space-y-3">
      {going ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-300">
            Du deltager
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => withdrawRsvp(partyId))}
            className="inline-flex min-h-11 items-center rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
          >
            Meld afbud
          </button>
        </div>
      ) : request === "pending" ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-300">
            Afventer værtens godkendelse
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => cancelJoinRequest(partyId))}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
          >
            Træk tilbage
          </button>
        </div>
      ) : request === "declined" ? (
        <div className="space-y-2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-300">
            Værten afviste din anmodning
          </span>
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => requestJoin(partyId))}
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
            >
              Anmod igen
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => requestJoin(partyId))}
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-zinc-950 transition active:brightness-95 disabled:opacity-60"
        >
          Anmod om at deltage
        </button>
      )}
    </div>
  );
}
