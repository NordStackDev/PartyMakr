export type DonutSlice = { label: string; value: number; color: string };

/**
 * Donut chart drawn with stacked stroke-dasharray arcs on concentric circles.
 * Server-renderable. Used for the public/private party split.
 */
export function Donut({
  slices,
  size = 132,
  thickness = 16,
}: {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const circle = (
              <circle
                key={s.label}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cx})`}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return circle;
          })}
        <text
          x={cx}
          y={cx}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-white"
          fontSize="22"
          fontWeight="700"
        >
          {total}
        </text>
      </svg>

      <ul className="flex flex-col gap-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-zinc-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
            <span className="text-zinc-400">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
