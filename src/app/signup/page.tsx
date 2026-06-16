import Link from "next/link";
import { redirect } from "next/navigation";

import { signUp } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Brand } from "@/components/brand";

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
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Find parties happening near you." />

      <div className="mx-auto mt-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Create your account
        </h1>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <form action={signUp} className="mt-6 space-y-4">
          <label className="block">
            <span className="auth-label">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="auth-input"
            />
          </label>
          <label className="block">
            <span className="auth-label">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="auth-input"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              At least 8 characters.
            </span>
          </label>
          <SubmitButton pendingText="Creating account…" className="btn-primary">
            Sign up
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="auth-link">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
