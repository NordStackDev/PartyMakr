"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile — a privacy-friendly "not a robot" gate on the auth
// forms. Renders NOTHING when NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so the
// change is safe to ship before the key exists: auth keeps working exactly as
// before until you (1) set the site key here and (2) enable CAPTCHA in the
// Supabase Auth settings with the matching secret key.

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  action?: string;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loader: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined" || window.turnstile) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Kunne ikke indlæse Turnstile."));
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Renders the Turnstile challenge and mirrors its token into a hidden input so
 * the surrounding <form> submits it to the auth server action.
 */
export function Turnstile({
  name = "captchaToken",
  action,
}: {
  name?: string;
  action?: string;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    let widgetId: string | undefined;

    loadTurnstile()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return;
        widgetId = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          theme: "dark",
          action,
          callback: (t) => setToken(t),
          "expired-callback": () => setToken(""),
          "error-callback": () => setToken(""),
        });
      })
      .catch(() => {
        /* offline / blocked — token stays empty, server rejects if required */
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, action]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={ref} />
      <input type="hidden" name={name} value={token} readOnly />
    </div>
  );
}
