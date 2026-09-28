import { redirect } from "next/navigation";
import { Landmark, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { updateSettings, verifyAgeStub } from "@/lib/profile/actions";
import { iduraConfigured } from "@/lib/idura/client";
import { connectStripePayouts, refreshPayoutStatus } from "@/lib/stripe/actions";
import { stripeConfigured } from "@/lib/stripe/client";
import { isMarketplace } from "@/lib/payments/mode";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/submit-button";
import { RadiusSlider } from "@/components/settings/radius-slider";
import { AvatarUploader } from "@/components/settings/avatar-uploader";
import { DeleteAccountButton } from "@/components/settings/delete-account-button";

function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

type SearchParams = Promise<{ saved?: string; error?: string; stripe?: string }>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { saved, error, stripe } = await searchParams;
  const marketplace = isMarketplace();
  // Back from Stripe onboarding (marketplace mode) — sync before rendering.
  if (marketplace && stripe === "retur") {
    await refreshPayoutStatus(user.id);
  }

  const [{ data: profile }, { data: ageRow }, { data: payout }, { data: reviews }] =
    await Promise.all([
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
      marketplace
        ? supabase
            .from("host_payout_accounts")
            .select("charges_enabled, details_submitted")
            .eq("id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("party_reviews")
        .select("party_id, reviewer_id, rating, comment, created_at")
        .eq("reviewee_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const reviewRows = (reviews ?? []) as {
    party_id: string;
    reviewer_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
  }[];
  const reviewerIds = [...new Set(reviewRows.map((review) => review.reviewer_id))];
  const reviewedPartyIds = [...new Set(reviewRows.map((review) => review.party_id))];
  const [{ data: reviewers }, { data: reviewedParties }] = await Promise.all([
    reviewerIds.length
      ? supabase.from("profiles").select("id, display_name, username").in("id", reviewerIds)
      : Promise.resolve({ data: [] }),
    reviewedPartyIds.length
      ? supabase.from("parties").select("id, title").in("id", reviewedPartyIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reviewerName = new Map(
    (reviewers ?? []).map((reviewer) => [
      reviewer.id,
      reviewer.display_name || reviewer.username || "En deltager",
    ]),
  );
  const partyTitle = new Map((reviewedParties ?? []).map((party) => [party.id, party.title]));

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
          <h3 className="text-sm font-semibold text-white">Private vurderinger</h3>
          <p className="mt-1 text-xs text-zinc-400">
            Kun du kan se kommentarer, du har modtaget efter en fest.
          </p>
          {reviewRows.length ? (
            <ul className="mt-3 space-y-2">
              {reviewRows.map((review) => (
                <li key={`${review.party_id}-${review.reviewer_id}`} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                  <p className="font-medium text-amber-200">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </p>
                  <p className="mt-1 text-zinc-200">
                    Fra {reviewerName.get(review.reviewer_id) ?? "en deltager"}
                    {partyTitle.get(review.party_id) ? ` · ${partyTitle.get(review.party_id)}` : ""}
                  </p>
                  {review.comment ? <p className="mt-2 whitespace-pre-wrap text-zinc-300">{review.comment}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-400">Du har ikke modtaget vurderinger endnu.</p>
          )}
        </div>

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

        {/* Marketplace mode only: hosts connect a payout account so their
            ticket money can be released to them after the party. */}
        {marketplace && stripeConfigured() ? (
          <div className="border-t border-white/10 pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Landmark size={16} className="text-amber-300" />
              Udbetalinger
            </h3>
            {payout?.charges_enabled ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-emerald-300">
                <ShieldCheck size={15} />
                Tilsluttet. Billetindtægter udbetales efter dine fester.
              </p>
            ) : (
              <form action={connectStripePayouts} className="mt-2 space-y-2">
                <p className="text-xs text-zinc-400">
                  {payout
                    ? "Din tilslutning er ikke færdig endnu. Fortsæt hos Stripe."
                    : "Tilslut en udbetalingskonto (Stripe), så din billetindtægt kan udbetales efter festen."}
                </p>
                <SubmitButton className="btn-secondary" pendingText="Åbner Stripe…">
                  {payout ? "Fortsæt tilslutning" : "Tilslut udbetalinger"}
                </SubmitButton>
              </form>
            )}
          </div>
        ) : null}
      </section>

      <section className="glass-card mt-6 space-y-3 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white">Slet konto</h2>
        <p className="text-sm text-zinc-300">
          Din konto skjules med det samme og slettes permanent efter 30 dage.
        </p>
        <DeleteAccountButton />
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
