"use client";

import { useTransition } from "react";

import { rsvp, withdrawRsvp, type RsvpStatus } from "@/lib/parties/actions";

const OPTIONS: { key: RsvpStatus; label: string }[] = [
  { key: "going", label: "Kommer" },
  { key: "interested", label: "Interesseret" },
  { key: "maybe", label: "Måske" },
];

export function RsvpButtons({
  partyId,
  current,
}: {
  partyId: string;
  current: RsvpStatus | null;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          disabled={pending}
          onClick={() => start(() => rsvp(partyId, o.key))}
          className={
            current === o.key
              ? "inline-flex min-h-11 items-center rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-60"
              : "inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 disabled:opacity-60"
          }
        >
          {o.label}
        </button>
      ))}
      {current ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => withdrawRsvp(partyId))}
          className="inline-flex min-h-11 items-center rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
        >
          Fjern svar
        </button>
      ) : null}
    </div>
  );
}
