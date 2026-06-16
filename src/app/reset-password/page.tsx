import { redirect } from "next/navigation";

import { updatePassword } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";

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
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm opacity-70">
          Set a new password for {user.email}.
        </p>

        {error ? (
          <p className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <form action={updatePassword} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">New password</span>
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
          <SubmitButton
            pendingText="Updating…"
            className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
          >
            Update password
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
