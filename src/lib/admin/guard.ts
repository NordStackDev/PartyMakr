import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import type { PermissionKey } from "@/lib/admin/permissions";

type AdminContext = {
  userId: string | null;
  isAdmin: boolean;
  permissions: string[];
};

/**
 * Reads the current user's own admin row. Backed by the admin_users "self-read"
 * RLS policy (user_id = auth.uid()), so no SECURITY DEFINER RPC is needed — a
 * non-admin simply has no row.
 *
 * Wrapped in React `cache()` so requireAdmin + getPermissions + requirePermission
 * within one request share a single auth round-trip + a single admin_users read.
 */
const adminContext = cache(async (): Promise<AdminContext> => {
  const user = await getCurrentUser();
  if (!user) return { userId: null, isAdmin: false, permissions: [] };

  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_users")
    .select("permissions")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    isAdmin: !!data,
    permissions: (data?.permissions ?? []) as string[],
  };
});

export async function isAdmin(): Promise<boolean> {
  return (await adminContext()).isAdmin;
}

export async function getPermissions(): Promise<string[]> {
  return (await adminContext()).permissions;
}

/**
 * Gate for the admin shell: any admin may enter. Redirects unauthenticated
 * users to /login and non-admins to /dashboard. Returns the user id.
 */
export async function requireAdmin(): Promise<string> {
  const { userId, isAdmin } = await adminContext();
  if (!userId) redirect("/login");
  if (!isAdmin) redirect("/dashboard");
  return userId;
}

/**
 * Page guard for a specific section: must be an admin AND hold `perm`, else
 * redirect back to the admin home. Returns { userId, permissions }.
 */
export async function requirePermission(perm: PermissionKey) {
  const ctx = await adminContext();
  if (!ctx.userId) redirect("/login");
  if (!ctx.isAdmin) redirect("/dashboard");
  if (!ctx.permissions.includes(perm)) redirect("/admin");
  return { userId: ctx.userId, permissions: ctx.permissions };
}

/**
 * Server-action guard for a specific permission. Throws (rather than redirects)
 * so callers surface a clean error. Returns the verified user id.
 */
export async function assertPermission(perm: PermissionKey): Promise<string> {
  const ctx = await adminContext();
  if (!ctx.isAdmin || !ctx.permissions.includes(perm)) {
    throw new Error("Du har ikke tilladelse til denne handling.");
  }
  return ctx.userId as string;
}
