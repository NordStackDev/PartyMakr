import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        PartyMakr
      </h1>
      <p className="mt-3 max-w-md text-base opacity-70">
        Find parties happening near you — on a map, not a feed.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-black/10 px-5 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
        >
          I have an account
        </Link>
      </div>
    </main>
  );
}
