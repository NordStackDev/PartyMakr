"use client";

import { useTransition } from "react";

/**
 * Confirm-then-run wrapper for an admin moderation server action. Shows a
 * pending label and disables while the action runs.
 */
export function ModerationButton({
  action,
  confirm,
  children,
  pendingText = "Arbejder…",
  variant = "danger",
}: {
  action: () => Promise<void>;
  confirm: string;
  children: React.ReactNode;
  pendingText?: string;
  variant?: "danger" | "neutral";
}) {
  const [pending, startTransition] = useTransition();

  const styles =
    variant === "danger"
      ? "border-red-400/40 text-red-300 hover:bg-red-400/10"
      : "border-white/15 text-zinc-200 hover:bg-white/5";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        startTransition(async () => {
          await action();
        });
      }}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${styles}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}
