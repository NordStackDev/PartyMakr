import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Whether the current request's user is an admin. Uses the DB `is_admin()` RPC
 * (the single source of truth) against the verified session user.
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
 * Gate for admin server components and server actions. Redirects unauthenticated
 * users to /login and non-admins to /dashboard (without revealing that /admin
 * exists). Call this at the top of EVERY admin action — never trust the layout
 * guard alone. Returns the verified admin user.
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
