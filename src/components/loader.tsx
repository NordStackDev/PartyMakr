import { LogoMark } from "@/components/logo-mark";

/**
 * Custom neon ring loader. Use `withLogo` for full-page/route loading states so
 * the brand mark shows while content streams in; the plain ring suits inline
 * spots.
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
        <span style={{ animation: "pm-pulse 1.6s ease-in-out infinite" }}>
          <LogoMark className="h-12 w-12 drop-shadow-[0_0_16px_rgba(217,70,239,0.5)]" />
        </span>
      ) : null}
      <span className="pm-spinner" />
      {label ? <p className="text-sm text-zinc-400">{label}</p> : null}
    </div>
  );
}
