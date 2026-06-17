"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  TimeSeriesChart,
  type TimePoint,
} from "@/components/admin/charts/time-series-chart";

type Series = { hour: TimePoint[]; day: TimePoint[]; all: TimePoint[] };
type RangeKey = keyof Series;

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "hour", label: "1 dag" },
  { key: "day", label: "30 dage" },
  { key: "all", label: "Alle" },
];

function bumpLast(arr: TimePoint[]): TimePoint[] {
  if (!arr.length) return arr;
  const next = [...arr];
  const last = next[next.length - 1];
  next[next.length - 1] = { ...last, count: last.count + 1 };
  return next;
}

/**
 * Live "registrations" chart with a 1-day / 30-day / all-time filter. Seeded
 * server-side, then kept live by subscribing to profiles INSERTs (RLS-filtered,
 * so only admins receive every signup). Each new signup bumps the latest bucket
 * of every range so switching stays consistent.
 */
export function LiveRegistrationsChart({ series }: { series: Series }) {
  const [data, setData] = useState<Series>(series);
  const [range, setRange] = useState<RangeKey>("day");
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-registrations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        () => {
          setData((prev) => ({
            hour: bumpLast(prev.hour),
            day: bumpLast(prev.day),
            all: bumpLast(prev.all),
          }));
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const active = data[range];
  const total = active.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Registreringer</h2>
          <span className="text-xs text-zinc-500">{total} i alt</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                live ? "bg-emerald-400" : "bg-zinc-600"
              }`}
              style={
                live
                  ? { animation: "pm-pulse 1.6s ease-in-out infinite" }
                  : undefined
              }
            />
            {live ? "Live" : "Forbinder…"}
          </span>
          <div className="flex gap-1 rounded-full bg-white/5 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  range === r.key
                    ? "bg-white/15 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <TimeSeriesChart data={active} mode="area" height={200} />
    </div>
  );
}
