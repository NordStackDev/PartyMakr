"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { PermissionKey } from "@/lib/admin/permissions";

const LINKS: { href: string; label: string; perm: PermissionKey }[] = [
  { href: "/admin", label: "Oversigt", perm: "overview" },
  { href: "/admin/users", label: "Brugere", perm: "users" },
  { href: "/admin/parties", label: "Fester", perm: "parties" },
  { href: "/admin/invites", label: "Invitationer", perm: "invites" },
  { href: "/admin/audit", label: "Aktivitetslog", perm: "audit" },
  { href: "/admin/team", label: "Admins", perm: "manage_admins" },
];

export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const links = LINKS.filter((l) => permissions.includes(l.perm));

  return (
    <nav className="flex gap-1 overflow-x-auto">
      {links.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-white/10 text-white"
                : "text-zinc-300 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
