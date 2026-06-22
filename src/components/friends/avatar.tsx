import Image from "next/image";
import { User } from "lucide-react";

/** Round avatar — the profile image, or a User fallback on dark glass. */
export function Avatar({
  url,
  name,
  size = 44,
}: {
  url: string | null;
  name?: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt={name ?? "Profilbillede"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-white/10 text-zinc-300"
    >
      <User size={Math.round(size * 0.5)} />
    </span>
  );
}
