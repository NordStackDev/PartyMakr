import Link from "next/link";

import { requestPasswordReset } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";

type SearchParams = Promise<{ error?: string }>;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {error ? (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={requestPasswordReset} className="mt-6 space-y-4">
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
          <SubmitButton
            pendingText="Sending…"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            Send reset link
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm opacity-70">
          Remembered it?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
