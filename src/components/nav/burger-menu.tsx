"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { signOut } from "@/lib/auth/actions";

type Item = { href: string; label: string; icon: LucideIcon };

// Extra destinations beyond the bottom bar's core tabs.
const ITEMS: Item[] = [
  { href: "/friends", label: "Venner", icon: Users },
  { href: "/settings", label: "Profil & indstillinger", icon: User },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BurgerMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);

  // Close the sheet on navigation.
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <>
      {/* Trigger — sits next to the admin shield */}
      <button
        type="button"
        aria-label={open ? "Luk menu" : "Åbn menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-white/15 bg-[#15102a]/80 p-2 text-zinc-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-[#15102a]"
      >
        <Menu size={16} />
      </button>

      {/* Scrim + slide-up sheet. Fixed so it anchors to the phone-frame card
          (its backdrop-filter makes it the containing block) instead of this
          small top-right button cluster. */}
      <div
        className={`fixed inset-0 z-[1100] ${open ? "" : "pointer-events-none"}`}
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
