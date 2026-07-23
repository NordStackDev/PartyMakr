import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { updateParty } from "@/lib/parties/actions";
import { ticketPriceDkk } from "@/lib/stripe/client";
import { isMarketplace } from "@/lib/payments/mode";
import { PartyForm } from "@/components/parties/party-form";

type Party = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: "public" | "private";
  venue_type: "own_place" | "public_spot";
  capacity: number | null;
  entre_dkk: number | null;
  min_age: number | null;
  gender_target: string | null;
  lon: number;
  lat: number;
};

export default async function EditPartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase.rpc("get_party", { p_id: id });
  const party = ((rows ?? []) as Party[])[0];
  if (!party) notFound();
  if (party.host_id !== user.id) redirect(`/parties/${id}`);

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <Link
        href={`/parties/${id}`}
        className="text-sm text-zinc-300 hover:text-zinc-100"
      >
        ← Tilbage til festen
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Rediger fest
      </h1>
      <div className="mt-5">
        <PartyForm
          action={updateParty.bind(null, id)}
          defaults={{
            title: party.title,
            description: party.description,
            address: party.address,
            lat: party.lat,
            lng: party.lon,
            startsAt: party.starts_at,
            endsAt: party.ends_at,
            visibility: party.visibility,
            venueType: party.venue_type,
            capacity: party.capacity,
            entreDkk: party.entre_dkk,
            minAge: party.min_age,
            genderTarget: party.gender_target,
          }}
          submitLabel="Gem ændringer"
          pendingLabel="Gemmer…"
          ticketPriceDkk={ticketPriceDkk()}
          marketplace={isMarketplace()}
        />
      </div>
    </main>
  );
}
