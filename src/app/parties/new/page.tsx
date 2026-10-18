import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { createParty } from "@/lib/parties/actions";
import { ticketPriceDkk } from "@/lib/stripe/client";
import { isMarketplace } from "@/lib/payments/mode";
import { verifyStartHref } from "@/lib/idura/client";
import { ageFromDob } from "@/lib/age";
import { PartyForm } from "@/components/parties/party-form";
import { VerifyAgeNotice } from "@/components/parties/verify-age-notice";
import { BackButton } from "@/components/back-button";

export default async function NewPartyPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Creating a party requires MitID age verification (18+).
  const { data: ageRow } = await supabase
    .from("profile_age")
    .select("date_of_birth")
    .eq("id", user.id)
    .maybeSingle();
  const verifiedAdult = ageRow?.date_of_birth
    ? ageFromDob(ageRow.date_of_birth) >= 18
    : false;

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <BackButton />
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Opret en fest
      </h1>
      <div className="mt-5">
        {verifiedAdult ? (
          <PartyForm
            action={createParty}
            submitLabel="Opret fest"
            pendingLabel="Opretter…"
            ticketPriceDkk={ticketPriceDkk()}
            marketplace={isMarketplace()}
            strictCreate
          />
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
