"use client";

import { useState, useTransition } from "react";

import {
  cancelJoinRequest,
  requestJoin,
  withdrawRsvp,
  type JoinRequestStatus,
  type RsvpStatus,
} from "@/lib/parties/actions";

/**
 * Guest actions on a party (single person). Free party: plain join request.
 * Paid party: PAY-AT-REQUEST — the guest pays the entré up front, which files
 * the request; the host approving confirms them, declining refunds in full.
 */
export function RsvpButtons({
  partyId,
  current,
  request,
  entreDkk,
  feeDkk = 0,
}: {
  partyId: string;
  current: RsvpStatus | null;
  request: JoinRequestStatus | null;
  entreDkk: number | null;
  feeDkk?: number;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const going = current === "going";
  const isPaid = (entreDkk ?? 0) > 0;
  const totalDkk = (entreDkk ?? 0) + (isPaid ? feeDkk : 0);

  // Paid party: request + pay in one step via Stripe Checkout.
  function payAndRequest() {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/payments/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ partyId }),
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
            {isPaid
              ? "Betalt · afventer værtens godkendelse"
              : "Afventer værtens godkendelse"}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(() => cancelJoinRequest(partyId))}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
          >
            {isPaid ? "Træk tilbage (refunderes)" : "Træk tilbage"}
          </button>
        </div>
      ) : request === "declined" ? (
        <div className="space-y-2">
          <span className="inline-flex min-h-11 items-center rounded-full bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-300">
            {isPaid
              ? "Værten afviste — beløbet refunderes"
              : "Værten afviste din anmodning"}
          </span>
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                isPaid ? payAndRequest() : start(() => requestJoin(partyId))
              }
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
            >
              {isPaid ? `Anmod og betal igen (${totalDkk} kr.)` : "Anmod igen"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            isPaid ? payAndRequest() : start(() => requestJoin(partyId))
          }
          className="inline-flex min-h-11 items-center rounded-full bg-[var(--brand)] px-5 py-2 text-sm font-semibold text-zinc-950 transition active:brightness-95 disabled:opacity-60"
        >
          {isPaid ? `Anmod og betal (${totalDkk} kr.)` : "Anmod om at deltage"}
        </button>
      )}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {isPaid && !going && request !== "pending" ? (
        <p className="text-xs text-zinc-400">
          {feeDkk > 0
            ? `Entré ${entreDkk} kr. + ${feeDkk} kr. billetgebyr. `
            : ""}
          Du betaler nu og får pladsen, når værten godkender. Afviser værten,
          refunderes hele beløbet automatisk.
        </p>
      ) : null}
    </div>
  );
}
