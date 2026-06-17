import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * The current user, validated against the Supabase Auth server.
 *
 * Wrapped in React `cache()` so that all server components in a single request
 * (root layout, nested layouts, the page, and any shared helpers) share ONE
 * auth round-trip instead of each calling `supabase.auth.getUser()` again.
 *
 * Server actions should NOT use this — each action is its own request and must
 * re-verify the caller independently.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
