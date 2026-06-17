import Image from "next/image";
import Link from "next/link";
import { Plus, Settings, Ticket, Shield } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin/guard";
import { MapHome } from "@/components/map/map-home";
import { NotificationBell } from "@/components/notifications/notification-bell";

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
        <div className="flex items-center gap-1.5">
          {user ? <NotificationBell userId={user.id} /> : null}
          {admin ? (
            <Link
              href="/admin"
              aria-label="Admin"
              className="rounded-full border border-white/15 p-2 text-zinc-200 transition hover:bg-white/5"
            >
              <Shield size={16} />
            </Link>
          ) : null}
          <Link
            href="/parties/mine"
            aria-label="Mine fester"
            className="rounded-full border border-white/15 p-2 text-zinc-200 transition hover:bg-white/5"
          >
            <Ticket size={16} />
          </Link>
          <Link
            href="/parties/new"
            className="inline-flex items-center gap-1 rounded-full bg-[#FCBE4F] px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-[#fdca6b]"
          >
            <Plus size={15} /> Opret
          </Link>
          <Link
            href="/settings"
            aria-label="Indstillinger"
            className="rounded-full border border-white/15 p-2 text-zinc-200 transition hover:bg-white/5"
          >
            <Settings size={16} />
          </Link>
        </div>
      </header>

      <div className="relative flex-1">
        <MapHome radiusKm={radiusKm} />
      </div>
    </main>
  );
}
