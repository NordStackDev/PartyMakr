"use client";

import { useRouter } from "next/navigation";

/**
 * History-aware back link: goes to the page the user actually came from, and
 * falls back to a sensible route when there is no history (deep link, PWA
 * cold start, opened in a new tab).
 */
export function BackButton({
  label = "Tilbage",
  fallback = "/dashboard",
}: {
  label?: string;
  fallback?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="self-start text-sm text-zinc-300 transition hover:text-zinc-100"
    >
      ← {label}
    </button>
  );
}
