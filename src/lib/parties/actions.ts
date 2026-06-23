"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type RsvpStatus = "going" | "interested" | "maybe";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export type CreatePartyState = { error?: string };

/**
 * Create a party. Location comes from the map picker (lat/lng). Inserts via the
 * create_party RPC (handles the geography column); RLS enforces host = self.
 *
 * Uses the useActionState signature so validation errors are RETURNED (no
 * navigation) — the form stays mounted and keeps everything the user typed.
 * Only success navigates (to the new party).
 */
export async function createParty(
  _prevState: CreatePartyState,
  formData: FormData,
): Promise<CreatePartyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = str(formData, "title").trim();
  const latRaw = str(formData, "lat");
  const lngRaw = str(formData, "lng");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const startsAt = str(formData, "starts_at");

  if (!title) return { error: "Giv festen en titel." };
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Vælg en placering på kortet." };
  }
  if (!startsAt) return { error: "Vælg hvornår festen starter." };

  const capacityRaw = str(formData, "capacity").trim();
  const endsAtRaw = str(formData, "ends_at").trim();

  const { data, error } = await supabase.rpc("create_party", {
    p_title: title,
    p_description: str(formData, "description").trim(),
    p_lat: lat,
    p_lng: lng,
    p_address: str(formData, "address").trim(),
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: endsAtRaw ? new Date(endsAtRaw).toISOString() : null,
    p_visibility:
      str(formData, "visibility") === "private" ? "private" : "public",
    p_capacity: capacityRaw ? Number(capacityRaw) : null,
  });

  if (error || !data) {
    return {
      error: error?.message
        ? `Kunne ikke oprette festen: ${error.message}`
        : "Kunne ikke oprette festen.",
    };
  }

  revalidatePath("/dashboard");
  redirect(`/parties/${data}`);
}

/**
 * Edit an existing party (host only — enforced by RLS + the WHERE in the RPC).
 * Same validate-and-return-error pattern as createParty so the edit form keeps
 * the user's input on a mistake.
 */
export async function updateParty(
  partyId: string,
  _prevState: CreatePartyState,
  formData: FormData,
): Promise<CreatePartyState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = str(formData, "title").trim();
  const latRaw = str(formData, "lat");
  const lngRaw = str(formData, "lng");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  const startsAt = str(formData, "starts_at");

  if (!title) return { error: "Giv festen en titel." };
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Vælg en placering på kortet." };
  }
  if (!startsAt) return { error: "Vælg hvornår festen starter." };

  const capacityRaw = str(formData, "capacity").trim();
  const endsAtRaw = str(formData, "ends_at").trim();

  const { error } = await supabase.rpc("update_party", {
    p_id: partyId,
    p_title: title,
    p_description: str(formData, "description").trim(),
    p_lat: lat,
    p_lng: lng,
    p_address: str(formData, "address").trim(),
    p_starts_at: new Date(startsAt).toISOString(),
    p_ends_at: endsAtRaw ? new Date(endsAtRaw).toISOString() : null,
    p_visibility:
      str(formData, "visibility") === "private" ? "private" : "public",
    p_capacity: capacityRaw ? Number(capacityRaw) : null,
  });

  if (error) {
    return {
      error: `Kunne ikke gemme ændringerne: ${error.message}`,
    };
  }

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/dashboard");
  redirect(`/parties/${partyId}`);
}

/** RSVP (or change RSVP) to a party. */
export async function rsvp(partyId: string, status: RsvpStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("party_attendees")
    .upsert(
      { party_id: partyId, user_id: user.id, status },
      { onConflict: "party_id,user_id" },
    );
  if (error) {
    throw new Error("Kunne ikke gemme dit svar.");
  }

  revalidatePath(`/parties/${partyId}`);
}

/** Withdraw an RSVP. */
export async function withdrawRsvp(partyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("party_attendees")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", user.id);
  if (error) {
    throw new Error("Kunne ikke fjerne dit svar.");
  }

  revalidatePath(`/parties/${partyId}`);
}
