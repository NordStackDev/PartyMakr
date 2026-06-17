import { LogoMark } from "@/components/logo-mark";

/**
 * PartyMakr brand lockup for the auth screens: the logo mark above the gradient
 * wordmark, with an optional tagline beneath.
 */
export function Brand({
  tagline,
  size = "md",
}: {
  tagline?: string;
  size?: "md" | "lg";
}) {
  const markSize = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const wordmark = size === "lg" ? "text-4xl sm:text-5xl" : "text-3xl";

  return (
    <div className="flex flex-col items-center text-center">
      <LogoMark
        className={`${markSize} drop-shadow-[0_0_12px_rgba(252,190,79,0.45)]`}
      />
      <span
        className={`mt-3 font-extrabold tracking-tight ${wordmark} brand-gradient`}
      >
        PartyMakr
      </span>
      {tagline ? (
        <p className="mt-2 text-sm text-zinc-400">{tagline}</p>
      ) : null}
    </div>
  );
}
