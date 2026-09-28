"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { requestAccountDeletion } from "@/lib/profile/actions";

const PHRASE = "SLET MIN KONTO";

export function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-400/10"
      >
        Slet konto
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-red-400/35 bg-red-400/10 p-4">
      <p className="text-sm text-red-100">
        Vi aflyser dine aktive fester, refunderer berettigede betalinger og fjerner
        dit profilbillede med det samme. Du kan gendanne kontoen inden for 30 dage,
        men aflyste arrangementer og betalinger kommer ikke tilbage.
      </p>
      <label className="block">
        <span className="auth-label">Skriv {PHRASE} for at bekræfte</span>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="auth-input"
          autoComplete="off"
        />
      </label>
      {error ? <p className="text-sm text-red-200">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || confirmation !== PHRASE}
          onClick={() => {
            start(async () => {
              const result = await requestAccountDeletion(confirmation);
              if (result.error) setError(result.error);
              else
                router.replace(
                  `/login?message=${encodeURIComponent(
                    "Din konto er markeret til sletning. Du kan gendanne den inden for 30 dage.",
                  )}`,
                );
            });
          }}
          className="rounded-full bg-red-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          {pending ? "Sletter…" : "Bekræft sletning"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="btn-ghost disabled:opacity-60"
        >
          Annullér
        </button>
      </div>
    </div>
  );
}
