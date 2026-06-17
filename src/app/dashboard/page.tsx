import Image from "next/image";
import Link from "next/link";
import { Shield } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";
import { MapHome } from "@/components/map/map-home";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [admin, { data: profile }] = await Promise.all([
    isAdmin(),
    supabase
      .from("profiles")
      .select("search_radius_km")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);

  const radiusKm = profile?.search_radius_km ?? 25;

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Image src="/pm-mark.png" alt="PartyMakr" width={32} height={32} />
          <span className="text-sm font-bold text-white">PartyMakr</span>
        </div>
        {admin ? (
          <Link
            href="/admin"
            aria-label="Admin"
            className="rounded-full border border-white/15 p-2 text-zinc-200 transition hover:bg-white/5"
          >
            <Shield size={16} />
          </Link>
        ) : null}
      </header>

      <div className="relative flex-1">
        <MapHome radiusKm={radiusKm} />
      </div>
    </main>
  );
}
