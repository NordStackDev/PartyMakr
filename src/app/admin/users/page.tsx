import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { SearchBox } from "@/components/admin/search-box";
import { Pagination, PAGE_SIZE } from "@/components/admin/pagination";

function formatDate(value: string | null): string {
  if (!value) return "Ikke oplyst";
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

type UserRow = Profile & { email: string };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePermission("users");
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const query = q.trim().toLowerCase();

  const supabase = await createClient();
  const admin = createAdminClient();
  let rows: UserRow[];
  let total: number;

  if (query) {
    // Email lives in Supabase Auth, while names live in public.profiles. A
    // global admin search still needs both sets, but they can be fetched in
    // parallel and only run after an explicit search.
    const [{ data: profiles }, { data: authData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, display_name, created_at, banned_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const emailById = new Map(
      (authData?.users ?? []).map((user) => [
        user.id,
        (user.email ?? "").toLowerCase(),
      ]),
    );
    const matches = ((profiles ?? []) as Profile[])
      .filter(
        (profile) =>
          (emailById.get(profile.id) ?? "").includes(query) ||
          (profile.username ?? "").toLowerCase().includes(query) ||
          (profile.display_name ?? "").toLowerCase().includes(query),
      )
      .map((profile) => ({
        ...profile,
        email: emailById.get(profile.id) ?? "",
      }));
    total = matches.length;
    rows = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    // Normal browsing fetches one Auth page and resolves only those profiles,
    // replacing the former 1,000-user read on every visit.
    const { data: authData } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    const authUsers = authData?.users ?? [];
    const ids = authUsers.map((user) => user.id);
    const { data: profiles } = ids.length
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, created_at, banned_at")
          .in("id", ids)
      : { data: [] };
    const profileById = new Map(
      ((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile]),
    );
    rows = authUsers.map((user) => {
      const profile = profileById.get(user.id);
      return {
        id: user.id,
        email: (user.email ?? "").toLowerCase(),
        username: profile?.username ?? null,
        display_name: profile?.display_name ?? null,
        created_at: profile?.created_at ?? user.created_at,
        banned_at: profile?.banned_at ?? null,
      };
    });
    total = Number(
      authData && "total" in authData ? authData.total : rows.length,
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Brugere</h1>
      <SearchBox placeholder="Søg på e-mail eller navn…" defaultValue={q} />
      <p className="text-sm text-zinc-400">{total} brugere</p>

      <ul className="space-y-2">
        {rows.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-white/[0.07]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {u.email || u.display_name || u.username || u.id}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Oprettet {formatDate(u.created_at)}
                  {u.banned_at ? (
                    <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-red-300">
                      Blokeret
                    </span>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-zinc-400">→</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="glass-card rounded-2xl p-4 text-sm text-zinc-400">
            Ingen brugere fundet.
          </li>
        ) : null}
      </ul>

      <Pagination
        basePath="/admin/users"
        page={page}
        pageCount={pageCount}
        query={{ q }}
      />
    </div>
  );
}
