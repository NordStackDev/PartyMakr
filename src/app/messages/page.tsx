import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Avatar } from "@/components/friends/avatar";

type ThreadRow = {
  id: string;
  party_id: string;
  guest_id: string;
  locked: boolean;
  last_message_at: string;
  guest_last_read_at: string;
  host_last_read_at: string;
};
type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS returns only threads where I'm the guest or the host.
  const { data: threadData } = await supabase
    .from("party_threads")
    .select(
      "id, party_id, guest_id, locked, last_message_at, guest_last_read_at, host_last_read_at",
    )
    .order("last_message_at", { ascending: false })
    .limit(100);
  const threadRows = (threadData ?? []) as ThreadRow[];

  // Resolve party titles/hosts + the counterpart's profile per thread.
  const { data: threadParties } = threadRows.length
    ? await supabase
        .from("parties")
        .select("id, title, host_id")
        .in("id", [...new Set(threadRows.map((t) => t.party_id))])
    : { data: [] };
  const partyById = new Map(
    (
      (threadParties ?? []) as { id: string; title: string; host_id: string }[]
    ).map((p) => [p.id, p]),
  );

  const counterpartIds = [
    ...new Set(
      threadRows.flatMap((t) => {
        const other =
          t.guest_id === user.id
            ? partyById.get(t.party_id)?.host_id
            : t.guest_id;
        return other ? [other] : [];
      }),
    ),
  ];
  const { data: counterpartData } = counterpartIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", counterpartIds)
    : { data: [] };
  const counterparts = new Map(
    ((counterpartData ?? []) as Profile[]).map((p) => [p.id, p]),
  );

  const threads = threadRows.map((t) => {
    const iAmGuest = t.guest_id === user.id;
    const other = iAmGuest
      ? counterparts.get(partyById.get(t.party_id)?.host_id ?? "")
      : counterparts.get(t.guest_id);
    const myRead = iAmGuest ? t.guest_last_read_at : t.host_last_read_at;
    return {
      id: t.id,
      name:
        other?.display_name ||
        other?.username ||
        (iAmGuest ? "Værten" : "Gæsten"),
      avatarUrl: other?.avatar_url ?? null,
      partyTitle: partyById.get(t.party_id)?.title ?? "Fest",
      unread: new Date(t.last_message_at) > new Date(myRead),
    };
  });

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          Beskeder
        </h1>
        <Link
          href="/friends"
          aria-label="Venner"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10"
        >
          <Users size={18} />
        </Link>
      </div>

      <ul className="mt-5 space-y-2">
        {threads.map((t) => (
          <li key={t.id}>
            <Link
              href={`/messages/${t.id}`}
              className="glass-card flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/5"
            >
              <Avatar url={t.avatarUrl} name={t.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {t.name}
                </p>
                <p className="truncate text-xs text-zinc-400">{t.partyTitle}</p>
              </div>
              {t.unread ? (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--brand)]" />
              ) : null}
            </Link>
          </li>
        ))}
        {threads.length === 0 ? (
          <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
            Ingen samtaler endnu. Samtalen oprettes her, når værten har
            godkendt en anmodning om at deltage.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
