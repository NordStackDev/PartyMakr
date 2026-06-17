import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { updateSettings } from "@/lib/profile/actions";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";
import { RadiusSlider } from "@/components/settings/radius-slider";

type SearchParams = Promise<{ saved?: string; error?: string }>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, bio, search_radius_km")
    .eq("id", user.id)
    .maybeSingle();

  const { saved, error } = await searchParams;
  const radius = profile?.search_radius_km ?? 25;

  return (
    <main className="flex flex-1 flex-col px-5 py-5">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-300 hover:text-zinc-100"
      >
        ← Kort
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Indstillinger
      </h1>
      <p className="mt-1 text-sm text-zinc-400">{user.email}</p>

      {saved ? (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          Indstillinger gemt.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <form action={updateSettings} className="mt-6 space-y-4">
        <RadiusSlider name="search_radius_km" defaultValue={radius} />

        <label className="block">
          <span className="auth-label">Visningsnavn</span>
          <input
            name="display_name"
            defaultValue={profile?.display_name ?? ""}
            className="auth-input"
          />
        </label>

        <label className="block">
          <span className="auth-label">Brugernavn</span>
          <input
            name="username"
            defaultValue={profile?.username ?? ""}
            className="auth-input"
          />
        </label>

        <label className="block">
          <span className="auth-label">Bio</span>
          <textarea
            name="bio"
            rows={3}
            defaultValue={profile?.bio ?? ""}
            className="auth-input resize-none"
          />
        </label>

        <SubmitButton className="btn-primary" pendingText="Gemmer…">
          Gem indstillinger
        </SubmitButton>
      </form>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
        >
          Log ud
        </button>
      </form>
    </main>
  );
}
