"use client";

export type TimePoint = { day: string; count: number; label?: string };

/**
 * Dependency-free SVG time-series chart (line or area) with a numeric y-axis
 * and x labels. Responsive via a fixed viewBox + width:100%. The plot area uses
 * preserveAspectRatio="none" (so it stretches), so all text lives in HTML
 * outside the SVG to avoid distortion.
 */
export function TimeSeriesChart({
  data,
  mode = "area",
  height = 180,
}: {
  data: TimePoint[];
  mode?: "line" | "area";
  height?: number;
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
  const areaPath = points.length
    ? `M ${x(0)},${H - padY} L ${points.join(" L ")} L ${x(n - 1)},${H - padY} Z`
    : "";

  const ticks = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const yLabels = [maxY, Math.round(maxY / 2), 0];

  function xLabel(p?: TimePoint): string {
    if (!p) return "";
    return p.label ?? formatDay(p.day);
  }

  return (
    <div className="flex w-full gap-2">
      {/* y-axis */}
      <div
        className="flex w-6 shrink-0 flex-col justify-between text-right text-[10px] text-zinc-400"
        style={{ height: H }}
      >
        {yLabels.map((v, i) => (
          <span key={i}>{v}</span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          role="img"
          aria-label="Tidsserie"
        >
          <defs>
            <linearGradient id="pm-chart-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#FDE3A7" />
              <stop offset="50%" stopColor="#FCBE4F" />
              <stop offset="100%" stopColor="#E8972E" />
            </linearGradient>
            <linearGradient id="pm-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FCBE4F" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#FCBE4F" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines at 0 / 50% / 100% */}
          {[0, 0.5, 1].map((f) => {
            const gy = padY + f * (H - padY * 2);
            return (
              <line
                key={f}
                x1={padX}
                y1={gy}
                x2={W - padX}
                y2={gy}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

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
            <circle key={i} cx={x(i)} cy={y(d.count)} r="6" fill="transparent">
              <title>{`${xLabel(d)}: ${d.count}`}</title>
            </circle>
          ))}
        </svg>

        <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
          {ticks.map((t) => (
            <span key={t}>{xLabel(data[t])}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDay(day?: string): string {
  if (!day) return "";
  const [, m, d] = day.split("-");
  return d && m ? `${d}/${m}` : day;
}
