import { BadgeCheck } from "lucide-react";

/**
 * "Bekræftet person" mark — shown next to a name so hosts can see a guest is a
 * verified human, not a bot. Teal (the logo's contrast colour). Icon-only by
 * default; pass `withLabel` for the full pill.
 */
export function VerifiedBadge({
  withLabel = false,
  size = 15,
}: {
  withLabel?: boolean;
  size?: number;
}) {
  if (withLabel) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#63bfcb]/15 px-2 py-0.5 text-[11px] font-semibold text-[#63bfcb]">
        <BadgeCheck size={size} />
        Bekræftet person
      </span>
    );
  }
  return (
    <BadgeCheck
      size={size}
      className="inline-block shrink-0 text-[#63bfcb]"
      aria-label="Bekræftet person"
    />
  );
}
