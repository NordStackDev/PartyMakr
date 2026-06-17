import { createClient } from "@/lib/supabase/server";
import { getPermissions } from "@/lib/admin/guard";
import { StatCard } from "@/components/admin/stat-card";
import { BarChart } from "@/components/admin/charts/bar-chart";
import { Donut } from "@/components/admin/charts/donut";
import {
  TimeSeriesChart,
  type TimePoint,
} from "@/components/admin/charts/time-series-chart";
import { LiveRegistrationsChart } from "@/components/admin/live-registrations-chart";

type Overview = {
  users_total: number;
  users_banned: number;
  parties_total: number;
  parties_public: number;
  parties_private: number;
  parties_active: number;
  parties_upcoming: number;
  invites_pending: number;
  invites_accepted: number;
  invites_declined: number;
  rsvps_total: number;
  rsvps_going: number;
  rsvps_interested: number;
  rsvps_maybe: number;
};

type DailyRow = { day: string; count: number | string };

function toSeries(rows: DailyRow[] | null): TimePoint[] {
  return (rows ?? []).map((r) => ({ day: r.day, count: Number(r.count) }));
}

export default async function AdminOverviewPage() {
  // The admin home is reachable by any admin; show overview only with the
  // 'overview' permission, otherwise a neutral placeholder (avoids redirect
  // loops for admins who only have other sections).
  const permissions = await getPermissions();
  if (!permissions.includes("overview")) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-zinc-400">
        Vælg en sektion i menuen ovenfor.
      </div>
    );
  }

  const supabase = await createClient();

  const [statsRes, regRes, partyRes] = await Promise.all([
    supabase.rpc("admin_overview_stats"),
    supabase.rpc("admin_registrations_daily", { days: 30 }),
    supabase.rpc("admin_party_creation_daily", { days: 30 }),
  ]);

  const s = (statsRes.data ?? {}) as Partial<Overview>;
  const stat = (n: number | undefined) => n ?? 0;

  const registrations = toSeries(regRes.data as DailyRow[] | null);
  const partyCreation = toSeries(partyRes.data as DailyRow[] | null);

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Oversigt</h1>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Brugere"
          value={stat(s.users_total)}
          hint={`${stat(s.users_banned)} blokeret`}
        />
        <StatCard
          label="Fester"
          value={stat(s.parties_total)}
          hint={`${stat(s.parties_active)} aktive nu`}
        />
        <StatCard label="Kommende fester" value={stat(s.parties_upcoming)} />
        <StatCard label="RSVP'er" value={stat(s.rsvps_total)} />
        <StatCard
          label="Invitationer afventer"
          value={stat(s.invites_pending)}
        />
        <StatCard
          label="Invitationer accepteret"
          value={stat(s.invites_accepted)}
        />
        <StatCard
          label="Invitationer afvist"
          value={stat(s.invites_declined)}
        />
        <StatCard
          label="Offentlige / private"
          value={`${stat(s.parties_public)} / ${stat(s.parties_private)}`}
        />
      </div>

      {/* Live registrations */}
      <LiveRegistrationsChart seed={registrations} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Party creation */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Oprettede fester (30 dage)
          </h2>
          <TimeSeriesChart data={partyCreation} mode="line" height={180} />
        </div>

        {/* Party visibility split */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Synlighed
          </h2>
          <Donut
            slices={[
              {
                label: "Offentlige",
                value: stat(s.parties_public),
                color: "#d946ef",
              },
              {
                label: "Private",
                value: stat(s.parties_private),
                color: "#8b5cf6",
              },
            ]}
          />
        </div>

        {/* Invite funnel */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Invitationer
          </h2>
          <BarChart
            data={[
              {
                label: "Afventer",
                value: stat(s.invites_pending),
                color: "#f59e0b",
              },
              {
                label: "Accepteret",
                value: stat(s.invites_accepted),
                color: "#10b981",
              },
              {
                label: "Afvist",
                value: stat(s.invites_declined),
                color: "#ef4444",
              },
            ]}
          />
        </div>

        {/* RSVP breakdown */}
        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            RSVP&apos;er
          </h2>
          <BarChart
            data={[
              { label: "Kommer", value: stat(s.rsvps_going) },
              { label: "Interesseret", value: stat(s.rsvps_interested) },
              { label: "Måske", value: stat(s.rsvps_maybe) },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
