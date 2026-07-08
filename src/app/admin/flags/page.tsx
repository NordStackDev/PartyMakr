import Link from "next/link";
import { Flag } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/admin/guard";

function formatDate(value: string): string {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type FlagRow = {
  id: string;
  thread_id: string | null;
  party_id: string | null;
  sender_id: string;
  body: string;
  blocked: boolean;
  created_at: string;
};

export default async function AdminFlagsPage() {
  await requirePermission("moderate");
  const admin = createAdminClient();

  const { data } = await admin
    .from("chat_flags")
    .select("id, thread_id, party_id, sender_id, body, blocked, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const flags = (data ?? []) as FlagRow[];

  const senderIds = [...new Set(flags.map((f) => f.sender_id))];
  const partyIds = [
    ...new Set(flags.flatMap((f) => (f.party_id ? [f.party_id] : []))),
  ];

  const [{ data: profiles }, { data: parties }] = await Promise.all([
    senderIds.length
      ? admin
          .from("profiles")
          .select("id, display_name, username")
          .in("id", senderIds)
      : Promise.resolve({ data: [] }),
    partyIds.length
      ? admin.from("parties").select("id, title").in("id", partyIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameById = new Map(
    (
      (profiles ?? []) as {
        id: string;
        display_name: string | null;
        username: string | null;
      }[]
    ).map((p) => [p.id, p.display_name || p.username || "Ukendt bruger"]),
  );
  const partyById = new Map(
    ((parties ?? []) as { id: string; title: string }[]).map((p) => [
      p.id,
      p.title,
    ]),
  );

  // How often has each user been flagged? Repeat offenders float to the top
  // of the moderator's attention via the count chip on each row.
  const countBySender = new Map<string, number>();
  for (const f of flags) {
    countBySender.set(f.sender_id, (countBySender.get(f.sender_id) ?? 0) + 1);
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white">
        <Flag size={20} className="text-amber-300" />
        Flagede beskeder
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        Forsøg på at dele kontaktoplysninger eller flytte samtalen udenom
        appen. Blokerede beskeder blev aldrig leveret.
      </p>

      <ul className="mt-5 space-y-2">
        {flags.map((f) => {
          const count = countBySender.get(f.sender_id) ?? 1;
          return (
            <li key={f.id} className="glass-card rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/users/${f.sender_id}`}
                  className="text-sm font-semibold text-white hover:underline"
                >
                  {nameById.get(f.sender_id) ?? "Ukendt bruger"}
                </Link>
                {count > 1 ? (
                  <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] font-semibold text-red-300">
                    {count} forsøg
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    f.blocked
                      ? "bg-red-400/15 text-red-300"
                      : "bg-amber-400/15 text-amber-300"
                  }`}
                >
                  {f.blocked ? "Blokeret" : "Leveret"}
                </span>
                <span className="ml-auto text-xs text-zinc-400">
                  {formatDate(f.created_at)}
                </span>
              </div>

              <p className="mt-2 break-words rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200">
                {f.body}
              </p>

              {f.party_id ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Fest:{" "}
                  <Link
                    href={`/admin/parties/${f.party_id}`}
                    className="text-amber-300 hover:underline"
                  >
                    {partyById.get(f.party_id) ?? "Ukendt fest"}
                  </Link>
                </p>
              ) : null}
            </li>
          );
        })}
        {flags.length === 0 ? (
          <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
            Ingen flagede beskeder endnu.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
