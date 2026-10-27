"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { capacityValue } from "@/lib/parties/capacity";
import { lookupPostcodeLocal } from "@/lib/postcode-data.server";
import {
  findGroupReference,
  findSoloReference,
  refundAllPartyPayments,
  refundByReference,
} from "@/lib/stripe/settle";

export type RsvpStatus = "going" | "interested" | "maybe";

export type JoinRequestStatus = "pending" | "accepted" | "declined";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export type PartyFieldErrors = {
  title?: string;
  description?: string;
  postcode?: string;
  location?: string;
  address?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: string;
};

/** Everything the user typed, echoed back on error. React 19 auto-resets
 * uncontrolled fields when a form action finishes — ALSO on error — so the
 * form must re-seed its defaultValues from here to keep the user's input. */
export type PartyFormValues = {
  title: string;
  description: string;
  postcode: string;
  address: string;
  visibility: "public" | "private";
  venue_type: "own_place" | "public_spot";
  capacity: string;
  min_age: string;
  gender_target: string;
  age_group: string;
  theme: string;
  music: string;
  alcohol_policy: string;
  dress_code: string;
  gender_mix: string;
};

export type CreatePartyState = {
  /** General/RPC error, shown as a banner. */
  error?: string;
  /** Per-field validation messages, shown inline under each field. */
  fieldErrors?: PartyFieldErrors;
  /** The submitted input, so the form survives the post-action reset. */
  values?: PartyFormValues;
};

function venueType(formData: FormData): "own_place" | "public_spot" {
  return str(formData, "venue_type") === "public_spot"
    ? "public_spot"
    : "own_place";
}

function readValues(formData: FormData): PartyFormValues {
  return {
    title: str(formData, "title"),
    description: str(formData, "description"),
    postcode: str(formData, "postcode"),
    address: str(formData, "address"),
    visibility: str(formData, "visibility") === "private" ? "private" : "public",
    venue_type: venueType(formData),
    capacity: str(formData, "capacity"),
    min_age: str(formData, "min_age"),
    gender_target: str(formData, "gender_target"),
    age_group: str(formData, "age_group"),
    theme: str(formData, "theme"),
    music: str(formData, "music"),
    alcohol_policy: str(formData, "alcohol_policy"),
    dress_code: str(formData, "dress_code"),
    gender_mix: str(formData, "gender_mix"),
  };
}

function validPartyInfo(formData: FormData): boolean {
  return (
    str(formData, "age_group").trim().length <= 60 &&
    str(formData, "theme").trim().length <= 80 &&
    str(formData, "music").trim().length <= 100 &&
    str(formData, "dress_code").trim().length <= 80 &&
    ["", "no_alcohol", "provided", "bring_your_own"].includes(
      str(formData, "alcohol_policy"),
    ) &&
    ["", "mixed", "mostly_women", "mostly_men", "unknown"].includes(
      str(formData, "gender_mix"),
    )
  );
}

function partyInfoArgs(formData: FormData) {
  return {
    p_age_group: str(formData, "age_group").trim() || null,
    p_theme: str(formData, "theme").trim() || null,
    p_music: str(formData, "music").trim() || null,
    p_alcohol_policy: str(formData, "alcohol_policy") || null,
    p_dress_code: str(formData, "dress_code").trim() || null,
    p_gender_mix: str(formData, "gender_mix") || null,
  };
}

function genderTarget(formData: FormData): string | null {
  const v = str(formData, "gender_target");
  return v === "male" || v === "female" || v === "other" ? v : null;
}

