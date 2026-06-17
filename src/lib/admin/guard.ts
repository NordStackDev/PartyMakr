import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { PermissionKey } from "@/lib/admin/permissions";

/**
 * Whether the current request's user is an admin at all (in admin_users). Uses
 * the DB `is_admin()` RPC against the verified session user.
 */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_admin");
  return !error && data === true;
}

/**
 * The current user's permission keys (empty if not an admin).
 */
export async function getPermissions(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("my_admin_permissions");
  return error || !Array.isArray(data) ? [] : (data as string[]);
}

/**
 * Gate for admin server components/actions: any admin may enter the shell.
 * Redirects unauthenticated users to /login and non-admins to /dashboard.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) {
    redirect("/dashboard");
  }

  return user;
}

/**
 * Page guard for a specific section: must be an admin AND hold `perm`, else
 * redirect back to the admin home. Returns { user, permissions }.
 */
export async function requirePermission(perm: PermissionKey) {
  const user = await requireAdmin();
  const permissions = await getPermissions();
  if (!permissions.includes(perm)) {
    redirect("/admin");
  }
  return { user, permissions };
}

/**
 * Server-action guard for a specific permission. Throws (rather than redirects)
 * so callers surface a clean error. Returns the verified user.
 */
export async function assertPermission(perm: PermissionKey) {
  const user = await requireAdmin();
  const permissions = await getPermissions();
  if (!permissions.includes(perm)) {
    throw new Error("Du har ikke tilladelse til denne handling.");
  }
  return user;
}
