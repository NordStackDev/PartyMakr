import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/guard";
import { revokeInvite } from "@/lib/admin/actions";
import { ModerationButton } from "@/components/admin/moderation-button";

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

type Invite = {
  party_id: string;
  invitee_id: string;
  status: string;
  invited_at: string;
};

export default async function AdminInvitesPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: invites } = await supabase
    .from("party_invites")
    .select("party_id, invitee_id, status, invited_at")
    .order("invited_at", { ascending: false })
    .limit(200);

  const rows = (invites ?? []) as Invite[];

  const partyIds = [...new Set(rows.map((i) => i.party_id))];
  const inviteeIds = [...new Set(rows.map((i) => i.invitee_id))];

  const [partiesRes, inviteesRes] = await Promise.all([
    partyIds.length
      ? supabase.from("parties").select("id, title").in("id", partyIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    inviteeIds.length
      ? supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", inviteeIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            display_name: string | null;
            username: string | null;
          }[],
        }),
  ]);

  const partyTitle = new Map(
    (partiesRes.data ?? []).map((p) => [p.id, p.title]),
  );
  const inviteeName = new Map(
    (inviteesRes.data ?? []).map((p) => [
      p.id,
      p.display_name || p.username || p.id,
    ]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-white">Invitationer</h1>
      <p className="text-sm text-zinc-500">{rows.length} invitationer</p>

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
                Inviteret: {inviteeName.get(i.invitee_id)} ·{" "}
                {formatDate(i.invited_at)}
              </p>
            </div>
            <ModerationButton
              action={revokeInvite.bind(null, i.party_id, i.invitee_id)}
              confirm="Tilbagekald denne invitation?"
              pendingText="Tilbagekalder…"
            >
              Tilbagekald
            </ModerationButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
