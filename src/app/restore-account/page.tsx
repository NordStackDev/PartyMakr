import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { restoreAccount } from "@/lib/profile/actions";
import { SubmitButton } from "@/components/submit-button";
import { Brand } from "@/components/brand";

export default async function RestoreAccountPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("deletion_requested_at")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.deletion_requested_at) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col justify-center px-6 py-12">
      <Brand tagline="Din konto venter på at blive slettet." />
      <section className="glass-card mx-auto mt-8 w-full max-w-sm space-y-4 rounded-2xl p-5">
        <h1 className="text-xl font-semibold tracking-tight text-white">Gendan konto?</h1>
        <p className="text-sm text-zinc-300">
          Du kan gendanne kontoen indtil 30 dage efter sletningsanmodningen.
          Aflyste fester, tilmeldinger, betalinger og dit profilbillede kommer
          ikke tilbage.
        </p>
        <form action={restoreAccount}>
          <SubmitButton className="btn-primary w-full" pendingText="Gendanner…">
            Gendan min konto
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
