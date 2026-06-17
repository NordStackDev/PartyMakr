"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronUp,
  LogOut,
  Map,
  Plus,
  Ticket,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth/actions";

/** Routes that belong to the consumer app shell — the tab bar shows only here. */
const CONSUMER_PREFIXES = ["/dashboard", "/parties", "/settings", "/notifications", "/friends"];

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

/** Extra destinations surfaced in the pull-up menu (beyond the core tabs). */
const MENU_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/friends", label: "Venner", icon: Users },
  { href: "/settings", label: "Profil & indstillinger", icon: User },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (pathname === tab.href) return true;
  return [tab.href, ...tab.match].some((p) => pathname.startsWith(`${p}/`));
}

export function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // On navigation: clear the messages badge and close the pull-up menu.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (pathname.startsWith("/notifications") && unread !== 0) setUnread(0);
    if (menuOpen) setMenuOpen(false);
  }

  // Accessible bottom sheet: trap Tab, close on Escape, focus the first item on
  // open and restore focus to the trigger on close.
  useEffect(() => {
    if (!menuOpen) return;
    restoreRef.current = document.activeElement as HTMLElement;
    const panel = sheetRef.current;
    const items = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled])',
          ),
        )
      : [];
    items[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      if (e.key !== "Tab" || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus?.();
    };
  }, [menuOpen]);

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
    <>
      <nav className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-2xl border-t border-white/10 bg-[#120d22]/50 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_16px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        {/* Pull-up handle — opens the menu */}
        <button
          type="button"
          aria-label="Åbn menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className="absolute -top-4 right-4 flex h-5 w-12 items-end justify-center rounded-t-xl border border-b-0 border-white/10 bg-[#120d22]/50 pb-0.5 text-zinc-300 backdrop-blur-xl transition before:absolute before:-inset-x-3 before:-top-3 before:bottom-0 before:content-[''] hover:text-white"
        >
          <ChevronUp size={16} strokeWidth={2.4} />
        </button>

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

      {/* Pull-up sheet. Rendered outside <nav> so its `fixed` anchors to the
          phone-frame card (not the bar, which has its own backdrop-filter). */}
      <div
        ref={sheetRef}
        aria-hidden={!menuOpen}
        className={`fixed inset-0 z-[1100] ${menuOpen ? "" : "pointer-events-none"}`}
      >
        <button
          type="button"
          aria-label="Luk menu"
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${
            menuOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={`absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-[var(--surface)] p-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out ${
            menuOpen ? "translate-y-0" : "translate-y-full"
          }`}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
          <nav className="flex flex-col gap-0.5">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-white/10 text-[#FCBE4F]"
                      : "text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <Icon size={20} />
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
    </>
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
