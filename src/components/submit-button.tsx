"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that reflects the enclosing <form>'s pending state: while the
 * server action runs it disables itself (preventing double-submits) and swaps
 * its label for `pendingText`. Must be rendered inside the <form> it submits.
 */
export function SubmitButton({
  children,
  pendingText = "Please wait…",
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={className}
    >
      {pending ? pendingText : children}
    </button>
  );
}