/**
 * Create a party. Location comes from the postcode's town centre or the map
 * pin (optional fine-tuning). Inserts via the create_party RPC (handles the
 * geography column); RLS enforces host = self.
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
  const endsAtRaw = str(formData, "ends_at").trim();
  const postcode = str(formData, "postcode").trim();
  const description = str(formData, "description").trim();
  const address = str(formData, "address").trim();
  const capacityRaw = str(formData, "capacity").trim();
  const startsDate = startsAt ? new Date(startsAt) : null;
  const endsDate = endsAtRaw ? new Date(endsAtRaw) : null;
  let postcodeHit = null as ReturnType<typeof lookupPostcodeLocal>;

  const fieldErrors: PartyFieldErrors = {};
  if (!title) fieldErrors.title = "Giv festen en titel.";
  if (!description) fieldErrors.description = "Beskriv kort, hvad gæsterne kan glæde sig til.";
  if (!/^\d{4}$/.test(postcode)) {
    fieldErrors.postcode = "Angiv byens postnummer (4 cifre).";
  } else {
    postcodeHit = lookupPostcodeLocal(postcode);
    if (!postcodeHit) fieldErrors.postcode = "Postnummeret blev ikke fundet.";
  }
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    fieldErrors.location = "Angiv et postnummer eller vælg en placering på kortet.";
  }
  if (!startsDate || Number.isNaN(startsDate.getTime())) {
    fieldErrors.starts_at = "Vælg en gyldig startdato og -tid.";
  }
  if (!endsDate || Number.isNaN(endsDate.getTime())) {
    fieldErrors.ends_at = "Vælg hvornår festen slutter.";
  } else if (startsDate && endsDate <= startsDate) {
    fieldErrors.ends_at = "Sluttidspunktet skal ligge efter starttidspunktet.";
  }
  if (!address) fieldErrors.address = "Angiv adressen, som godkendte gæster får at se.";
  if (!capacityRaw) {
    fieldErrors.capacity = "Vælg hvor mange gæster der er plads til.";
  } else if (capacityRaw !== "unlimited" && capacityValue(capacityRaw) == null) {
    fieldErrors.capacity = "Vælg en gyldig kapacitet.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values: readValues(formData) };
  }
  if (!validPartyInfo(formData)) {
    return {
      error: "Tjek festens oplysninger. Nogle felter er for lange eller ugyldige.",
      values: readValues(formData),
    };
  }

  const minAgeRaw = str(formData, "min_age").trim();

  const { data, error } = await supabase.rpc("create_party", {
    p_title: title,
    p_description: description,
    p_lat: lat,
    p_lng: lng,
    p_address: address,
    p_starts_at: startsDate!.toISOString(),
    p_ends_at: endsDate!.toISOString(),
    p_visibility:
      str(formData, "visibility") === "private" ? "private" : "public",
    p_venue_type: venueType(formData),
    p_capacity: capacityValue(capacityRaw),
    p_min_age: minAgeRaw ? Number(minAgeRaw) : null,
    p_gender_target: genderTarget(formData),
    p_postcode: postcodeHit!.nr,
    p_postcode_name: postcodeHit!.navn,
    p_postcode_lat: postcodeHit!.lat,
    p_postcode_lng: postcodeHit!.lng,
    ...partyInfoArgs(formData),
  });

  if (error || !data) {
    return {
      error: error?.message
        ? `Kunne ikke oprette festen: ${error.message}`
        : "Kunne ikke oprette festen.",
      values: readValues(formData),
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
  const postcode = str(formData, "postcode").trim();
  let postcodeHit = null as ReturnType<typeof lookupPostcodeLocal>;

  const fieldErrors: PartyFieldErrors = {};
  if (!title) fieldErrors.title = "Giv festen en titel.";
  if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    fieldErrors.location = "Angiv et postnummer eller vælg en placering på kortet.";
  }
  if (!startsAt) fieldErrors.starts_at = "Vælg hvornår festen starter.";
  if (postcode) {
    if (!/^\d{4}$/.test(postcode)) {
      fieldErrors.postcode = "Angiv byens postnummer (4 cifre).";
    } else {
      postcodeHit = lookupPostcodeLocal(postcode);
      if (!postcodeHit) fieldErrors.postcode = "Postnummeret blev ikke fundet.";
    }
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values: readValues(formData) };
  }
  if (!validPartyInfo(formData)) {
    return {
      error: "Tjek festens oplysninger. Nogle felter er for lange eller ugyldige.",
      values: readValues(formData),
    };
  }

  const capacityRaw = str(formData, "capacity").trim();
  const minAgeRaw = str(formData, "min_age").trim();
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
    p_venue_type: venueType(formData),
    p_capacity: capacityValue(capacityRaw),
    p_min_age: minAgeRaw ? Number(minAgeRaw) : null,
    p_gender_target: genderTarget(formData),
    p_postcode: postcodeHit?.nr ?? null,
    p_postcode_name: postcodeHit?.navn ?? null,
    p_postcode_lat: postcodeHit?.lat ?? null,
    p_postcode_lng: postcodeHit?.lng ?? null,
    ...partyInfoArgs(formData),
  });

  if (error) {
    return {
      error: `Kunne ikke gemme ændringerne: ${error.message}`,
      values: readValues(formData),
    };
  }

  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/dashboard");
  redirect(`/parties/${partyId}`);
}

/** Delete (cancel) a party — host only, enforced by RLS. Refund any historic
 * completed payments first. Cascades then clean up invites, attendees,
 * requests and chat; a DB trigger notifies the guests. */
