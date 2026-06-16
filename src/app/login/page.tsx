import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ error?: string; message?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  const { error, message } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm opacity-70">
          Welcome back to PartyMakr.
        </p>

        {message ? (
          <p className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-current dark:border-white/15"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-current dark:border-white/15"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-sm opacity-70">
          No account?{" "}
          <Link href="/signup" className="underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
