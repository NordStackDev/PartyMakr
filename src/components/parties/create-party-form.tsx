"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { createParty } from "@/lib/parties/actions";
import { SubmitButton } from "@/components/submit-button";
import { DateTimeField } from "@/components/parties/datetime-field";

const LocationPicker = dynamic(
  () => import("@/components/map/location-picker"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-300">
        Henter kort…
      </div>
    ),
  },
);

export function CreatePartyForm({ error }: { error?: string }) {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);

  function useMyLocation() {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) =>
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      );
    }
  }

  return (
    <form action={createParty} className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <label className="block">
        <span className="auth-label">Titel</span>
        <input name="title" required maxLength={120} className="auth-input" />
      </label>

      <label className="block">
        <span className="auth-label">Beskrivelse</span>
        <textarea name="description" rows={3} className="auth-input resize-none" />
      </label>

      <div>
        <span className="auth-label">Placering</span>
        <div className="mt-1 h-[clamp(11rem,38vh,16rem)] overflow-hidden rounded-xl border border-white/10">
          <LocationPicker
            value={loc}
            onPick={(lat, lng) => setLoc({ lat, lng })}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={useMyLocation}
            className="text-xs font-semibold text-amber-300 hover:underline"
          >
            Brug min placering
          </button>
          <span className="text-xs text-zinc-400">
            {loc ? "Placering valgt ✓" : "Tryk på kortet for at vælge"}
          </span>
        </div>
        <input type="hidden" name="lat" value={loc?.lat ?? ""} />
        <input type="hidden" name="lng" value={loc?.lng ?? ""} />
      </div>

      <label className="block">
        <span className="auth-label">Adresse (valgfri)</span>
        <input name="address" className="auth-input" />
      </label>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Starter</span>
          <DateTimeField name="starts_at" />
        </label>
        <label className="block">
          <span className="auth-label">Slutter (valgfri)</span>
          <DateTimeField name="ends_at" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Synlighed</span>
          <select name="visibility" defaultValue="public" className="auth-input">
            <option value="public">Offentlig</option>
            <option value="private">Privat</option>
          </select>
        </label>
        <label className="block">
          <span className="auth-label">Kapacitet (valgfri)</span>
          <input
            type="number"
            name="capacity"
            min={1}
            inputMode="numeric"
            placeholder="Ubegrænset"
            className="auth-input"
          />
        </label>
      </div>

      <SubmitButton className="btn-primary" pendingText="Opretter…">
        Opret fest
      </SubmitButton>
    </form>
  );
}
