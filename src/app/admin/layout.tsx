import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

import { requireAdmin, getPermissions } from "@/lib/admin/guard";
import { signOut } from "@/lib/auth/actions";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Authoritative gate. Every admin server action re-checks independently.
  await requireAdmin();
  const permissions = await getPermissions();

  return (
    // Admin lives inside the phone-frame (container query: @admin), fluid down
    // to 320px. The consumer bottom bar self-hides on /admin.
    <div className="@container/admin flex flex-1 flex-col px-4 py-5 pb-10 text-zinc-100">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <Image
            src="/pm-mark.png"
            alt=""
            width={72}
            height={72}
            className="h-9 w-9 shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-none text-white">
              PartyMakr
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">Admin</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard"
            aria-label="Tilbage til app"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-zinc-200 transition hover:bg-white/5"
          >
            <ArrowLeft size={18} />
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              Log ud
            </button>
          </form>
        </div>
      </header>

      <div className="mt-4">
        <AdminNav permissions={permissions} />
      </div>

      <main className="mt-5 flex-1">{children}</main>
    </div>
  );
}
