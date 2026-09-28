"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundAllPartyPayments, refundByReference } from "@/lib/stripe/settle";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const radius = Math.min(
    500,
    Math.max(1, Math.round(Number(str(formData, "search_radius_km")) || 25)),
  );

  const genderRaw = str(formData, "gender");
  const gender =
    genderRaw === "male" || genderRaw === "female" || genderRaw === "other"
      ? genderRaw
      : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: str(formData, "display_name").trim() || null,
      username: str(formData, "username").trim() || null,
      bio: str(formData, "bio").trim() || null,
      gender,
      search_radius_km: radius,
    })
    .eq("id", user.id);

  if (error) {
    const msg =
      error.code === "23505"
        ? "Brugernavnet er allerede taget."
        : "Kunne ikke gemme indstillingerne.";
    redirect("/settings?error=" + encodeURIComponent(msg));
  }

  revalidatePath("/dashboard");
  redirect("/settings?saved=1");
}

/**
 * DEV STUB for age verification. Records a verified birthdate directly, standing
 * in for the real MitID (Criipto/Signicat) callback until that's wired up. The
 * write goes through the service-role RPC set_verified_age (users can't set
 * their own age). Swap the caller for the OIDC callback when the broker is live.
 */
export async function verifyAgeStub(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dob = str(formData, "date_of_birth");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
    redirect("/settings?error=" + encodeURIComponent("Ugyldig fødselsdato."));
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_verified_age", {
    p_uid: user.id,
    p_dob: dob,
    p_method: "stub",
  });
  if (error) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("Kunne ikke verificere alderen."),
    );
  }

  revalidatePath("/settings");
  revalidatePath(`/profile/${user.id}`);
  redirect("/settings?saved=1");
}

/**
 * Mark the first-time help guide as seen so it won't auto-open again. Called
 * when the user closes the guide the first time. No redirect/revalidate — it's
 * a fire-and-forget background write from the client.
 */
export async function markOnboarded() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);
}

/** Persist a new avatar URL (file already uploaded to storage client-side). */
export async function updateAvatar(url: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url || null })
    .eq("id", user.id);
  if (error) {
    throw new Error("Kunne ikke gemme profilbilledet.");
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export type AccountDeletionResult = { error?: string };

function isActiveParty(
  party: { starts_at: string; ends_at: string | null },
  now: number,
) {
  return (
    new Date(party.starts_at).getTime() > now ||
    !party.ends_at ||
    new Date(party.ends_at).getTime() > now
  );
}

/**
 * Makes the account immediately unavailable while retaining Auth + relational
 * data for 30 days. Deleting active hosting/attendance now avoids orphaned
 * plans and ensures refundable charges are handled before their rows vanish.
 */
export async function requestAccountDeletion(
  confirmation: string,
): Promise<AccountDeletionResult> {
  if (confirmation !== "SLET MIN KONTO") {
    return { error: "Skriv SLET MIN KONTO for at bekræfte." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const now = Date.now();

  const { data: hosted } = await admin
    .from("parties")
    .select("id, starts_at, ends_at")
    .eq("host_id", user.id);
  const activeHosted = (hosted ?? []).filter((party) => isActiveParty(party, now));
  for (const party of activeHosted) {
    await refundAllPartyPayments(party.id);
  }
  if (activeHosted.length) {
    const { error } = await admin
      .from("parties")
      .delete()
      .in("id", activeHosted.map((party) => party.id));
    if (error) return { error: "Kunne ikke aflyse dine aktive fester." };
  }

  // Cancel refundable payments made by this user for other active parties.
  const { data: payments } = await admin
    .from("party_payments")
    .select("reference, party_id, status, payout_status")
    .eq("payer_id", user.id)
    .eq("status", "completed");
  const paymentPartyIds = [...new Set((payments ?? []).map((payment) => payment.party_id))];
  let activePaymentPartyIds = new Set<string>();
  if (paymentPartyIds.length) {
    const { data: paymentParties } = await admin
      .from("parties")
      .select("id, starts_at, ends_at")
      .in("id", paymentPartyIds);
    activePaymentPartyIds = new Set(
      (paymentParties ?? [])
        .filter((party) => isActiveParty(party, now))
        .map((party) => party.id),
    );
  }
  for (const payment of payments ?? []) {
    if (
      activePaymentPartyIds.has(payment.party_id) &&
      payment.payout_status !== "released"
    ) {
      try {
        await refundByReference(payment.reference);
      } catch (error) {
        console.error(`Account deletion refund failed for ${payment.reference}:`, error);
      }
    }
  }

  const { data: attendance } = await admin
    .from("party_attendees")
    .select("party_id")
    .eq("user_id", user.id);
  const { data: joinRequests } = await admin
    .from("party_join_requests")
    .select("party_id")
    .eq("user_id", user.id);
  const { data: groups } = await admin
    .from("party_groups")
    .select("id, party_id")
    .eq("leader_id", user.id);
  const relatedPartyIds = [
    ...new Set([
      ...(attendance ?? []).map((row) => row.party_id),
      ...(joinRequests ?? []).map((row) => row.party_id),
      ...(groups ?? []).map((group) => group.party_id),
    ]),
  ];
  let activeRelatedPartyIds = new Set<string>();
  if (relatedPartyIds.length) {
    const { data: relatedParties } = await admin
      .from("parties")
      .select("id, starts_at, ends_at")
      .in("id", relatedPartyIds);
    activeRelatedPartyIds = new Set(
      (relatedParties ?? [])
        .filter((party) => isActiveParty(party, now))
        .map((party) => party.id),
    );
  }
  if (activeRelatedPartyIds.size) {
    const partyIds = [...activeRelatedPartyIds];
    await admin.from("party_attendees").delete().eq("user_id", user.id).in("party_id", partyIds);
    await admin.from("party_join_requests").delete().eq("user_id", user.id).in("party_id", partyIds);
  }

  // Remove every group membership now so a hidden account cannot remain in a
  // group. A leader's future group is cancelled as part of the attendee cleanup.
  await admin.from("party_group_members").delete().eq("user_id", user.id);
  await admin.from("party_invites").delete().eq("invitee_id", user.id);
  await admin
    .from("friendships")
    .delete()
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  const activeLeaderGroups = (groups ?? []).filter((group) =>
    activeRelatedPartyIds.has(group.party_id),
  );
  if (activeLeaderGroups.length) {
    await admin
      .from("party_groups")
      .delete()
      .in("id", activeLeaderGroups.map((group) => group.id));
  }

  // Public bucket URLs remain reachable, so remove the avatar files instead of
  // merely clearing the profile URL.
  const { data: avatarFiles } = await admin.storage.from("avatars").list(user.id);
  if (avatarFiles?.length) {
    await admin.storage
      .from("avatars")
      .remove(avatarFiles.map((file) => `${user.id}/${file.name}`));
  }

  const { error: markError } = await admin
    .from("profiles")
    .update({ avatar_url: null, deletion_requested_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("deletion_requested_at", null);
  if (markError) return { error: "Kunne ikke markere kontoen til sletning." };

  await supabase.auth.signOut({ scope: "global" });
  revalidatePath("/", "layout");
  return {};
}

/** Restore a pending-deletion account after a normal, password-verified login. */
export async function restoreAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", user.id)
    .not("deletion_requested_at", "is", null);
  if (error) throw new Error("Kunne ikke gendanne kontoen.");

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
