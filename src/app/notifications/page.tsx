import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Mail,
  MessageCircle,
  PartyPopper,
  Bell,
  CalendarX,
  Star,
  UserPlus,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { MarkRead } from "@/components/notifications/mark-read";
import { BackButton } from "@/components/back-button";
import { Pagination, PAGE_SIZE } from "@/components/admin/pagination";

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

const ICON = {
  invite: Mail,
  rsvp: PartyPopper,
  friend: UserPlus,
  join_request: UserPlus,
  join_response: PartyPopper,
  message: MessageCircle,
  party_cancelled: CalendarX,
  review_reminder: Star,
} as const;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await supabase
    .from("notifications")
    .select("id, type, title, body, party_id, read, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const items = (data ?? []) as Notification[];
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <BackButton />
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
                <p className="break-words text-sm font-medium text-white">
                  {n.title}
                </p>
                {n.body ? (
                  <p className="mt-0.5 line-clamp-2 break-words text-sm text-zinc-300">
                    {n.body}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-zinc-400">
                  {timeAgo(n.created_at)}
                </p>
              </div>
            </div>
          );
          const href = n.party_id
            ? `/parties/${n.party_id}${n.type === "review_reminder" ? "#ratings" : ""}`
            : n.type === "friend"
              ? "/friends"
              : null;
          return (
            <li key={n.id}>
              {href ? <Link href={href}>{inner}</Link> : inner}
            </li>
          );
        })}
        {items.length === 0 ? (
          <li className="glass-card rounded-2xl p-6 text-center text-sm text-zinc-400">
            Ingen notifikationer endnu.
          </li>
        ) : null}
      </ul>
      <Pagination
        basePath="/notifications"
        page={page}
        pageCount={pageCount}
      />
    </main>
  );
}
