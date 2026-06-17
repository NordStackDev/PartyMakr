import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { TimePoint } from "@/components/admin/charts/time-series-chart";

type Admin = ReturnType<typeof createAdminClient>;

export type ActivityItem = {
  kind: "signup" | "party" | "invite";
  at: string;
  label: string;
};

export type OverviewData = {
  usersTotal: number;
  usersBanned: number;
  users7d: number;
  partiesTotal: number;
  partiesPublic: number;
  partiesPrivate: number;
  partiesActive: number;
  partiesUpcoming: number;
  invitesTotal: number;
  invitesAccepted: number;
  invitesPending: number;
  invitesDeclined: number;
  acceptanceRate: number;
  rsvpsTotal: number;
  rsvpsGoing: number;
  rsvpsInterested: number;
  rsvpsMaybe: number;
  regSeries: TimePoint[];
  partySeries: TimePoint[];
  inviteSeries: TimePoint[];
  recent: ActivityItem[];
};

const DAY_MS = 86_400_000;

async function countRows(
  query: PromiseLike<{ count: number | null }>,
): Promise<number> {
  const { count } = await query;
  return count ?? 0;
}

/** Group rows by UTC day over the last `days` days (gap-filled with zeros). */
async function dailySeries(
  admin: Admin,
  table: string,
  dateCol: string,
  since: Date,
  days: number,
): Promise<TimePoint[]> {
  const { data } = await admin
    .from(table)
    .select(dateCol)
    .gte(dateCol, since.toISOString());

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * DAY_MS);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of (data ?? []) as unknown as Record<string, string>[]) {
    const day = new Date(row[dateCol]).toISOString().slice(0, 10);
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([day, count]) => ({ day, count }));
}

async function recentActivity(admin: Admin): Promise<ActivityItem[]> {
  const [signupsRes, partiesRes, invitesRes, authRes] = await Promise.all([
    admin
      .from("profiles")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("parties")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    admin
      .from("party_invites")
      .select("party_id, invitee_id, invited_at")
      .order("invited_at", { ascending: false })
      .limit(8),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const emailById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  const inviteRows = (invitesRes.data ?? []) as {
    party_id: string;
    invitee_id: string;
    invited_at: string;
  }[];
  const partyIds = [...new Set(inviteRows.map((i) => i.party_id))];
  const { data: invParties } = partyIds.length
    ? await admin.from("parties").select("id, title").in("id", partyIds)
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map(
    (invParties ?? []).map((p) => [p.id, p.title as string]),
  );

  const items: ActivityItem[] = [
    ...((signupsRes.data ?? []) as { id: string; created_at: string }[]).map(
      (r) => ({
        kind: "signup" as const,
        at: r.created_at,
        label: emailById.get(r.id) || r.id,
      }),
    ),
    ...(
      (partiesRes.data ?? []) as { title: string; created_at: string }[]
    ).map((r) => ({
      kind: "party" as const,
      at: r.created_at,
      label: r.title,
    })),
    ...inviteRows.map((r) => ({
      kind: "invite" as const,
      at: r.invited_at,
      label: `${emailById.get(r.invitee_id) || "bruger"} → «${
        titleById.get(r.party_id) ?? "fest"
      }»`,
    })),
  ];

  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items.slice(0, 12);
}

/**
 * Reads every metric straight from the tables with the service role (bypasses
 * RLS, so counts are global and real). No dependency on the admin RPC functions.
 */
export async function getOverviewData(): Promise<OverviewData> {
  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const days7Iso = new Date(now - 7 * DAY_MS).toISOString();
  const since30 = new Date(now - 29 * DAY_MS);
  since30.setUTCHours(0, 0, 0, 0);

  const sel = (table: string) =>
    admin.from(table).select("*", { count: "exact", head: true });

  const [
    usersTotal,
    usersBanned,
    users7d,
    partiesTotal,
    partiesPublic,
    partiesPrivate,
    partiesUpcoming,
    partiesActive,
    invitesTotal,
    invitesAccepted,
    invitesPending,
    invitesDeclined,
    rsvpsTotal,
    rsvpsGoing,
    rsvpsInterested,
    rsvpsMaybe,
  ] = await Promise.all([
    countRows(sel("profiles")),
    countRows(sel("profiles").not("banned_at", "is", null)),
    countRows(sel("profiles").gte("created_at", days7Iso)),
    countRows(sel("parties")),
    countRows(sel("parties").eq("visibility", "public")),
    countRows(sel("parties").eq("visibility", "private")),
    countRows(sel("parties").gt("starts_at", nowIso)),
    countRows(
      sel("parties")
        .lte("starts_at", nowIso)
        .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
    ),
    countRows(sel("party_invites")),
    countRows(sel("party_invites").eq("status", "accepted")),
    countRows(sel("party_invites").eq("status", "pending")),
    countRows(sel("party_invites").eq("status", "declined")),
    countRows(sel("party_attendees")),
    countRows(sel("party_attendees").eq("status", "going")),
    countRows(sel("party_attendees").eq("status", "interested")),
    countRows(sel("party_attendees").eq("status", "maybe")),
  ]);

  const [regSeries, partySeries, inviteSeries, recent] = await Promise.all([
    dailySeries(admin, "profiles", "created_at", since30, 30),
    dailySeries(admin, "parties", "created_at", since30, 30),
    dailySeries(admin, "party_invites", "invited_at", since30, 30),
    recentActivity(admin),
  ]);

  return {
    usersTotal,
    usersBanned,
    users7d,
    partiesTotal,
    partiesPublic,
    partiesPrivate,
    partiesActive,
    partiesUpcoming,
    invitesTotal,
    invitesAccepted,
    invitesPending,
    invitesDeclined,
    acceptanceRate: invitesTotal
      ? Math.round((invitesAccepted / invitesTotal) * 100)
      : 0,
    rsvpsTotal,
    rsvpsGoing,
    rsvpsInterested,
    rsvpsMaybe,
    regSeries,
    partySeries,
    inviteSeries,
    recent,
  };
}
