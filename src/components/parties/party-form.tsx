"use client";

import dynamic from "next/dynamic";
import { useActionState, useState } from "react";

import { type CreatePartyState } from "@/lib/parties/actions";
import { lookupPostcode } from "@/lib/postcode";
import type { FlyTarget } from "@/components/map/location-picker";
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

export type PartyDefaults = {
  title?: string | null;
  description?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  visibility?: "public" | "private" | null;
  venueType?: "own_place" | "public_spot" | null;
  capacity?: number | null;
  entreDkk?: number | null;
  minAge?: number | null;
  genderTarget?: string | null;
};

/**
 * Shared create/edit party form. The action returns a {error} state (no
 * navigation) so the user's input is kept on a validation error; only success
 * navigates. `defaults` prefills the fields for editing.
 */
export function PartyForm({
  action,
  defaults,
  submitLabel,
  pendingLabel,
  ticketPriceDkk = 0,
}: {
  action: (
    state: CreatePartyState,
    formData: FormData,
  ) => Promise<CreatePartyState>;
  defaults?: PartyDefaults;
  submitLabel: string;
  pendingLabel: string;
  /** The platform's uniform entré; 0 hides the paid-party option. */
  ticketPriceDkk?: number;
}) {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(
    defaults?.lat != null && defaults?.lng != null
      ? { lat: defaults.lat, lng: defaults.lng }
      : null,
  );
  const [state, formAction] = useActionState<CreatePartyState, FormData>(
    action,
    {},
  );
  const [postcode, setPostcode] = useState("");
  const [postcodeCity, setPostcodeCity] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  // The postcode's town centre doubles as the party location when the host
  // doesn't drop a pin — the pin is optional fine-tuning.
  const [pcCenter, setPcCenter] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  // React 19 auto-resets uncontrolled fields when the action finishes — also
  // on error. The action echoes the submitted input back in state.values, and
  // seeding defaultValue from it keeps everything the user typed.
  const v = state.values;

  // Postcode is required when creating (guides the host to the right town);
  // an existing party already has its location, so editing keeps it optional.
  const isEdit = defaults != null;

  async function findPostcode(value: string) {
    const hit = await lookupPostcode(value);
    if (hit) {
      setPostcodeCity(hit.navn);
      setPostcodeError(false);
      setPcCenter({ lat: hit.lat, lng: hit.lng });
      setFlyTo({ lat: hit.lat, lng: hit.lng, nonce: Date.now() });
    } else {
      setPostcodeCity(null);
      setPcCenter(null);
      setPostcodeError(true);
    }
  }

  function useMyLocation() {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) =>
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      );
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      ) : null}

      <label className="block">
        <span className="auth-label">Titel</span>
        <input
          name="title"
          required
          maxLength={120}
          defaultValue={v?.title ?? defaults?.title ?? ""}
          className={`auth-input ${state.fieldErrors?.title ? "border-red-400/60" : ""}`}
        />
        {state.fieldErrors?.title ? (
          <span className="mt-1 block text-sm text-red-300">
            {state.fieldErrors.title}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="auth-label">Beskrivelse</span>
        <textarea
          name="description"
          rows={3}
          defaultValue={v?.description ?? defaults?.description ?? ""}
          className="auth-input resize-none"
        />
      </label>

      <div>
        <span className="auth-label">Placering</span>
        {/* Jump the map to a city by postcode — no name attribute, so the
            field is never submitted with the form. */}
        <div className="mt-1 flex items-center gap-2">
          <input
            name="postcode"
            required={!isEdit}
            value={postcode}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setPostcode(v);
              setPostcodeError(false);
              if (v.length === 4) findPostcode(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                findPostcode(postcode);
              }
            }}
            inputMode="numeric"
            maxLength={4}
            placeholder={isEdit ? "Postnummer, fx 6950" : "Postnummer (påkrævet)"}
            aria-label="Byens postnummer"
            className={`auth-input flex-1 ${postcodeError || state.fieldErrors?.postcode ? "border-red-400/60" : ""}`}
          />
          <span
            className={`w-28 shrink-0 text-xs ${postcodeError ? "text-red-300" : "text-amber-300"}`}
          >
            {postcodeError ? "Ukendt postnummer" : (postcodeCity ?? "")}
          </span>
        </div>
        {state.fieldErrors?.postcode ? (
          <span className="mt-1 block text-sm text-red-300">
            {state.fieldErrors.postcode}
          </span>
        ) : null}
        <div
          className={`mt-2 h-[clamp(11rem,38vh,16rem)] overflow-hidden rounded-xl border ${state.fieldErrors?.location ? "border-red-400/60" : "border-white/10"}`}
        >
          <LocationPicker
            value={loc}
            onPick={(lat, lng) => setLoc({ lat, lng })}
            flyTo={flyTo}
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
            {loc
              ? "Placering valgt ✓"
              : pcCenter
                ? `Bruger ${postcodeCity ?? "byens"} centrum`
                : "Tryk på kortet (valgfrit)"}
          </span>
        </div>
        {state.fieldErrors?.location ? (
          <span className="mt-1 block text-sm text-red-300">
            {state.fieldErrors.location}
          </span>
        ) : null}
        <input type="hidden" name="lat" value={loc?.lat ?? pcCenter?.lat ?? ""} />
        <input type="hidden" name="lng" value={loc?.lng ?? pcCenter?.lng ?? ""} />
      </div>

      <label className="block">
        <span className="auth-label">
          Adresse (bruges til gæster, der bliver godkendt af dig)
        </span>
        <input
          name="address"
          defaultValue={v?.address ?? defaults?.address ?? ""}
          className="auth-input"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Starter</span>
          <DateTimeField name="starts_at" defaultValue={defaults?.startsAt ?? undefined} />
          {state.fieldErrors?.starts_at ? (
            <span className="mt-1 block text-sm text-red-300">
              {state.fieldErrors.starts_at}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="auth-label">Slutter (valgfri)</span>
          <DateTimeField name="ends_at" defaultValue={defaults?.endsAt ?? undefined} />
        </label>
      </div>

      <label className="block">
        <span className="auth-label">Hvor er festen?</span>
        <select
          name="venue_type"
          defaultValue={v?.venue_type ?? defaults?.venueType ?? "own_place"}
          className="auth-input"
        >
          <option value="own_place">Eget sted</option>
          <option value="public_spot">Mødes i byen</option>
        </select>
      </label>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Synlighed</span>
          <select
            name="visibility"
            defaultValue={v?.visibility ?? defaults?.visibility ?? "public"}
            className="auth-input"
          >
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
            defaultValue={v?.capacity ?? defaults?.capacity ?? ""}
            className="auth-input"
          />
        </label>
      </div>

      {ticketPriceDkk > 0 || (defaults?.entreDkk ?? 0) > 0 ? (
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3">
          <input
            type="checkbox"
            name="paid"
            defaultChecked={
              v ? v.paid === "on" : (defaults?.entreDkk ?? 0) > 0
            }
            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-100">
              Fest med entré ({defaults?.entreDkk ?? ticketPriceDkk} kr. pr.
              person)
            </span>
            <span className="mt-0.5 block text-xs text-zinc-400">
              Gæster betaler entréen, når de anmoder om at deltage. Prisen er
              fastsat af PartyMakr.
            </span>
          </span>
        </label>
      ) : null}

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Mindstealder (valgfri)</span>
          <input
            type="number"
            name="min_age"
            min={0}
            max={120}
            inputMode="numeric"
            placeholder="Ingen grænse"
            defaultValue={v?.min_age ?? defaults?.minAge ?? ""}
            className="auth-input"
          />
          <span className="mt-1 block text-xs text-zinc-400">
            Kræver aldersverificering af gæsten.
          </span>
        </label>
        <label className="block">
          <span className="auth-label">Målgruppe (køn, valgfri)</span>
          <select
            name="gender_target"
            defaultValue={v?.gender_target ?? defaults?.genderTarget ?? ""}
            className="auth-input"
          >
            <option value="">Alle</option>
            <option value="female">Kvinder</option>
            <option value="male">Mænd</option>
            <option value="other">Andet</option>
          </select>
        </label>
      </div>

      <SubmitButton className="btn-primary" pendingText={pendingLabel}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
