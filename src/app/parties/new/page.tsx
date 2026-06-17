import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { CreatePartyForm } from "@/components/parties/create-party-form";

type SearchParams = Promise<{ error?: string }>;

export default async function NewPartyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await searchParams;

  return (
    <main className="flex flex-1 flex-col px-5 py-5">
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
        <CreatePartyForm error={error} />
      </div>
    </main>
  );
}
