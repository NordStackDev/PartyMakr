import Link from "next/link";

import { requestPasswordReset } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";
import { Brand } from "@/components/brand";

type SearchParams = Promise<{ error?: string }>;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Vi får dig ind igen." />

      <div className="mx-auto mt-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Nulstil din adgangskode
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          Indtast din e-mail, så sender vi dig et nulstillingslink.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <form action={requestPasswordReset} className="mt-6 space-y-4">
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
          <SubmitButton pendingText="Sender…" className="btn-primary">
            Send nulstillingslink
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-300">
          Kom du i tanke om den?{" "}
          <Link href="/login" className="auth-link">
            Tilbage til log ind
          </Link>
        </p>
      </div>
    </main>
  );
}
