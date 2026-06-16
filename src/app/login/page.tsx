import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn, resendConfirmation } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

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

        {unconfirmed ? (
          <div className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
            <p>
              Your email isn&apos;t confirmed yet. Check your inbox, or resend
              the confirmation link.
            </p>
            <form action={resendConfirmation} className="mt-3">
              <input type="hidden" name="email" value={unconfirmed} />
              <SubmitButton
                pendingText="Sending…"
                className="rounded-md border border-current px-3 py-1.5 text-sm font-medium hover:bg-black/5 disabled:opacity-60 dark:hover:bg-white/5"
              >
                Resend confirmation email
              </SubmitButton>
            </form>
          </div>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              name="email"
              required
              defaultValue={unconfirmed ?? ""}
              autoComplete="email"
              className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-current dark:border-white/15"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Password</span>
              <Link
                href="/forgot-password"
                className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-current dark:border-white/15"
            />
          </label>
          <SubmitButton
            pendingText="Signing in…"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            Sign in
          </SubmitButton>
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
