"use client";

export type TimePoint = { day: string; count: number };

/**
 * Dependency-free SVG time-series chart (line or area). Responsive via a fixed
 * viewBox + width:100% — no DOM measuring needed. Neon gradient matching the
 * brand. Hover a point to see its value via the native <title> tooltip.
 */
export function TimeSeriesChart({
  data,
  mode = "area",
  height = 180,
  label,
}: {
  data: TimePoint[];
  mode?: "line" | "area";
  height?: number;
  label?: string;
}) {
  const W = 600;
  const H = height;
  const padX = 8;
  const padY = 12;

  const n = data.length;
  const maxY = Math.max(1, ...data.map((d) => d.count));

  const x = (i: number) =>
    n <= 1 ? padX : padX + (i / (n - 1)) * (W - padX * 2);
  const y = (v: number) => H - padY - (v / maxY) * (H - padY * 2);

  const points = data.map((d, i) => `${x(i)},${y(d.count)}`);
  const linePath = points.length ? `M ${points.join(" L ")}` : "";
  const areaPath =
    points.length > 0
      ? `M ${x(0)},${H - padY} L ${points.join(" L ")} L ${x(n - 1)},${H - padY} Z`
      : "";

  // A few evenly spaced x labels (first, middle, last) to avoid clutter.
  const ticks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="w-full">
      {label ? (
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-zinc-300">{label}</span>
          <span className="text-xs text-zinc-500">{total} i alt</span>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={label ?? "Tidsserie"}
      >
        <defs>
          <linearGradient id="pm-chart-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f472b6" />
            <stop offset="50%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="pm-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d946ef" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d946ef" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1={padX}
          y1={H - padY}
          x2={W - padX}
          y2={H - padY}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />

        {mode === "area" && areaPath ? (
          <path d={areaPath} fill="url(#pm-chart-fill)" />
        ) : null}

        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke="url(#pm-chart-stroke)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {data.map((d, i) => (
          <circle key={d.day} cx={x(i)} cy={y(d.count)} r="6" fill="transparent">
            <title>
              {d.day}: {d.count}
            </title>
          </circle>
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        {ticks.map((t) => (
          <span key={t}>{formatDay(data[t]?.day)}</span>
        ))}
      </div>
    </div>
  );
}

function formatDay(day?: string): string {
  if (!day) return "";
  // day is an ISO date (YYYY-MM-DD); show DD/MM.
  const [, m, d] = day.split("-");
  return d && m ? `${d}/${m}` : day;
}
