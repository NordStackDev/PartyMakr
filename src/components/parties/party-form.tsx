"use client";

import dynamic from "next/dynamic";
import { useActionState, useRef, useState } from "react";

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
  minAge?: number | null;
  genderTarget?: string | null;
  ageGroup?: string | null;
  theme?: string | null;
  music?: string | null;
  alcoholPolicy?: string | null;
  dressCode?: string | null;
  genderMix?: string | null;
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
  strictCreate = false,
}: {
  action: (
    state: CreatePartyState,
    formData: FormData,
  ) => Promise<CreatePartyState>;
  defaults?: PartyDefaults;
  submitLabel: string;
  pendingLabel: string;
  /** New parties need complete operational details; legacy edits stay compatible. */
  strictCreate?: boolean;
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
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

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
        <span className="auth-label">Titel{strictCreate ? " *" : ""}</span>
        <input
          ref={titleRef}
          name="title"
          required
          maxLength={120}
          defaultValue={v?.title ?? defaults?.title ?? ""}
          className={`auth-input ${state.fieldErrors?.title ? "border-red-400/60" : ""}`}
        />
        {strictCreate ? (
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Forslag til festtitel">
            {["Fredagsfest", "Forfest", "Hyggeaften", "Bytur"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  if (titleRef.current) titleRef.current.value = suggestion;
                }}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        {state.fieldErrors?.title ? (
          <span className="mt-1 block text-sm text-red-300">
            {state.fieldErrors.title}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="auth-label">Beskrivelse{strictCreate ? " *" : ""}</span>
        <textarea
          ref={descriptionRef}
          name="description"
          rows={3}
          required={strictCreate}
          defaultValue={v?.description ?? defaults?.description ?? ""}
          className={`auth-input resize-none ${state.fieldErrors?.description ? "border-red-400/60" : ""}`}
        />
        {strictCreate ? (
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Forslag til beskrivelse">
            {["Musik, hygge og gode mennesker.", "Vi mødes til drinks før byturen.", "Tag en ven med og kom forbi."].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  if (descriptionRef.current) descriptionRef.current.value = suggestion;
                }}
                className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        {state.fieldErrors?.description ? (
          <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.description}</span>
        ) : null}
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
          required={strictCreate}
          defaultValue={v?.address ?? defaults?.address ?? ""}
          className={`auth-input ${state.fieldErrors?.address ? "border-red-400/60" : ""}`}
        />
        {state.fieldErrors?.address ? (
          <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.address}</span>
        ) : null}
      </label>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Starter{strictCreate ? " *" : ""}</span>
          <DateTimeField name="starts_at" defaultValue={defaults?.startsAt ?? undefined} required={strictCreate} />
          {state.fieldErrors?.starts_at ? (
            <span className="mt-1 block text-sm text-red-300">
              {state.fieldErrors.starts_at}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="auth-label">Slutter{strictCreate ? " *" : " (valgfri)"}</span>
          <DateTimeField name="ends_at" defaultValue={defaults?.endsAt ?? undefined} required={strictCreate} />
          {state.fieldErrors?.ends_at ? (
            <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.ends_at}</span>
          ) : null}
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
          <span className="auth-label">Antal deltagere (maks.){strictCreate ? " *" : " (valgfri)"}</span>
          <select
            name="capacity"
            required={strictCreate}
            defaultValue={v?.capacity ?? (defaults?.capacity == null ? (strictCreate ? "20" : "") : String(defaults.capacity))}
            className={`auth-input ${state.fieldErrors?.capacity ? "border-red-400/60" : ""}`}
          >
            {!strictCreate ? <option value="">Ubegrænset</option> : null}
            <option value="10">10 gæster</option>
            <option value="20">20 gæster (anbefalet)</option>
            <option value="30">30 gæster</option>
            <option value="50">50 gæster</option>
            <option value="100">100 gæster</option>
            <option value="unlimited">Ubegrænset</option>
          </select>
          {state.fieldErrors?.capacity ? (
            <span className="mt-1 block text-sm text-red-300">{state.fieldErrors.capacity}</span>
          ) : null}
        </label>
      </div>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Godt at vide om festen</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Oplysningerne vises som tags på festens side.
          </p>
        </div>

        <label className="block">
          <span className="auth-label">Aldersgruppe (valgfri)</span>
          <input
            name="age_group"
            maxLength={60}
            placeholder="Fx 18-25 år eller blandet alder"
            defaultValue={v?.age_group ?? defaults?.ageGroup ?? ""}
            className="auth-input"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <label className="block">
            <span className="auth-label">Tema (valgfrit)</span>
            <input
              name="theme"
              maxLength={80}
              placeholder="Fx 00'er-fest"
              defaultValue={v?.theme ?? defaults?.theme ?? ""}
              className="auth-input"
            />
          </label>
          <label className="block">
            <span className="auth-label">Musik (valgfrit)</span>
            <input
              name="music"
              maxLength={100}
              placeholder="Fx pop, house eller hiphop"
              defaultValue={v?.music ?? defaults?.music ?? ""}
              className="auth-input"
            />
          </label>
        </div>

        <label className="block">
          <span className="auth-label">Alkohol (valgfrit)</span>
          <select
            name="alcohol_policy"
            defaultValue={v?.alcohol_policy ?? defaults?.alcoholPolicy ?? ""}
            className="auth-input"
          >
            <option value="">Ikke oplyst</option>
            <option value="no_alcohol">Ingen alkohol</option>
            <option value="provided">Alkohol serveres</option>
            <option value="bring_your_own">Medbring selv</option>
          </select>
        </label>

        <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
          <label className="block">
            <span className="auth-label">Dresscode (valgfri)</span>
            <input
              name="dress_code"
              maxLength={80}
              placeholder="Fx pænt tøj eller 90'er-look"
              defaultValue={v?.dress_code ?? defaults?.dressCode ?? ""}
              className="auth-input"
            />
          </label>
          <label className="block">
            <span className="auth-label">Kønssammensætning (valgfri)</span>
            <select
              name="gender_mix"
              defaultValue={v?.gender_mix ?? defaults?.genderMix ?? ""}
              className="auth-input"
            >
              <option value="">Ikke oplyst</option>
              <option value="mixed">Blandet</option>
              <option value="mostly_women">Flest kvinder</option>
              <option value="mostly_men">Flest mænd</option>
              <option value="unknown">Ikke afklaret</option>
            </select>
          </label>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <label className="block">
          <span className="auth-label">Aldersgrænse for adgang (valgfri)</span>
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
          <span className="auth-label">Adgang for (køn, valgfri)</span>
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
