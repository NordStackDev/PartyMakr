import Link from "next/link";
import { redirect } from "next/navigation";

import { signUp } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/user";
import { SubmitButton } from "@/components/submit-button";
import { Turnstile } from "@/components/auth/turnstile";
import { Brand } from "@/components/brand";
import { FreeFirstYearNotice } from "@/components/free-first-year-notice";

type SearchParams = Promise<{ error?: string }>;

export default async function SignupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Find fester i nærheden af dig." />

      <div className="mx-auto mt-6 w-full max-w-sm">
        <FreeFirstYearNotice />
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Opret din konto
        </h1>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <form action={signUp} className="mt-6 space-y-4">
          <label className="block">
            <span className="auth-label">E-mail</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="auth-input"
            />
          </label>
          <label className="block">
            <span className="auth-label">Adgangskode</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="auth-input"
            />
            <span className="mt-1 block text-xs text-zinc-400">
              Mindst 8 tegn.
            </span>
          </label>
          <Turnstile action="signup" />
          <SubmitButton pendingText="Opretter konto…" className="btn-primary">
            Opret konto
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-300">
          Har du allerede en konto?{" "}
          <Link href="/login" className="auth-link">
            Log ind
          </Link>
        </p>
      </div>
    </main>
  );
}
