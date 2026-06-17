"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission } from "@/lib/admin/guard";
import { PERMISSION_KEYS } from "@/lib/admin/permissions";

// ~100 years — effectively permanent until explicitly unbanned.
const PERMANENT_BAN = "876000h";

/**
 * Write an audit row via the service role. The audit table has no INSERT policy
 * for authenticated users (append-only), so the service role is the only write
 * path. `actorId` comes from the server-side permission check, so it can't be
 * forged by a client.
 */
async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const admin = createAdminClient();
  await admin.from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
}

/** Look up a user's email by id (best-effort; for readable audit labels). */
async function emailOf(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | undefined> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? undefined;
}

/**
 * Delete any party. Authorized by the admin DELETE RLS policy; audited.
 */
export async function deleteParty(partyId: string) {
  const actorId = await assertPermission("moderate");
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: party } = await admin
    .from("parties")
    .select("title")
    .eq("id", partyId)
    .maybeSingle();

  const { error } = await supabase.from("parties").delete().eq("id", partyId);
  if (error) {
    throw new Error("Kunne ikke slette festen.");
  }

  await audit(actorId, "delete_party", "party", partyId, {
    title: party?.title,
  });

  revalidatePath("/admin/parties");
  revalidatePath("/admin");
}

/**
 * Revoke an invite. Authorized by the admin DELETE RLS policy; audited.
 */
export async function revokeInvite(partyId: string, inviteeId: string) {
  const actorId = await assertPermission("moderate");
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: party } = await admin
    .from("parties")
    .select("title")
    .eq("id", partyId)
    .maybeSingle();
  const invitee = await emailOf(admin, inviteeId);

  const { error } = await supabase
    .from("party_invites")
    .delete()
    .eq("party_id", partyId)
    .eq("invitee_id", inviteeId);
  if (error) {
    throw new Error("Kunne ikke tilbagekalde invitationen.");
  }

  await audit(actorId, "revoke_invite", "invite", `${partyId}:${inviteeId}`, {
    party_title: party?.title,
    invitee,
  });

  revalidatePath("/admin/invites");
  revalidatePath("/admin");
}

/**
 * Ban a user: revoke their auth access via the Admin API (service role) AND mark
 * the profile as banned (app-level flag used by sign-in). Audited.
 */
export async function banUser(userId: string) {
  const actorId = await assertPermission("moderate");
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

  await audit(actorId, "ban_user", "user", userId, {
    email: await emailOf(admin, userId),
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
  const actorId = await assertPermission("moderate");
  if (actorId === userId) {
    throw new Error("Du kan ikke slette din egen konto.");
  }

  const admin = createAdminClient();

  // Record the audit entry BEFORE deletion (actor stays; target row is gone).
  await audit(actorId, "delete_user", "user", userId, {
    email: await emailOf(admin, userId),
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
  const actorId = await assertPermission("moderate");
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

  await audit(actorId, "unban_user", "user", userId, {
    email: await emailOf(admin, userId),
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

// ===========================================================================
// Admin team management (requires the 'manage_admins' permission)
// ===========================================================================

function sanitizePermissions(permissions: string[]): string[] {
  // Only allow known permission keys; dedupe.
  return [
    ...new Set(permissions.filter((p) => PERMISSION_KEYS.includes(p as never))),
  ];
}

/**
 * Grant admin access to a user by email with a set of permissions. If the user
 * already has an account they're granted immediately; otherwise a Supabase
 * invite email is sent (creating the account) and they're granted on creation.
 */
export async function addAdmin(email: string, permissions: string[]) {
  const actorId = await assertPermission("manage_admins");
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("Indtast en e-mailadresse.");
  }
  const perms = sanitizePermissions(permissions);

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
    .upsert(
      { user_id: targetId, permissions: perms },
      { onConflict: "user_id" },
    );
  if (error) {
    throw new Error("Kunne ikke tilføje admin.");
  }

  await audit(actorId, "add_admin", "user", targetId, {
    email: cleanEmail,
    permissions: perms,
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
  const actorId = await assertPermission("manage_admins");
  const perms = sanitizePermissions(permissions);

  const admin = createAdminClient();

  const { error } = await admin
    .from("admin_users")
    .update({ permissions: perms })
    .eq("user_id", userId);
  if (error) {
    throw new Error("Kunne ikke opdatere tilladelser.");
  }

  await audit(actorId, "update_admin", "user", userId, {
    email: await emailOf(admin, userId),
    permissions: perms,
  });

  revalidatePath("/admin/team");
}

/**
 * Revoke a user's admin access entirely (does not delete their account). An
 * admin cannot revoke their own access (avoids locking out the last manager).
 */
export async function removeAdmin(userId: string) {
  const actorId = await assertPermission("manage_admins");
  if (actorId === userId) {
    throw new Error("Du kan ikke fjerne din egen admin-adgang.");
  }

  const admin = createAdminClient();

  const email = await emailOf(admin, userId);

  const { error } = await admin
    .from("admin_users")
    .delete()
    .eq("user_id", userId);
  if (error) {
    throw new Error("Kunne ikke fjerne admin.");
  }

  await audit(actorId, "remove_admin", "user", userId, { email });

  revalidatePath("/admin/team");
}
