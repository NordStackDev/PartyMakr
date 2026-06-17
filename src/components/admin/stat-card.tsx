export function StatCard({
  label,
  value,
  hint,
  trend,
}: {
  label: string;
  value: number | string;
  hint?: string;
  /** Percent change vs a prior period; null hides it. */
  trend?: number | null;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-300">
        {label}
      </p>
      <div className="mt-1 flex min-w-0 items-baseline gap-2">
        <p className="truncate text-2xl font-bold text-white">{value}</p>
        {trend != null ? (
          <span
            className={`text-xs font-semibold ${
              trend >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-xs text-zinc-400">{hint}</p> : null}
    </div>
  );
}
