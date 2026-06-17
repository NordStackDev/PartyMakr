import Image from "next/image";
import Link from "next/link";
import { Shield } from "lucide-react";

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
        <MapHome radiusKm={radiusKm} />
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
          className="h-24 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        />
      </div>

      {admin ? (
        <Link
          href="/admin"
          aria-label="Admin"
          className="absolute right-4 top-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[#15102a]/80 text-zinc-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-[#15102a]"
        >
          <Shield size={16} />
        </Link>
      ) : null}
    </main>
  );
}
