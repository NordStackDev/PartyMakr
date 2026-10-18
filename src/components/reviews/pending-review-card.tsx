"use client";

import Link from "next/link";
import { ArrowRight, Star } from "lucide-react";
import { useState, useTransition } from "react";

import { skipPartyReviews } from "@/lib/reviews/actions";

export function PendingReviewCard({
  partyId,
  partyTitle,
  pendingCount,
  otherParties,
}: {
  partyId: string;
  partyTitle: string;
  pendingCount: number;
  otherParties: number;
}) {
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!visible) return null;

  return (
    <section className="rounded-2xl border border-amber-300/30 bg-[#211a12]/90 p-4 shadow-xl shadow-black/35 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-300 text-zinc-950 shadow-md shadow-amber-500/20">
          <Star size={19} fill="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
            Hvordan gik festen?
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">
            {partyTitle}
          </p>
          <p className="mt-1 text-xs text-zinc-300">
            {pendingCount === 1
              ? "Én vurdering venter på dig."
              : `${pendingCount} vurderinger venter på dig.`}
            {otherParties > 0
              ? ` Du har også ${otherParties} ${otherParties === 1 ? "anden fest" : "andre fester"}.`
              : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/parties/${partyId}#ratings`}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--brand)] px-4 text-sm font-semibold text-zinc-950 transition active:brightness-95"
        >
          Vurdér nu
          <ArrowRight size={15} />
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await skipPartyReviews(partyId);
              if (result.error) setError(result.error);
              else setVisible(false);
            });
          }}
          className="min-h-10 rounded-full border border-white/15 px-3 text-xs font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
        >
          {pending ? "Gemmer…" : "Spring over"}
        </button>
      </div>
    </section>
  );
}