export async function deleteParty(partyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify the caller is the host before touching payments (RLS enforces the
  // delete itself, but the refund sweep runs with the service role).
  const { data: party } = await supabase
    .from("parties")
    .select("host_id")
    .eq("id", partyId)
    .maybeSingle();
  if (!party || party.host_id !== user.id) {
    throw new Error("Festen kunne ikke slettes.");
  }

  await refundAllPartyPayments(partyId);

  const { error } = await supabase
    .from("parties")
    .delete()
    .eq("id", partyId)
    .eq("host_id", user.id);
  if (error) {
    throw new Error("Festen kunne ikke slettes.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/parties/mine");
  redirect("/parties/mine");
}

/** Ask to join a party. The host must approve before you count as going. */
export async function requestJoin(partyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A declined row blocks the PK — clear it so the user can ask again.
  await supabase
    .from("party_join_requests")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", user.id)
    .eq("status", "declined");

  const { error } = await supabase
    .from("party_join_requests")
    .insert({ party_id: partyId, user_id: user.id });
  // 23505 = already requested (double tap) — treat as success.
  if (error && error.code !== "23505") {
    throw new Error("Kunne ikke sende anmodningen.");
  }

  revalidatePath(`/parties/${partyId}`);
}

/** Withdraw a join request (also clears a declined one so you can re-ask).
 * Refund any linked historic payment if one exists. */
export async function cancelJoinRequest(partyId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("party_join_requests")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", user.id);
  if (error) {
    throw new Error("Kunne ikke trække anmodningen tilbage.");
  }

  try {
    const ref = await findSoloReference(partyId, user.id);
    if (ref) await refundByReference(ref);
  } catch (e) {
    // Refund is retryable (payment row stays 'completed') — don't lose the
    // withdrawal over a transient Stripe error.
    console.error("Refund on withdraw failed:", e);
  }

  revalidatePath(`/parties/${partyId}`);
}

/** Host only: approve or decline a join request (enforced in the RPC).
 * Declining a prepaid guest triggers a full Stripe refund. */
export async function respondJoinRequest(
  partyId: string,
  userId: string,
  accept: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("respond_join_request", {
    p_party_id: partyId,
    p_user_id: userId,
    p_accept: accept,
  });
  if (error) {
    throw new Error(error.message || "Kunne ikke besvare anmodningen.");
  }

  if (!accept) {
    try {
      const ref = await findSoloReference(partyId, userId);
      if (ref) await refundByReference(ref);
    } catch (e) {
      console.error("Refund on decline failed:", e);
    }
  }

  revalidatePath(`/parties/${partyId}`);
}

// ============================================================================
// Group signup (00033–00035): a leader invites accepted friends, they accept,
// the host approves the whole group (capacity enforced), and — for free parties
// — everyone becomes 'going' immediately. Each wrapper returns the RPC's Danish
// error text (e.g. the capacity message) so the UI can show it inline.
// ============================================================================

export type GroupActionResult = { error?: string };

/** Leader: start a group for a party and invite accepted friends. */
export async function createGroup(
  partyId: string,
  memberIds: string[],
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_group_with_invites", {
    p_party_id: partyId,
    p_member_ids: memberIds,
  });
  if (error) return { error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return {};
}

/** Invited friend: accept or decline a group invite. */
export async function respondGroupInvite(
  partyId: string,
  groupId: string,
  accept: boolean,
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("respond_group_invite", {
    p_group_id: groupId,
    p_accept: accept,
  });
  if (error) return { error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return {};
}

/** Leader: send the formed group to the host for approval. */
export async function submitGroup(
  partyId: string,
  groupId: string,
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("submit_group", { p_group_id: groupId });
  if (error) return { error: error.message };

  revalidatePath(`/parties/${partyId}`);
  return {};
}

/** Host: approve or decline a submitted group. Approval enforces capacity and
 * confirms every accepted member as 'going' (prepaid groups keep their money;
 * declining a prepaid group refunds the leader in full). */
export async function respondGroupRequest(
  partyId: string,
  groupId: string,
  accept: boolean,
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("respond_group_request", {
    p_group_id: groupId,
    p_accept: accept,
  });
  if (error) return { error: error.message };

  if (!accept) {
    try {
      const ref = await findGroupReference(groupId);
      if (ref) await refundByReference(ref);
    } catch (e) {
      console.error("Refund on group decline failed:", e);
    }
  }

  revalidatePath(`/parties/${partyId}`);
  return {};
}

/** Leader: cancel the group before it's confirmed. A prepaid (submitted but
 * not yet approved) group is refunded in full. */
export async function cancelGroup(
  partyId: string,
  groupId: string,
): Promise<GroupActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("cancel_group", { p_group_id: groupId });
  if (error) return { error: error.message };

  try {
    const ref = await findGroupReference(groupId);
    if (ref) await refundByReference(ref);
  } catch (e) {
    console.error("Refund on group cancel failed:", e);
  }

  revalidatePath(`/parties/${partyId}`);
  return {};
}

/** Withdraw an RSVP / cancel attendance. Also clears any join request so the
 * user starts from a clean slate (and can request again later). */
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

  await supabase
    .from("party_join_requests")
    .delete()
    .eq("party_id", partyId)
    .eq("user_id", user.id);

  revalidatePath(`/parties/${partyId}`);
}
