import Image from "next/image";

/**
 * Custom neon ring loader. With `withLogo`, the brand mark sits inside the
 * spinning ring (used for full-page/route loading states); otherwise it's a
 * plain ring for inline spots.
 */
export function Loader({
  label,
  withLogo = false,
}: {
  label?: string;
  withLogo?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-12">
      {withLogo ? (
        <div
          className="relative flex items-center justify-center"
          style={{ width: 112, height: 112 }}
        >
          <span
            className="pm-spinner absolute inset-0"
            style={{ width: 112, height: 112 }}
          />
          <Image
            src="/pm-mark.png"
            alt="PartyMakr"
            width={96}
            height={96}
            priority
            style={{ animation: "pm-pulse 1.6s ease-in-out infinite" }}
          />
        </div>
      ) : (
        <span className="pm-spinner" />
      )}
      {label ? <p className="text-sm text-white">{label}</p> : null}
    </div>
  );
}
