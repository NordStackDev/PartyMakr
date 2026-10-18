"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { savePushSubscription } from "@/lib/push/actions";
import {
  getBrowserPushSubscription,
  pushSupported,
  serialisePushSubscription,
  subscribeBrowserToPush,
} from "@/lib/push/browser";

const DISMISSED_KEY = "pm_push_prompt_dismissed_at";
const ASK_AGAIN_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export function PushNotificationPrompt() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    const show = () => {
      if (active) setVisible(true);
    };

    if (
      !publicKey ||
      !pushSupported() ||
      Notification.permission === "denied"
    ) {
      return () => {
        active = false;
      };
    }

    if (Notification.permission === "granted") {
      // Keep an existing browser subscription associated with the active
      // account. Creating a new one still requires the button gesture below.
      getBrowserPushSubscription()
        .then((subscription) => {
          const input = subscription
            ? serialisePushSubscription(subscription)
            : null;
          if (input) void savePushSubscription(input);
          else show();
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }

    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (Date.now() - dismissedAt >= ASK_AGAIN_AFTER_MS) queueMicrotask(show);
    return () => {
      active = false;
    };
  }, [publicKey]);

  if (!visible || !publicKey) return null;

  const enable = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { permission, subscription } =
          await subscribeBrowserToPush(publicKey);
        if (permission !== "granted") {
          setError(
            permission === "denied"
              ? "Notifikationer blev blokeret i browseren."
              : "Tilladelsen blev ikke givet.",
          );
          return;
        }

        const input = subscription
          ? serialisePushSubscription(subscription)
          : null;
        if (!input) throw new Error("Invalid subscription");

        const result = await savePushSubscription(input);
        if (result.error) {
          setError(result.error);
          return;
        }

        localStorage.removeItem(DISMISSED_KEY);
        setVisible(false);
      } catch {
        setError("Kunne ikke slå push-notifikationer til på denne enhed.");
      }
    });
  };

  return (
    <aside className="absolute inset-x-4 bottom-[calc(var(--nav-height)+1.25rem)] z-[1050] rounded-2xl border border-cyan-200/25 bg-[#17211f]/95 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#63bfcb] text-zinc-950">
          <BellRing size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            Få en påmindelse efter festen
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">
            PartyMakr kan give dig besked, når det er tid til at vurdere. Du
            bestemmer selv og kan altid slå det fra igen.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-3 text-xs text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={enable}
          className="min-h-10 flex-1 rounded-full bg-[#63bfcb] px-4 text-sm font-semibold text-zinc-950 transition active:brightness-95 disabled:opacity-60"
        >
          {pending ? "Slår til…" : "Slå til"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()));
            setVisible(false);
          }}
          className="min-h-10 rounded-full border border-white/15 px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
        >
          Ikke nu
        </button>
      </div>
    </aside>
  );
}
