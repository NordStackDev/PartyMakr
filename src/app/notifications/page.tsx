import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, PartyPopper, Bell } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { MarkRead } from "@/components/notifications/mark-read";

function timeAgo(value: string): string {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  party_id: string | null;
  read: boolean;
  created_at: string;
};

const ICON = { invite: Mail, rsvp: PartyPopper } as const;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("notifications")
    .select("id, type, title, body, party_id, read, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const items = (data ?? []) as Notification[];

  return (
    <main className="flex flex-1 flex-col px-5 py-5">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-300 hover:text-zinc-100"
      >
        ← Kort
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-white">
        Notifikationer
      </h1>

      <MarkRead />

      <ul className="mt-5 space-y-2">
        {items.map((n) => {
          const Icon = ICON[n.type as keyof typeof ICON] ?? Bell;
          const inner = (
            <div
              className={`glass-card flex gap-3 rounded-2xl p-4 ${
                n.read ? "" : "ring-1 ring-amber-400/40"
              }`}
            >
              <span className="mt-0.5 shrink-0 text-amber-300">
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{n.title}</p>
                {n.body ? (
                  <p className="mt-0.5 text-sm text-zinc-300">{n.body}</p>
                ) : null}
                <p className="mt-1 text-xs text-zinc-400">
                  {timeAgo(n.created_at)}
                </p>
              </div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.party_id ? (
                <Link href={`/parties/${n.party_id}`}>{inner}</Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
            Ingen notifikationer endnu.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
