"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/guard";

// ~100 years — effectively permanent until explicitly unbanned.
const PERMANENT_BAN = "876000h";

/**
 * Delete any party. Authorized by the admin DELETE RLS policy; audited.
 */
export async function deleteParty(partyId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase.from("parties").delete().eq("id", partyId);
  if (error) {
    throw new Error("Kunne ikke slette festen.");
  }

  await supabase.rpc("log_admin_action", {
    p_action: "delete_party",
    p_target_type: "party",
    p_target_id: partyId,
  });

  revalidatePath("/admin/parties");
  revalidatePath("/admin");
}

/**
 * Revoke an invite. Authorized by the admin DELETE RLS policy; audited.
 */
export async function revokeInvite(partyId: string, inviteeId: string) {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("party_invites")
    .delete()
    .eq("party_id", partyId)
    .eq("invitee_id", inviteeId);
  if (error) {
    throw new Error("Kunne ikke tilbagekalde invitationen.");
  }

  await supabase.rpc("log_admin_action", {
    p_action: "revoke_invite",
    p_target_type: "invite",
    p_target_id: `${partyId}:${inviteeId}`,
  });

  revalidatePath("/admin/invites");
  revalidatePath("/admin");
}

/**
 * Ban a user: revoke their auth access via the Admin API (service role) AND mark
 * the profile as banned (app-level flag used by sign-in). Audited.
 */
export async function banUser(userId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN,
  });
  if (error) {
    throw new Error("Kunne ikke udelukke brugeren.");
  }

  await supabase
    .from("profiles")
    .update({ banned_at: new Date().toISOString() })
    .eq("id", userId);

  await supabase.rpc("log_admin_action", {
    p_action: "ban_user",
    p_target_type: "user",
    p_target_id: userId,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

/**
 * Lift a ban: clear the auth ban and the profile flag. Audited.
 */
export async function unbanUser(userId: string) {
  await requireAdmin();
  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (error) {
    throw new Error("Kunne ikke ophæve udelukkelsen.");
  }

  await supabase
    .from("profiles")
    .update({ banned_at: null })
    .eq("id", userId);

  await supabase.rpc("log_admin_action", {
    p_action: "unban_user",
    p_target_type: "user",
    p_target_id: userId,
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}
