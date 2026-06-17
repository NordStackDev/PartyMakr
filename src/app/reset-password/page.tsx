import { redirect } from "next/navigation";

import { updatePassword } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { Brand } from "@/components/brand";

type SearchParams = Promise<{ error?: string }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Reaching this page requires the recovery session created by the reset link.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Næsten færdig." />

      <div className="mx-auto mt-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Vælg en ny adgangskode
        </h1>
        <p className="mt-1 text-sm text-zinc-300">
          Vælg en ny adgangskode til {user.email}.
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block">
            <span className="auth-label">Ny adgangskode</span>
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
          <SubmitButton pendingText="Opdaterer…" className="btn-primary">
            Opdater adgangskode
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
