export type BarDatum = { label: string; value: number; color?: string };

/**
 * Simple horizontal bar chart (server-renderable, no client JS). Used for the
 * invite funnel and RSVP breakdown.
 */
export function BarChart({ data }: { data: BarDatum[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-zinc-300">{d.label}</span>
            <span className="font-medium text-zinc-400">{d.value}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.value / max) * 100}%`,
                background:
                  d.color ??
                  "linear-gradient(90deg, #f472b6, #d946ef, #8b5cf6)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
