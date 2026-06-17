import Image from "next/image";

/**
 * PartyMakr brand lockup (balloon mark + "PARTYMAKR" wordmark) on transparent
 * background, served optimized via next/image, with an optional tagline below.
 */
export function Brand({
  tagline,
  size = "md",
}: {
  tagline?: string;
  size?: "md" | "lg";
}) {
  const w = size === "lg" ? 264 : 200;
  const h = Math.round((w * 466) / 720);

  return (
    <div className="flex flex-col items-center text-center">
      <Image
        src="/pm-logo.png"
        alt="PartyMakr"
        width={w}
        height={h}
        priority
        className="drop-shadow-[0_0_28px_rgba(252,190,79,0.25)]"
      />
      {tagline ? (
        <p className="mt-3 text-sm text-zinc-200">{tagline}</p>
      ) : null}
    </div>
  );
}
