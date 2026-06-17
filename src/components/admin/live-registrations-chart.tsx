"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import {
  TimeSeriesChart,
  type TimePoint,
} from "@/components/admin/charts/time-series-chart";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Live "registrations per day" chart. Seeded server-side from
 * admin_registrations_daily(), then kept live by subscribing to INSERTs on the
 * profiles table (RLS-filtered, so only admins receive every signup).
 */
export function LiveRegistrationsChart({ seed }: { seed: TimePoint[] }) {
  const [data, setData] = useState<TimePoint[]>(seed);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-registrations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        () => {
          const today = todayUTC();
          setData((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last && last.day === today) {
              next[next.length - 1] = { ...last, count: last.count + 1 };
            } else {
              next.push({ day: today, count: 1 });
            }
            return next;
          });
        },
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          Registreringer (30 dage)
        </h2>
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
      </div>
      <TimeSeriesChart data={data} mode="area" height={200} />
    </div>
  );
}
