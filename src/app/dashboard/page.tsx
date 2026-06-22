import Image from "next/image";

import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";
import { getCurrentUser } from "@/lib/auth/user";
import { MapHome } from "@/components/map/map-home";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

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
    <main className="relative flex flex-1 flex-col">
      <div className="absolute inset-0">
        <MapHome radiusKm={radiusKm} admin={admin} />
      </div>

      {/* Logo floats over the map — no background bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex justify-center pt-1">
        <Image
          src="/pm-logo.png"
          alt="PartyMakr"
          width={720}
          height={466}
          priority
          sizes="160px"
          className="h-[67px] w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        />
      </div>

    </main>
  );
}
