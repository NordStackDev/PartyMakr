import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re signed in
        </h1>
        <p className="mt-2 text-sm opacity-70">
          Logged in as <span className="font-mono">{user?.email}</span>
        </p>

        <p className="mt-6 text-sm opacity-70">
          The map of nearby parties will live here.
        </p>

        <form action={signOut} className="mt-8">
          <button
            type="submit"
            className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
