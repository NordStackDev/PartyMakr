import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { permissionLabel } from "@/lib/admin/permissions";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type AuditMeta = {
  email?: string;
  title?: string;
  party_title?: string;
  invitee?: string;
  permissions?: string[];
};

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: AuditMeta | null;
  created_at: string;
};

/**
 * A full Danish sentence describing who did what to whom. Always names the
 * affected user/entity (from the label captured at write time, falling back to
 * a live email lookup) and the acting admin.
 */
function describe(r: AuditRow, emailById: Map<string, string>): string {
  const actor = (r.actor_id && emailById.get(r.actor_id)) || "En admin";
  const m = r.metadata ?? {};
  const who =
    m.email ||
    (r.target_type === "user" && r.target_id
      ? emailById.get(r.target_id)
      : null) ||
    "en bruger";
  const perms =
    (m.permissions ?? []).map(permissionLabel).join(", ") || "ingen";

  switch (r.action) {
    case "delete_user":
      return `${actor} slettede brugeren ${who}`;
    case "ban_user":
      return `${actor} udelukkede ${who}`;
    case "unban_user":
      return `${actor} ophævede udelukkelsen af ${who}`;
    case "delete_party":
      return `${actor} slettede festen «${m.title ?? "ukendt"}»`;
    case "revoke_invite":
      return `${actor} tilbagekaldte invitationen${
        m.invitee ? ` til ${m.invitee}` : ""
      }${m.party_title ? ` for «${m.party_title}»` : ""}`;
    case "add_admin":
      return `${actor} tilføjede ${who} som admin (${perms})`;
    case "update_admin":
      return `${actor} ændrede ${who}'s tilladelser til: ${perms}`;
    case "remove_admin":
      return `${actor} fjernede admin-adgang for ${who}`;
    case "update_profile":
      return `${actor} opdaterede profilen for ${who}`;
    case "send_password_reset":
      return `${actor} sendte en nulstillingsmail til ${who}`;
    case "resend_confirmation":
      return `${actor} gensendte bekræftelsesmailen til ${who}`;
    default:
      return `${actor}: ${r.action}`;
  }
}

export default async function AdminAuditPage() {
  await requirePermission("audit");
  const supabase = await createClient();

  const { data: log } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, target_type, target_id, metadata, created_at")
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
          <li
            key={r.id}
            className="glass-card flex items-baseline justify-between gap-3 rounded-2xl p-4"
          >
            <p className="text-sm text-zinc-100">{describe(r, emailById)}</p>
            <span className="shrink-0 text-xs text-zinc-500">
              {formatDate(r.created_at)}
            </span>
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
