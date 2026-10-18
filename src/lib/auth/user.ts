import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * The current user identity, verified from Supabase's signed JWT.
 *
 * Wrapped in React `cache()` so all server components in a single request
 * share one signature verification. With asymmetric Supabase signing keys,
 * verification is local after the public key has been cached.
 *
 * Server actions should NOT use this — each action is its own request and must
 * re-verify the caller independently.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data,
  } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  return id ? { id } : null;
});
