import Link from "next/link";
import { redirect } from "next/navigation";

import { signUp } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ error?: string }>;

export default async function SignupPage({
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

  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Find parties happening near you.
        </p>

        {error ? (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={signUp} className="mt-6 space-y-4">
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
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-current dark:border-white/15"
            />
            <span className="mt-1 block text-xs opacity-60">
              At least 8 characters.
            </span>
          </label>
          <button
            type="submit"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Sign up
          </button>
        </form>

        <p className="mt-6 text-center text-sm opacity-70">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
