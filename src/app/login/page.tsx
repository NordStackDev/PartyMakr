import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn, resendConfirmation } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Brand } from "@/components/brand";

type SearchParams = Promise<{
  error?: string;
  message?: string;
  unconfirmed?: string;
}>;

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

  const { error, message, unconfirmed } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Welcome back to the party." />

      <div className="mx-auto mt-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Sign in
        </h1>

        {message ? (
          <p className="mt-4 rounded-xl border border-green-400/30 bg-green-400/10 px-3 py-2 text-sm text-green-300">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {unconfirmed ? (
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-3 text-sm text-amber-200">
            <p>
              Your email isn&apos;t confirmed yet. Check your inbox, or resend
              the confirmation link.
            </p>
            <form action={resendConfirmation} className="mt-3">
              <input type="hidden" name="email" value={unconfirmed} />
              <SubmitButton pendingText="Sending…" className="btn-secondary">
                Resend confirmation email
              </SubmitButton>
            </form>
          </div>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="auth-label">Email</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={unconfirmed ?? ""}
              autoComplete="email"
              className="auth-input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="auth-label">Password</span>
              <Link href="/forgot-password" className="auth-link text-xs">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="auth-input"
            />
          </label>
          <SubmitButton pendingText="Signing in…" className="btn-primary">
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-400">
          No account?{" "}
          <Link href="/signup" className="auth-link">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
