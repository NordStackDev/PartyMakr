import { createBrowserClient } from "@supabase/ssr";

function buildBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof buildBrowserClient> | undefined;

export function createClient() {
  browserClient ??= buildBrowserClient();

  return browserClient;
}
