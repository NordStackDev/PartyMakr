import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/admin/guard";
import { deleteParty } from "@/lib/admin/actions";
import { ModerationButton } from "@/components/admin/moderation-button";

function formatDate(value: string | null): string {
  if (!value) return "—";
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

export default async function AdminPartiesPage() {
  const { permissions } = await requirePermission("parties");
  const canModerate = permissions.includes("moderate");
  const supabase = await createClient();

  const { data: parties } = await supabase
    .from("parties")
    .select("id, title, visibility, starts_at, created_at, host_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (parties ?? []) as Party[];

  // Resolve host display names in one query.
  const hostIds = [...new Set(rows.map((p) => p.host_id))];
  const { data: hosts } = hostIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", hostIds)
    : { data: [] };
  const hostById = new Map(
    (hosts ?? []).map((h) => [h.id, h.display_name || h.username || h.id]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Fester</h1>
      <p className="text-sm text-zinc-500">{rows.length} fester</p>

      <ul className="space-y-2">
        {rows.map((p) => (
          <li
            key={p.id}
            className="glass-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {p.title}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    p.visibility === "public"
                      ? "bg-fuchsia-500/15 text-fuchsia-300"
                      : "bg-violet-500/15 text-violet-300"
                  }`}
                >
                  {p.visibility === "public" ? "Offentlig" : "Privat"}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Vært: {hostById.get(p.host_id)} · Starter{" "}
                {formatDate(p.starts_at)}
              </p>
            </div>
            {canModerate ? (
              <ModerationButton
                action={deleteParty.bind(null, p.id)}
                confirm="Slet denne fest permanent?"
                pendingText="Sletter…"
              >
                Slet
              </ModerationButton>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
