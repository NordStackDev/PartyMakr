import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { Brand } from "@/components/brand";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <Brand tagline="You're in." />

      <div className="mt-8 w-full max-w-md">
        <p className="text-sm text-zinc-400">
          Signed in as{" "}
          <span className="font-mono text-zinc-200">{user?.email}</span>
        </p>

        <p className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-400">
          The map of nearby parties will live here.
        </p>

        <form action={signOut} className="mt-8">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
