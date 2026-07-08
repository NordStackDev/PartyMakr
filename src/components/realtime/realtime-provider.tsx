"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

/**
 * App-wide live updates. ONE Supabase channel per signed-in user listens to
 * the tables that can concern them (RLS decides what each subscriber actually
 * receives) and triggers a debounced router.refresh(), so every server-
 * rendered page updates in place — no per-page wiring needed.
 *
 * router.refresh() only re-renders server components: client state (chat
 * input, form fields, the map position) survives because nothing remounts.
 * The fine-grained subscriptions (nav badge, open chat thread) stay as they
 * are — this is the coarse engine underneath them.
 *
 * Renders nothing.
 */
export function RealtimeProvider() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel | null = null;

    const refreshSoon = () => {
      if (timer.current) clearTimeout(timer.current);
      // Trailing debounce: a burst of events becomes one refresh.
      timer.current = setTimeout(() => router.refresh(), 400);
    };

    const teardown = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const setup = (userId: string) => {
      teardown();
      channel = supabase
        .channel(`live-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          refreshSoon,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_messages" },
          refreshSoon,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_threads" },
          refreshSoon,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_join_requests" },
          refreshSoon,
        )
        .subscribe();
    };

    // Initial session + keep the channel in sync with sign-in/sign-out. The
    // root layout never remounts, so this is the app's single subscription.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setup(user.id);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) setup(session.user.id);
      if (event === "SIGNED_OUT") teardown();
    });

    // Coming back to the foreground (PWA resume, tab switch): catch up on
    // anything the phone missed while backgrounded.
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshSoon();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      subscription.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
      teardown();
    };
  }, [router]);

  return null;
}
