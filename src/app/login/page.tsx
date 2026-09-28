import Link from "next/link";
import { redirect } from "next/navigation";

import { signIn, resendConfirmation } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/user";
import { SubmitButton } from "@/components/submit-button";
import { Turnstile } from "@/components/auth/turnstile";
import { Brand } from "@/components/brand";
import { FreeFirstYearNotice } from "@/components/free-first-year-notice";

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
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const { error, message, unconfirmed } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Velkommen tilbage til festen." />

      <div className="mx-auto mt-6 w-full max-w-sm">
        <FreeFirstYearNotice />
        <h1 className="text-xl font-semibold tracking-tight text-white mt-6">
          Log ind
        </h1>

        {message ? (
          <p className="mt-6 rounded-xl border border-green-400/30 bg-green-400/10 px-3 py-2 text-sm text-green-300">
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
              Din e-mail er ikke bekræftet endnu. Tjek din indbakke, eller send
              bekræftelseslinket igen.
            </p>
            <form action={resendConfirmation} className="mt-3">
              <input type="hidden" name="email" value={unconfirmed} />
              <Turnstile action="resend" />
              <SubmitButton pendingText="Sender…" className="btn-secondary">
                Send bekræftelse igen
              </SubmitButton>
            </form>
          </div>
        ) : null}

        <form action={signIn} className="mt-6 space-y-4">
          <label className="block">
            <span className="auth-label">E-mail</span>
            <input
              type="email"
              name="email"
              required
              autoFocus
              defaultValue={unconfirmed ?? ""}
              autoComplete="email"
              className="auth-input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between">
              <span className="auth-label">Adgangskode</span>
              <Link href="/forgot-password" className="auth-link text-xs">
                Glemt adgangskode?
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
          <Turnstile action="login" />
          <SubmitButton pendingText="Logger ind…" className="btn-primary">
            Log ind
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-300">
          Ingen konto?{" "}
          <Link href="/signup" className="auth-link">
            Opret en
          </Link>
        </p>
      </div>
    </main>
  );
}
