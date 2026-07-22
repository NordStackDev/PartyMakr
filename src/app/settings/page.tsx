import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { updateSettings, verifyAgeStub } from "@/lib/profile/actions";
import { iduraConfigured } from "@/lib/idura/client";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";
import { RadiusSlider } from "@/components/settings/radius-slider";
import { AvatarUploader } from "@/components/settings/avatar-uploader";

function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

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

  const { saved, error } = await searchParams;

  const [{ data: profile }, { data: ageRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, username, bio, avatar_url, gender, search_radius_km",
      )
      .eq("id", user.id)
      .maybeSingle(),
    // RLS lets a user read only their own birthdate.
    supabase
      .from("profile_age")
      .select("date_of_birth")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const radius = profile?.search_radius_km ?? 250;
  const age = ageRow?.date_of_birth ? ageFrom(ageRow.date_of_birth) : null;

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <h1 className="text-xl font-semibold tracking-tight text-white">
        Profil &amp; indstillinger
      </h1>

      {saved ? (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          Gemt.
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <section className="glass-card mt-6 space-y-5 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white">Profil</h2>

        <AvatarUploader userId={user.id} avatarUrl={profile?.avatar_url ?? null} />

        <form action={updateSettings} className="space-y-4">
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

          <label className="block">
            <span className="auth-label">Køn</span>
            <select
              name="gender"
              defaultValue={profile?.gender ?? ""}
              className="auth-input"
            >
              <option value="">Vælg…</option>
              <option value="female">Kvinde</option>
              <option value="male">Mand</option>
              <option value="other">Andet</option>
            </select>
          </label>

          <div className="border-t border-white/10 pt-4">
            <RadiusSlider name="search_radius_km" defaultValue={radius} />
          </div>

          <SubmitButton className="btn-primary" pendingText="Gemmer…">
            Gem
          </SubmitButton>
        </form>

        <div className="border-t border-white/10 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck size={16} className="text-amber-300" />
            Aldersverifikation
          </h3>
          {age != null ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
              <ShieldCheck size={15} />
              Verificeret · {age} år
            </p>
          ) : iduraConfigured() ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-zinc-400">
                Verificér din alder med MitID for at kunne deltage i fester med
                aldersgrænse.
              </p>
              <a
                href="/api/verify/mitid/start"
                className="btn-secondary inline-flex items-center gap-2"
              >
                <ShieldCheck size={16} />
                Verificér med MitID
              </a>
            </div>
          ) : (
            <form action={verifyAgeStub} className="mt-2 space-y-2">
              <p className="text-xs text-zinc-400">
                Verificér din alder for at kunne deltage i fester med
                aldersgrænse.
              </p>
              <input
                type="date"
                name="date_of_birth"
                required
                className="auth-input"
                aria-label="Fødselsdato"
              />
              <SubmitButton className="btn-secondary" pendingText="Verificerer…">
                Verificér alder (test)
              </SubmitButton>
              <p className="text-[11px] text-zinc-500">
                Midlertidig test-verifikation. Rigtig MitID-verifikation kobles
                på senere.
              </p>
            </form>
          )}
        </div>

      </section>

      <form action={signOut} className="mt-6">
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
