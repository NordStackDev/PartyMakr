"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export function NotificationBell({ userId }: { userId: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function fetchCount() {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("read", false);
      if (active) setCount(count ?? 0);
    }
    fetchCount();

    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => setCount((c) => c + 1),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <Link
      href="/notifications"
      aria-label="Notifikationer"
      className="relative rounded-full border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-zinc-200 transition hover:bg-white/5"
    >
      🔔
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      ) : null}
    </Link>
  );
}
