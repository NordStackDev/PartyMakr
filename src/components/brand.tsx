/**
 * PartyMakr brand mark + wordmark for the auth screens.
 *
 * The mark is a custom "party, pinned" glyph — a map pin (PartyMakr is
 * map-first) with a spark at its heart (the party). Neon gradient with a soft
 * glow to suit the club aesthetic. No emoji; it's its own logo.
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="PartyMakr"
    >
      <defs>
        <linearGradient id="pm-mark" x1="6" y1="4" x2="42" y2="44">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="55%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* Pin */}
      <path
        d="M24 4c-8.284 0-15 6.5-15 14.5C9 29 24 44 24 44s15-15 15-25.5C39 10.5 32.284 4 24 4z"
        fill="url(#pm-mark)"
      />
      {/* Spark at the centre */}
      <path
        d="M24 11l1.84 5.16L31 18l-5.16 1.84L24 25l-1.84-5.16L17 18l5.16-1.84L24 11z"
        fill="#0a0510"
      />
    </svg>
  );
}

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
        className={`${markSize} drop-shadow-[0_0_12px_rgba(217,70,239,0.45)]`}
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
