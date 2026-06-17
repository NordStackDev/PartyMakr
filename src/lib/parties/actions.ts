"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type RsvpStatus = "going" | "interested" | "maybe";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Create a party. Location comes from the map picker (lat/lng). Inserts via the
 * create_party RPC (handles the geography column); RLS enforces host = self.
 */
export async function createParty(formData: FormData) {
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

  if (!title) {
    redirect("/parties/new?error=" + encodeURIComponent("Giv festen en titel."));
  }
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    redirect(
      "/parties/new?error=" + encodeURIComponent("Vælg en placering på kortet."),
    );
  }
  if (!startsAt) {
    redirect(
      "/parties/new?error=" + encodeURIComponent("Vælg hvornår festen starter."),
    );
  }

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
    redirect(
      "/parties/new?error=" + encodeURIComponent("Kunne ikke oprette festen."),
    );
  }

  revalidatePath("/dashboard");
  redirect(`/parties/${data}`);
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
