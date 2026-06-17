import { getPermissions } from "@/lib/admin/guard";
import { getOverviewData } from "@/lib/admin/stats";
import { StatCard } from "@/components/admin/stat-card";
import { BarChart } from "@/components/admin/charts/bar-chart";
import { Donut } from "@/components/admin/charts/donut";
import { TimeSeriesChart } from "@/components/admin/charts/time-series-chart";
import { LiveRegistrationsChart } from "@/components/admin/live-registrations-chart";
import { RecentActivity } from "@/components/admin/recent-activity";

export default async function AdminOverviewPage() {
  // Reachable by any admin; show the overview only with the 'overview'
  // permission (placeholder otherwise to avoid redirect loops).
  const permissions = await getPermissions();
  if (!permissions.includes("overview")) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-zinc-300">
        Vælg en sektion i menuen ovenfor.
      </div>
    );
  }

  let data;
  try {
    data = await getOverviewData();
  } catch {
    return (
      <div className="glass-card rounded-2xl p-8 text-center text-sm text-red-300">
        Kunne ikke hente data. Er <code>SUPABASE_SERVICE_ROLE_KEY</code> sat i
        miljøet?
      </div>
    );
  }

  const pct = (curr: number, prev: number): number | null => {
    if (!prev) return curr > 0 ? 100 : null;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-white">Oversigt</h1>

      {/* Growth & engagement */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Nye i dag"
          value={data.signupsToday}
          trend={pct(data.signupsToday, data.signupsYesterday)}
          hint={`i går: ${data.signupsYesterday}`}
        />
        <StatCard
          label="Nye (7 dage)"
          value={data.users7d}
          trend={pct(data.users7d, data.signupsPrev7d)}
          hint={`forrige uge: ${data.signupsPrev7d}`}
        />
        <StatCard
          label="Aktive (7 dage)"
          value={data.activeUsers7d}
          hint="loggede ind"
        />
        <StatCard
          label="Accept-rate"
          value={`${data.acceptanceRate}%`}
          hint="invitationer"
        />
      </div>

      {/* Key metrics — all real, read straight from the tables */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Konti i alt"
          value={data.usersTotal}
          hint={`+${data.users7d} sidste 7 dage`}
        />
        <StatCard
          label="Fester i alt"
          value={data.partiesTotal}
          hint={`${data.partiesActive} aktive nu`}
        />
        <StatCard
          label="Invitationer"
          value={data.invitesTotal}
          hint={`${data.acceptanceRate}% accepteret`}
        />
        <StatCard label="RSVP'er" value={data.rsvpsTotal} />
        <StatCard label="Kommende fester" value={data.partiesUpcoming} />
        <StatCard label="Accepteret" value={data.invitesAccepted} />
        <StatCard label="Afventer svar" value={data.invitesPending} />
        <StatCard label="Blokerede konti" value={data.usersBanned} />
      </div>

      {/* Live registrations */}
      <LiveRegistrationsChart series={data.reg} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Oprettede fester (30 dage)
          </h2>
          <TimeSeriesChart data={data.partySeries} mode="line" height={180} />
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Invitationer sendt (30 dage)
          </h2>
          <TimeSeriesChart data={data.inviteSeries} mode="area" height={180} />
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Invitations-status
          </h2>
          <BarChart
            data={[
              {
                label: "Afventer",
                value: data.invitesPending,
                color: "#f59e0b",
              },
              {
                label: "Accepteret",
                value: data.invitesAccepted,
                color: "#10b981",
              },
              {
                label: "Afvist",
                value: data.invitesDeclined,
                color: "#ef4444",
              },
            ]}
          />
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">Synlighed</h2>
          <Donut
            slices={[
              {
                label: "Offentlige",
                value: data.partiesPublic,
                color: "#FCBE4F",
              },
              {
                label: "Private",
                value: data.partiesPrivate,
                color: "#9ca3af",
              },
            ]}
          />
        </div>

        <div className="glass-card rounded-2xl p-5">
          <h2 className="mb-3 text-sm font-semibold text-white">
            RSVP&apos;er
          </h2>
          <BarChart
            data={[
              { label: "Kommer", value: data.rsvpsGoing },
              { label: "Interesseret", value: data.rsvpsInterested },
              { label: "Måske", value: data.rsvpsMaybe },
            ]}
          />
        </div>

        <RecentActivity items={data.recent} />
      </div>
    </div>
  );
}
