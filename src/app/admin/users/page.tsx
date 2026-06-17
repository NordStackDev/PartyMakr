import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  created_at: string;
  banned_at: string | null;
};

export default async function AdminUsersPage() {
  await requirePermission("users");
  const supabase = await createClient();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, created_at, banned_at")
    .order("created_at", { ascending: false })
    .limit(500);

  // Emails live in auth.users — fetch via the Admin API (server-only).
  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const rows = (profiles ?? []) as Profile[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Brugere</h1>
      <p className="text-sm text-zinc-500">{rows.length} brugere</p>

      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-white/[0.07]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {emailById.get(u.id) || u.display_name || u.username || u.id}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Oprettet {formatDate(u.created_at)}
                  {u.banned_at ? (
                    <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
                      Blokeret
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-zinc-500">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
