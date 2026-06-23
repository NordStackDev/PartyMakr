import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createParty } from "@/lib/parties/actions";
import { PartyForm } from "@/components/parties/party-form";

export default async function NewPartyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-300 hover:text-zinc-100"
      >
        ← Kort
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Opret en fest
      </h1>
      <div className="mt-5">
        <PartyForm
          action={createParty}
          submitLabel="Opret fest"
          pendingLabel="Opretter…"
        />
      </div>
    </main>
  );
}
