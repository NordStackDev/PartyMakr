"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";

import { filePartyClaim } from "@/lib/parties/actions";

/**
 * Marketplace escrow: lets a paid, going guest report that the party never
 * happened (inside the claim window). An open claim pauses the host's payout
 * until PartyMakr has looked at it.
 */
export function ClaimButton({
  partyId,
  claimed,
}: {
  partyId: string;
  claimed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  if (claimed) {
    return (
      <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
        Du har meldt, at festen ikke fandt sted. Vi kigger på det. Værtens
        udbetaling er sat på pause imens.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
      >
        <Flag size={14} />
        Fandt festen ikke sted? Meld det
      </button>
    );
  }

  return (
    <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-semibold text-white">
        Meld: festen fandt ikke sted
      </p>
      <p className="text-xs text-zinc-400">
        Brug kun denne, hvis festen reelt ikke blev afholdt. Værtens udbetaling
        sættes på pause, mens vi undersøger det.
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Hvad skete der? (valgfrit)"
        className="auth-input resize-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await filePartyClaim(partyId, reason);
            })
          }
          className="btn-primary flex-1 disabled:opacity-60"
        >
          Indsend anmeldelse
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
        >
          Annullér
        </button>
      </div>
    </div>
  );
}
