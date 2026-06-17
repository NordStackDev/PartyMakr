import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { identityFetch } from "@/lib/supabase/fetch";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: identityFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component. This can be ignored
            // when there is a proxy refreshing the user session.
          }
        },
      },
    },
  );
}
