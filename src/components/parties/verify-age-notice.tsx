import { ShieldCheck } from "lucide-react";

/**
 * Just-in-time age-verification prompt. Shown at the point of an action that
 * requires MitID (creating a party, joining an 18+ party). Plain <a> because
 * the MitID href is a server route that must do a full navigation.
 */
export function VerifyAgeNotice({
  message,
  href,
}: {
  message: string;
  href: string;
}) {
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <ShieldCheck size={16} className="text-amber-300" />
        Aldersverifikation kræves
      </p>
      <p className="mt-1 text-xs text-amber-100/80">{message}</p>
      <a
        href={href}
        className="btn-primary mt-3 inline-flex items-center gap-2"
      >
        <ShieldCheck size={16} />
        Verificér med MitID
      </a>
    </div>
  );
}
