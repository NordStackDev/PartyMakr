import Link from "next/link";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";
import { revokeInvite } from "@/lib/admin/actions";
import { PartyEditor } from "@/components/admin/party-editor";
import { ModerationButton } from "@/components/admin/moderation-button";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const INVITE_STATUS: Record<string, string> = {
  pending: "Afventer",
  accepted: "Accepteret",
  declined: "Afvist",
};
const RSVP_STATUS: Record<string, string> = {
  going: "Kommer",
  interested: "Interesseret",
  maybe: "Måske",
};

type Party = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address: string | null;
  visibility: "public" | "private";
  capacity: number | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export default async function AdminPartyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { permissions } = await requirePermission("parties");
  const canModerate = permissions.includes("moderate");

  const admin = createAdminClient();

  const [{ data: party }, { data: attendees }, { data: invites }, authRes] =
    await Promise.all([
      admin
        .from("parties")
        .select(
          "id, host_id, title, description, address, visibility, capacity, starts_at, ends_at, created_at",
        )
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("party_attendees")
        .select("user_id, status, rsvp_at")
        .eq("party_id", id)
        .order("rsvp_at", { ascending: false }),
      admin
        .from("party_invites")
        .select("invitee_id, status, invited_at")
        .eq("party_id", id)
        .order("invited_at", { ascending: false }),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  if (!party) notFound();
  const p = party as Party;

  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const attendeeRows = (attendees ?? []) as {
    user_id: string;
    status: string;
    rsvp_at: string;
  }[];
  const inviteRows = (invites ?? []) as {
    invitee_id: string;
    status: string;
    invited_at: string;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/parties"
          className="text-sm text-zinc-300 hover:text-zinc-200"
        >
          ← Fester
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-white">{p.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span>Vært: {emailById.get(p.host_id) || p.host_id}</span>
          <span>· Starter {formatDate(p.starts_at)}</span>
          {p.ends_at ? <span>· Slutter {formatDate(p.ends_at)}</span> : null}
          <span
            className={`rounded-full px-2 py-0.5 ${
              p.visibility === "public"
                ? "bg-amber-400/15 text-amber-300"
                : "bg-zinc-500/20 text-zinc-300"
            }`}
          >
            {p.visibility === "public" ? "Offentlig" : "Privat"}
          </span>
        </p>
      </div>

      <PartyEditor
        partyId={p.id}
        canModerate={canModerate}
        initial={{
          title: p.title,
          description: p.description ?? "",
          address: p.address ?? "",
          visibility: p.visibility,
          capacity: p.capacity != null ? String(p.capacity) : "",
        }}
      />

      <section className="glass-card rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">
          Deltagere ({attendeeRows.length})
        </h2>
        {attendeeRows.length === 0 ? (
          <p className="text-sm text-zinc-400">Ingen RSVP&apos;er endnu.</p>
        ) : (
          <ul className="space-y-1.5">
            {attendeeRows.map((a) => (
              <li
                key={a.user_id}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-zinc-200">
                  {emailById.get(a.user_id) || a.user_id}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {RSVP_STATUS[a.status] ?? a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">
          Invitationer ({inviteRows.length})
        </h2>
        {inviteRows.length === 0 ? (
          <p className="text-sm text-zinc-400">Ingen invitationer.</p>
        ) : (
          <ul className="space-y-2">
            {inviteRows.map((i) => (
              <li
                key={i.invitee_id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-zinc-200">
                  {emailById.get(i.invitee_id) || i.invitee_id}
                  <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-300">
                    {INVITE_STATUS[i.status] ?? i.status}
                  </span>
                </span>
                {canModerate ? (
                  <ModerationButton
                    action={revokeInvite.bind(null, p.id, i.invitee_id)}
                    confirm="Tilbagekald denne invitation?"
                    pendingText="Tilbagekalder…"
                  >
                    Tilbagekald
                  </ModerationButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
