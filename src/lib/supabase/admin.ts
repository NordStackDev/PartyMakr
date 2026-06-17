import "server-only";

import { createClient } from "@supabase/supabase-js";

import { identityFetch } from "@/lib/supabase/fetch";

/**
 * Service-role Supabase client — bypasses RLS and can call the Auth Admin API
 * (ban / delete users). DANGEROUS: it must never reach the browser.
 *
 * Safeguards:
 *   - `import "server-only"` makes the build fail if this module is ever pulled
 *     into a client bundle.
 *   - Only instantiate this inside server actions AFTER `requireAdmin()`.
 *   - Use it only for operations that genuinely need the Admin API; everything
 *     else should go through the RLS-enforced anon client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(url, serviceKey, {
    global: { fetch: identityFetch },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
