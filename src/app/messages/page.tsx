import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Avatar } from "@/components/friends/avatar";
import { Pagination, PAGE_SIZE } from "@/components/admin/pagination";

type ThreadSummary = {
  thread_id: string;
  counterpart_name: string;
  counterpart_avatar_url: string | null;
  party_title: string;
  unread: boolean;
  total_count: number;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const { data } = await supabase.rpc("list_message_threads", {
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const threads = (data ?? []) as ThreadSummary[];
  const total = Number(threads[0]?.total_count ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
        {threads.map((thread) => (
          <li key={thread.thread_id}>
            <Link
              href={`/messages/${thread.thread_id}`}
              className="glass-card flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/5"
            >
              <Avatar
                url={thread.counterpart_avatar_url}
                name={thread.counterpart_name}
                size={40}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {thread.counterpart_name}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {thread.party_title}
                </p>
              </div>
              {thread.unread ? (
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
      <Pagination
        basePath="/messages"
        page={page}
        pageCount={pageCount}
      />
    </main>
  );
}
