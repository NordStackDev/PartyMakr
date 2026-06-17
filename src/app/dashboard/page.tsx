import Image from "next/image";
import Link from "next/link";

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
          <Image src="/pm-mark.png" alt="PartyMakr" width={36} height={36} />
          <span className="text-sm font-bold text-white">PartyMakr</span>
        </div>
        <div className="flex items-center gap-2">
          {admin ? (
            <Link
              href="/admin"
              className="rounded-full border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              Admin
            </Link>
          ) : null}
          <Link
            href="/parties/mine"
            className="rounded-full border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Mine fester
          </Link>
          <Link
            href="/parties/new"
            className="rounded-full bg-[#FCBE4F] px-2.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-[#fdca6b]"
          >
            + Opret
          </Link>
          <Link
            href="/settings"
            aria-label="Indstillinger"
            className="rounded-full border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            ⚙
          </Link>
        </div>
      </header>

      <div className="relative flex-1">
        <MapHome radiusKm={radiusKm} />
      </div>
    </main>
  );
}
