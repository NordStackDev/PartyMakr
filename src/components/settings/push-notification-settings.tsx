"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  deletePushSubscription,
  savePushSubscription,
} from "@/lib/push/actions";
import {
  getBrowserPushSubscription,
  pushSupported,
  serialisePushSubscription,
  subscribeBrowserToPush,
} from "@/lib/push/browser";

type Status = "loading" | "on" | "off" | "blocked" | "unsupported";

export function PushNotificationSettings() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!pushSupported()) {
        if (active) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (active) setStatus("blocked");
        return;
      }
      if (Notification.permission !== "granted") {
        if (active) setStatus("off");
        return;
      }
      try {
        const subscription = await getBrowserPushSubscription();
        if (active) setStatus(subscription ? "on" : "off");
      } catch {
        if (active) setStatus("off");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!publicKey) return null;

  const enable = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { permission, subscription } =
          await subscribeBrowserToPush(publicKey);
        if (permission !== "granted" || !subscription) {
          setStatus(permission === "denied" ? "blocked" : "off");
          return;
        }
        const input = serialisePushSubscription(subscription);
        if (!input) throw new Error("Invalid subscription");
        const result = await savePushSubscription(input);
        if (result.error) {
          setError(result.error);
          return;
        }
        setStatus("on");
      } catch {
        setError("Kunne ikke slå push-notifikationer til på denne enhed.");
      }
    });
  };

  const disable = () => {
    setError(null);
    startTransition(async () => {
      try {
        const subscription = await getBrowserPushSubscription();
        const endpoint = subscription?.endpoint;
        await subscription?.unsubscribe();
        if (endpoint) {
          const result = await deletePushSubscription(endpoint);
          if (result.error) setError(result.error);
        }
        setStatus("off");
      } catch {
        setError("Kunne ikke slå push-notifikationer fra på denne enhed.");
      }
    });
  };

  return (
    <section className="glass-card mt-6 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
        {status === "on" ? (
          <BellRing size={17} className="text-[#63bfcb]" />
        ) : (
          <BellOff size={17} className="text-zinc-400" />
        )}
        Push-notifikationer
      </h2>

      <p className="mt-2 text-sm text-zinc-300">
        {status === "loading"
          ? "Kontrollerer denne enhed…"
          : status === "on"
            ? "Denne enhed får påmindelser, når det er tid til at vurdere en fest."
            : status === "blocked"
              ? "Notifikationer er blokeret i browserens indstillinger."
              : status === "unsupported"
                ? "Denne browser eller enhed understøtter ikke web-push."
                : "Få en besked, selv når PartyMakr ikke er åben."}
      </p>

      {error ? (
        <p className="mt-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      {status === "on" ? (
        <button
          type="button"
          disabled={pending}
          onClick={disable}
          className="mt-4 min-h-11 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
        >
          {pending ? "Slår fra…" : "Slå fra på denne enhed"}
        </button>
      ) : status === "off" ? (
        <button
          type="button"
          disabled={pending}
          onClick={enable}
          className="btn-secondary mt-4 disabled:opacity-60"
        >
          {pending ? "Slår til…" : "Slå push til"}
        </button>
      ) : null}
    </section>
  );
}
