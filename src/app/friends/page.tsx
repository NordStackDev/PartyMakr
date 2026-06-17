import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <h1 className="text-xl font-semibold tracking-tight text-white">Venner</h1>

      <div className="glass-card mt-6 flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
        <Users size={28} className="text-amber-300" />
        <p className="text-sm font-medium text-zinc-200">Venner kommer snart</p>
        <p className="text-sm text-zinc-400">
          Her kommer du til at kunne tilføje venner, se hvem der er med til
          festerne, og invitere dem direkte.
        </p>
      </div>
    </main>
  );
}
