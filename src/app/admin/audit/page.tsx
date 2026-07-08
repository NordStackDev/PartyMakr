import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { permissionLabel } from "@/lib/admin/permissions";
import { Pagination, PAGE_SIZE } from "@/components/admin/pagination";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ACTION_LABEL: Record<string, string> = {
  delete_party: "Slettede fest",
  update_party: "Redigerede fest",
  revoke_invite: "Tilbagekaldte invitation",
  ban_user: "Udelukkede bruger",
  unban_user: "Ophævede udelukkelse",
  verify_user: "Verificerede bruger",
  unverify_user: "Fjernede verificering",
  delete_user: "Slettede bruger",
  update_profile: "Opdaterede profil",
  send_password_reset: "Sendte nulstillingsmail",
  resend_confirmation: "Gensendte bekræftelse",
  add_admin: "Tilføjede admin",
  update_admin: "Opdaterede admin-tilladelser",
  remove_admin: "Fjernede admin",
};

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
    case "verify_user":
      return `${actor} verificerede ${who} som person`;
    case "unverify_user":
      return `${actor} fjernede verificeringen af ${who}`;
    case "update_profile":
      return `${actor} opdaterede profilen for ${who}`;
    case "send_password_reset":
      return `${actor} sendte en nulstillingsmail til ${who}`;
    case "resend_confirmation":
      return `${actor} gensendte bekræftelsesmailen til ${who}`;
    case "delete_party":
      return `${actor} slettede festen «${m.title ?? "ukendt"}»`;
    case "update_party":
      return `${actor} redigerede festen «${m.title ?? "ukendt"}»`;
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
    default:
      return `${actor}: ${r.action}`;
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    actor?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  await requirePermission("audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  const admin = createAdminClient();

  let builder = supabase
    .from("admin_audit_log")
    .select(
      "id, actor_id, action, target_type, target_id, metadata, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });

  if (sp.action) builder = builder.eq("action", sp.action);
  if (sp.actor) builder = builder.eq("actor_id", sp.actor);
  if (sp.from) builder = builder.gte("created_at", `${sp.from}T00:00:00.000Z`);
  if (sp.to) builder = builder.lte("created_at", `${sp.to}T23:59:59.999Z`);

  const { data: log, count } = await builder.range(from, from + PAGE_SIZE - 1);
  const rows = (log ?? []) as AuditRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Emails + the admin list (actor dropdown).
  const [{ data: admins }, authRes] = await Promise.all([
    admin.from("admin_users").select("user_id"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const adminIds = (admins ?? []).map((a) => a.user_id as string);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Aktivitetslog</h1>

      <form
        method="get"
        className="glass-card grid grid-cols-1 gap-3 rounded-2xl p-4 @sm:grid-cols-2"
      >
        <label className="block">
          <span className="auth-label text-xs">Handling</span>
          <select name="action" defaultValue={sp.action ?? ""} className="auth-input">
            <option value="">Alle</option>
            {Object.entries(ACTION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="auth-label text-xs">Admin</span>
          <select name="actor" defaultValue={sp.actor ?? ""} className="auth-input">
            <option value="">Alle</option>
            {adminIds.map((id) => (
              <option key={id} value={id}>
                {emailById.get(id) || id}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="auth-label text-xs">Fra</span>
          <input
            type="date"
            name="from"
            defaultValue={sp.from ?? ""}
            className="auth-input"
          />
        </label>
        <label className="block">
          <span className="auth-label text-xs">Til</span>
          <input
            type="date"
            name="to"
            defaultValue={sp.to ?? ""}
            className="auth-input"
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary">
            Filtrér
          </button>
          <Link
            href="/admin/audit"
            className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Ryd
          </Link>
        </div>
      </form>

      <p className="text-sm text-zinc-400">{total} handlinger</p>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="glass-card flex items-baseline justify-between gap-3 rounded-2xl p-4"
          >
            <p className="text-sm text-zinc-100">{describe(r, emailById)}</p>
            <span className="shrink-0 text-xs text-zinc-400">
              {formatDate(r.created_at)}
            </span>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="glass-card rounded-2xl p-4 text-sm text-zinc-400">
            Ingen handlinger fundet.
          </li>
        ) : null}
      </ul>

      <Pagination
        basePath="/admin/audit"
        page={page}
        pageCount={pageCount}
        query={{
          action: sp.action,
          actor: sp.actor,
          from: sp.from,
          to: sp.to,
        }}
      />
    </div>
  );
}
