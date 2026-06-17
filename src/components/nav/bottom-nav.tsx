"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Map, Plus, Ticket, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";

/** Routes that belong to the consumer app shell — the tab bar shows only here. */
const CONSUMER_PREFIXES = ["/dashboard", "/parties", "/settings", "/notifications"];

type Tab = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Active when the path starts with one of these (besides `href`). */
  match: string[];
};

const TABS: Tab[] = [
  { href: "/dashboard", label: "Kort", icon: Map, match: [] },
  { href: "/parties/mine", label: "Mine", icon: Ticket, match: [] },
  { href: "/notifications", label: "Beskeder", icon: Bell, match: [] },
  { href: "/settings", label: "Profil", icon: User, match: [] },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (pathname === tab.href) return true;
  return [tab.href, ...tab.match].some((p) => pathname.startsWith(`${p}/`));
}

export function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [prevPath, setPrevPath] = useState(pathname);

  // Clear the badge as soon as the user lands on the notifications screen
  // (that page marks the rows read). Render-phase reset — no effect needed.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (pathname.startsWith("/notifications") && unread !== 0) setUnread(0);
  }

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("read", false);
      if (active) setUnread(count ?? 0);

      channel = supabase
        .channel(`nav-notif-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => setUnread((c) => c + 1),
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const visible = CONSUMER_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!visible) return null;

  return (
    <nav className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-2xl border-t border-white/10 bg-[#120d22]/80 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_16px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="relative flex items-stretch justify-around px-2">
        {TABS.slice(0, 2).map((tab) => (
          <TabLink
            key={tab.href}
            tab={tab}
            active={isActive(pathname, tab)}
            badge={tab.label === "Beskeder" ? unread : 0}
          />
        ))}

        {/* Central "Opret" action — a gold button seated inside the bar */}
        <Link
          href="/parties/new"
          aria-label="Opret fest"
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FCBE4F] text-zinc-950 shadow-md shadow-amber-500/30 transition active:brightness-95">
            <Plus size={22} strokeWidth={2.6} />
          </span>
          <span className="text-[10px] font-semibold text-amber-300">Opret</span>
        </Link>

        {TABS.slice(2).map((tab) => (
          <TabLink
            key={tab.href}
            tab={tab}
            active={isActive(pathname, tab)}
            badge={tab.label === "Beskeder" ? unread : 0}
          />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  tab,
  active,
  badge,
}: {
  tab: Tab;
  active: boolean;
  badge: number;
}) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 transition ${
        active ? "text-[#FCBE4F]" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      <span className="relative">
        <Icon size={22} strokeWidth={active ? 2.4 : 2} />
        {badge > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[10px] font-semibold">{tab.label}</span>
    </Link>
  );
}
