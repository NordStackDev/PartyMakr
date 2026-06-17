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

const ACTION_LABEL: Record<string, string> = {
  delete_party: "Slettede fest",
  revoke_invite: "Tilbagekaldte invitation",
  ban_user: "Udelukkede bruger",
  unban_user: "Ophævede udelukkelse",
  delete_user: "Slettede bruger",
  add_admin: "Tilføjede admin",
  update_admin: "Opdaterede admin-tilladelser",
  remove_admin: "Fjernede admin",
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  created_at: string;
};

export default async function AdminAuditPage() {
  await requirePermission("audit");
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, target_type, target_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (log ?? []) as AuditRow[];

  const admin = createAdminClient();
  const { data: authData } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailById = new Map(
    (authData?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Aktivitetslog</h1>
      <p className="text-sm text-zinc-500">
        Seneste {rows.length} admin-handlinger
      </p>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium text-white">
                {ACTION_LABEL[r.action] ?? r.action}
              </p>
              <span className="shrink-0 text-xs text-zinc-500">
                {formatDate(r.created_at)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Af {(r.actor_id && emailById.get(r.actor_id)) || r.actor_id || "—"}
              {r.target_id ? ` · mål: ${r.target_id}` : ""}
            </p>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="glass-card rounded-2xl p-4 text-sm text-zinc-500">
            Ingen handlinger endnu.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
