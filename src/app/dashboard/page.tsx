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
      <header className="relative z-[1000] flex items-center justify-center rounded-b-2xl border-b border-white/10 bg-[#15102a] px-4 py-2.5 shadow-lg shadow-black/30">
        <Image
          src="/PM_final.svg"
          alt="PartyMakr"
          width={1280}
          height={720}
          priority
          unoptimized
          className="h-11 w-auto"
        />
        {admin ? (
          <Link
            href="/admin"
            aria-label="Admin"
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/15 p-2 text-zinc-200 transition hover:bg-white/5"
          >
            <Shield size={16} />
          </Link>
        ) : null}
      </header>

      <div className="relative -mt-5 flex-1">
        <MapHome radiusKm={radiusKm} />
      </div>
    </main>
  );
}
