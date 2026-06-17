import Link from "next/link";
import Image from "next/image";

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
    // Break out of the consumer phone-frame: a full-viewport admin surface.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#0a0510] text-zinc-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/pm-mark.png" alt="PartyMakr" width={84} height={84} />
            <div>
              <p className="text-base font-bold leading-none text-white">
                PartyMakr
              </p>
              <p className="mt-1 text-xs text-zinc-400">Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-300 hover:text-zinc-200"
            >
              Tilbage til app
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
              >
                Log ud
              </button>
            </form>
          </div>
        </header>

        <div className="mt-4">
          <AdminNav permissions={permissions} />
        </div>

        <main className="mt-6 pb-12">{children}</main>
      </div>
    </div>
  );
}
