import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Brand size="lg" />

      <p className="mt-4 max-w-xs text-base text-zinc-400">
        Find parties happening near you — on a map, not a feed.
      </p>

      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <Link href="/signup" className="btn-primary">
          Get started
        </Link>
        <Link href="/login" className="btn-ghost">
          I have an account
        </Link>
      </div>

      <p className="mt-10 text-xs text-zinc-500">
        Public events · friends&apos; gatherings · private parties
      </p>
    </main>
  );
}
