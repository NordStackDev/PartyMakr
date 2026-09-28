"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { isConsumerRoute } from "@/lib/routes";

/**
 * Route-scoped live updates. Message and party routes subscribe only to the
 * tables that can change their visible server-rendered data, then trigger a
 * debounced router.refresh(). Other routes open no channel here.
 *
 * router.refresh() only re-renders server components: client state (chat
 * input, form fields, the map position) survives because nothing remounts.
 * Fine-grained subscriptions (navigation badges and open chat threads) remain
 * responsible for their own local state.
 *
 * Renders nothing.
 */
export function RealtimeProvider() {
  const pathname = usePathname();
  if (!isConsumerRoute(pathname)) return null;

  return <RealtimeProviderConnection pathname={pathname} />;
}

function RealtimeProviderConnection({ pathname }: { pathname: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const watchesMessages = pathname.startsWith("/messages");
    const watchesPartyRequests = pathname.startsWith("/parties");
    if (!watchesMessages && !watchesPartyRequests) return;

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
        .channel(`route-live-${userId}`);

      if (watchesMessages) {
        channel
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "party_messages" },
            refreshSoon,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "party_threads" },
            refreshSoon,
          );
      }
      if (watchesPartyRequests) {
        channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "party_join_requests" },
          refreshSoon,
        );
      }
      channel.subscribe();
    };

    // Initial session + keep the channel in sync with sign-in/sign-out. The
    // root layout never remounts, so this is the app's single subscription.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setup(session.user.id);
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
  }, [pathname, router]);

  return null;
}
