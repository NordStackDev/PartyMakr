import Link from "next/link";

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

type Party = {
  id: string;
  title: string;
  visibility: "public" | "private";
  starts_at: string;
  created_at: string;
  host_id: string;
};

export default async function AdminPartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePermission("parties");
  const { q = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const query = q.trim();

  const admin = createAdminClient();
  const from = (page - 1) * PAGE_SIZE;

  let builder = admin
    .from("parties")
    .select("id, title, visibility, starts_at, created_at, host_id", {
      count: "exact",
    })
    .order("created_at", { ascending: false });
  if (query) builder = builder.ilike("title", `%${query}%`);

  const { data, count } = await builder.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as Party[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: authData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Fester</h1>
      <SearchBox placeholder="Søg på titel…" defaultValue={q} />
      <p className="text-sm text-zinc-400">{total} fester</p>

      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <Link
              href={`/admin/parties/${p.id}`}
              className="glass-card flex items-center justify-between gap-3 rounded-2xl p-4 transition hover:bg-white/[0.07]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {p.title}
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      p.visibility === "public"
                        ? "bg-amber-400/15 text-amber-300"
                        : "bg-zinc-500/20 text-zinc-300"
                    }`}
                  >
                    {p.visibility === "public" ? "Offentlig" : "Privat"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Vært: {emailById.get(p.host_id) || p.host_id} · Starter{" "}
                  {formatDate(p.starts_at)}
                </p>
              </div>
              <span className="shrink-0 text-zinc-400">→</span>
            </Link>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="glass-card rounded-2xl p-4 text-sm text-zinc-400">
            Ingen fester fundet.
          </li>
        ) : null}
      </ul>

      <Pagination
        basePath="/admin/parties"
        page={page}
        pageCount={pageCount}
        query={{ q }}
      />
    </div>
  );
}
