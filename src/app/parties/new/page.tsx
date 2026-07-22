import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createParty } from "@/lib/parties/actions";
import { verifyStartHref } from "@/lib/idura/client";
import { ageFromDob } from "@/lib/age";
import { PartyForm } from "@/components/parties/party-form";
import { VerifyAgeNotice } from "@/components/parties/verify-age-notice";
import { BackButton } from "@/components/back-button";

export default async function NewPartyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Creating a party requires MitID age verification (18+); charging an entré
  // additionally requires a connected Stripe payout account.
  const [{ data: ageRow }, { data: payout }] = await Promise.all([
    supabase
      .from("profile_age")
      .select("date_of_birth")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("host_payout_accounts")
      .select("charges_enabled")
      .eq("id", user.id)
      .maybeSingle(),
  ]);
  const verifiedAdult = ageRow?.date_of_birth
    ? ageFromDob(ageRow.date_of_birth) >= 18
    : false;
  const canCharge = Boolean(payout?.charges_enabled);

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <BackButton />
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Opret en fest
      </h1>
      <div className="mt-5">
        {verifiedAdult ? (
          <>
            {!canCharge ? (
              <p className="mb-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-400">
                Vil du tage entré for festen? Tilslut først udbetalinger under{" "}
                <a href="/settings" className="text-amber-300 hover:underline">
                  Indstillinger
                </a>
                , så gæsternes betaling går direkte til dig.
              </p>
            ) : null}
            <PartyForm
              action={createParty}
              submitLabel="Opret fest"
              pendingLabel="Opretter…"
            />
          </>
        ) : (
          <VerifyAgeNotice
            href={verifyStartHref()}
            message="For at oprette en fest skal du bekræfte med MitID, at du er 18+. Det tager under et minut."
          />
        )}
      </div>
    </main>
  );
}
