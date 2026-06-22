"use client";

import { useTransition } from "react";

/**
 * Runs a (bound) server action after a window.confirm. Used for destructive
 * friend actions like removing a friend.
 */
export function ConfirmButton({
  action,
  confirm,
  children,
  className,
}: {
  action: () => Promise<void>;
  confirm: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirm)) return;
        start(() => action());
      }}
      className={className}
    >
      {children}
    </button>
  );
}
