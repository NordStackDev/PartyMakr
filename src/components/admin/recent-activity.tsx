import type { ActivityItem } from "@/lib/admin/stats";

const KIND = {
  signup: { label: "Ny konto", dot: "bg-emerald-400" },
  party: { label: "Ny fest", dot: "bg-amber-400" },
  invite: { label: "Invitation", dot: "bg-orange-400" },
} as const;

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <h2 className="mb-3 text-sm font-semibold text-white">Seneste aktivitet</h2>
      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">Ingen aktivitet endnu.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, i) => {
            const k = KIND[item.kind];
            return (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${k.dot}`} />
                <span className="shrink-0 text-xs font-medium text-zinc-300">
                  {k.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-zinc-200">
                  {item.label}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {timeAgo(item.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
