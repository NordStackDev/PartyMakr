import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { revokeInvite } from "@/lib/admin/actions";
import { ModerationButton } from "@/components/admin/moderation-button";
import { Pagination, PAGE_SIZE } from "@/components/admin/pagination";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Afventer",
  accepted: "Accepteret",
  declined: "Afvist",
};
const STATUSES = ["", "pending", "accepted", "declined"] as const;

type Invite = {
  party_id: string;
  invitee_id: string;
  status: string;
  invited_at: string;
};

export default async function AdminInvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { permissions } = await requirePermission("invites");
  const canModerate = permissions.includes("moderate");
  const { status = "", page: pageParam } = await searchParams;
  const activeStatus = (STATUSES as readonly string[]).includes(status)
    ? status
    : "";
  const page = Math.max(1, Number(pageParam) || 1);

  const admin = createAdminClient();
  const from = (page - 1) * PAGE_SIZE;

  let builder = admin
    .from("party_invites")
    .select("party_id, invitee_id, status, invited_at", { count: "exact" })
    .order("invited_at", { ascending: false });
  if (activeStatus) builder = builder.eq("status", activeStatus);

  const { data, count } = await builder.range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as Invite[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const partyIds = [...new Set(rows.map((i) => i.party_id))];

  const [{ data: parties }, authRes] = await Promise.all([
    partyIds.length
      ? admin.from("parties").select("id, title").in("id", partyIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const partyTitle = new Map((parties ?? []).map((p) => [p.id, p.title]));
  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Invitationer</h1>

      <form method="get" className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            name="status"
            value={s}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              activeStatus === s
                ? "bg-white/15 text-white"
                : "bg-white/5 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {s ? STATUS_LABEL[s] : "Alle"}
          </button>
        ))}
      </form>

      <p className="text-sm text-zinc-500">{total} invitationer</p>

      <ul className="space-y-2">
        {rows.map((i) => (
          <li
            key={`${i.party_id}:${i.invitee_id}`}
            className="glass-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {partyTitle.get(i.party_id) ?? "Ukendt fest"}
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                  {STATUS_LABEL[i.status] ?? i.status}
                </span>
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Inviteret: {emailById.get(i.invitee_id) || i.invitee_id} ·{" "}
                {formatDate(i.invited_at)}
              </p>
            </div>
            {canModerate ? (
              <ModerationButton
                action={revokeInvite.bind(null, i.party_id, i.invitee_id)}
                confirm="Tilbagekald denne invitation?"
                pendingText="Tilbagekalder…"
              >
                Tilbagekald
              </ModerationButton>
            ) : null}
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="glass-card rounded-2xl p-4 text-sm text-zinc-500">
            Ingen invitationer fundet.
          </li>
        ) : null}
      </ul>

      <Pagination
        basePath="/admin/invites"
        page={page}
        pageCount={pageCount}
        query={{ status: activeStatus }}
      />
    </div>
  );
}
