"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  LogOut,
  Map as MapIcon,
  Menu,
  Plus,
  Ticket,
  User,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth/actions";

/** Routes that belong to the consumer app — the menu shows only here. */
const CONSUMER_PREFIXES = [
  "/dashboard",
  "/parties",
  "/settings",
  "/notifications",
  "/friends",
];

type Item = { href: string; label: string; icon: LucideIcon; badge?: boolean };

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Kort", icon: MapIcon },
  { href: "/parties/mine", label: "Mine fester", icon: Ticket },
  { href: "/parties/new", label: "Opret fest", icon: Plus },
  { href: "/notifications", label: "Beskeder", icon: Bell, badge: true },
  { href: "/friends", label: "Venner", icon: Users },
  { href: "/settings", label: "Profil & indstillinger", icon: User },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FloatingMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [prevPath, setPrevPath] = useState(pathname);

  // On navigation: close the sheet, and clear the badge on the messages screen.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (open) setOpen(false);
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
        .channel(`menu-notif-${user.id}`)
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
    <>
      {/* Scrim + slide-up sheet */}
      <div
        className={`absolute inset-0 z-[1001] ${open ? "" : "pointer-events-none"}`}
      >
        <button
          type="button"
          aria-label="Luk menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[#15102a] p-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out ${
            open ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
          <nav className="flex flex-col gap-0.5">
            {ITEMS.map((item) => {
              const Icon = item.icon;
              const activeItem = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    activeItem
                      ? "bg-white/10 text-[#FCBE4F]"
                      : "text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <span className="relative">
                    <Icon size={20} />
                    {item.badge && unread > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    ) : null}
                  </span>
                  {item.label}
                </Link>
              );
            })}

            <form action={signOut} className="mt-1 border-t border-white/10 pt-1">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/5"
              >
                <LogOut size={20} />
                Log ud
              </button>
            </form>
          </nav>
        </div>
      </div>

      {/* Floating menu button */}
      <button
        type="button"
        aria-label={open ? "Luk menu" : "Åbn menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[1002] flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-[#120d22]/85 text-white shadow-lg shadow-black/40 backdrop-blur-xl transition active:scale-95"
      >
        {open ? <X size={24} /> : <Menu size={24} />}
        {!open && unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
    </>
  );
}
