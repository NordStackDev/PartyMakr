"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/admin/guard";
import { PERMISSION_KEYS } from "@/lib/admin/permissions";

// ~100 years — effectively permanent until explicitly unbanned.
const PERMANENT_BAN = "876000h";

/**
 * Delete any party. Authorized by the admin DELETE RLS policy; audited.
 */
export async function deleteParty(partyId: string) {
  await assertPermission("moderate");
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
  await assertPermission("moderate");
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
  await assertPermission("moderate");
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
 * Permanently delete a user from the system via the Auth Admin API. The auth
 * user FK cascade removes their profile, and from there their parties, invites,
 * and RSVPs. Irreversible. Admins cannot delete their own account. Audited.
 */
export async function removeUser(userId: string) {
  const admin_user = await assertPermission("moderate");
  if (admin_user.id === userId) {
    throw new Error("Du kan ikke slette din egen konto.");
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Record the audit entry BEFORE deletion (actor stays; target row is gone).
  await supabase.rpc("log_admin_action", {
    p_action: "delete_user",
    p_target_type: "user",
    p_target_id: userId,
  });

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error("Kunne ikke slette brugeren.");
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

/**
 * Lift a ban: clear the auth ban and the profile flag. Audited.
 */
export async function unbanUser(userId: string) {
  await assertPermission("moderate");
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

// ===========================================================================
// Admin team management (requires the 'manage_admins' permission)
// ===========================================================================

function sanitizePermissions(permissions: string[]): string[] {
  // Only allow known permission keys; dedupe.
  return [...new Set(permissions.filter((p) => PERMISSION_KEYS.includes(p as never)))];
}

/**
 * Grant admin access to a user by email with a set of permissions. If the user
 * already has an account they're granted immediately; otherwise a Supabase
 * invite email is sent (creating the account) and they're granted on creation.
 */
export async function addAdmin(email: string, permissions: string[]) {
  await assertPermission("manage_admins");
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Indtast en e-mailadresse.");
  }
  const perms = sanitizePermissions(permissions);

  const supabase = await createClient();
  const admin = createAdminClient();

  // Find an existing auth user with this email.
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  let targetId = list?.users.find(
    (u) => (u.email ?? "").toLowerCase() === cleanEmail,
  )?.id;

  // Not found — send an invite, which creates the account.
  if (!targetId) {
    const { data: invited, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(cleanEmail);
    if (inviteError || !invited?.user) {
      throw new Error(
        "Kunne ikke invitere. Bed personen om at oprette en konto først.",
      );
    }
    targetId = invited.user.id;
  }

  const { error } = await admin
    .from("admin_users")
    .upsert({ user_id: targetId, permissions: perms }, { onConflict: "user_id" });
  if (error) {
    throw new Error("Kunne ikke tilføje admin.");
  }

  await supabase.rpc("log_admin_action", {
    p_action: "add_admin",
    p_target_type: "user",
    p_target_id: targetId,
    p_metadata: { email: cleanEmail, permissions: perms },
  });

  revalidatePath("/admin/team");
}

/**
 * Replace an admin's permissions.
 */
export async function updateAdminPermissions(
  userId: string,
  permissions: string[],
) {
  await assertPermission("manage_admins");
  const perms = sanitizePermissions(permissions);

  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await admin
    .from("admin_users")
    .update({ permissions: perms })
    .eq("user_id", userId);
  if (error) {
    throw new Error("Kunne ikke opdatere tilladelser.");
  }

  await supabase.rpc("log_admin_action", {
    p_action: "update_admin",
    p_target_type: "user",
    p_target_id: userId,
    p_metadata: { permissions: perms },
  });

  revalidatePath("/admin/team");
}

/**
 * Revoke a user's admin access entirely (does not delete their account). An
 * admin cannot revoke their own access (avoids locking out the last manager).
 */
export async function removeAdmin(userId: string) {
  const self = await assertPermission("manage_admins");
  if (self.id === userId) {
    throw new Error("Du kan ikke fjerne din egen admin-adgang.");
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { error } = await admin
    .from("admin_users")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw new Error("Kunne ikke fjerne admin.");
  }

  await supabase.rpc("log_admin_action", {
    p_action: "remove_admin",
    p_target_type: "user",
    p_target_id: userId,
  });

  revalidatePath("/admin/team");
}
