import Link from "next/link";

import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";
import { Brand } from "@/components/brand";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = await isAdmin();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Brand tagline="Du er logget ind." />

      <div className="mt-8 w-full max-w-md">
        <p className="text-sm text-zinc-300">
          Logget ind som{" "}
          <span className="font-mono text-zinc-200">{user?.email}</span>
        </p>

        <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-300">
          Kortet med fester i nærheden kommer her.
        </p>

        {admin ? (
          <Link
            href="/admin"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#FCBE4F] px-5 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/30 transition hover:bg-[#fdca6b]"
          >
            Åbn Admin Panelet
          </Link>
        ) : null}

        <form action={signOut} className="mt-8">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Log ud
          </button>
        </form>
      </div>
    </main>
  );
}
