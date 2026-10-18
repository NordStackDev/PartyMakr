import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { Avatar } from "@/components/friends/avatar";
import { ChatThread } from "@/components/chat/chat-thread";
import { BackButton } from "@/components/back-button";

type Thread = {
  id: string;
  party_id: string;
  guest_id: string;
  locked: boolean;
};

type Msg = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export default async function MessageThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS: only the guest and the host can read the thread.
  const { data: thread } = await supabase
    .from("party_threads")
    .select("id, party_id, guest_id, locked")
    .eq("id", id)
    .maybeSingle<Thread>();
  if (!thread) notFound();

  const [{ data: party }, { data: messages }] = await Promise.all([
    supabase
      .from("parties")
      .select("id, title, host_id")
      .eq("id", thread.party_id)
      .maybeSingle(),
    supabase
      .from("party_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
  ]);

  const isGuest = thread.guest_id === user.id;
  const otherId = isGuest ? party?.host_id : thread.guest_id;
  const { data: other } = otherId
    ? await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", otherId)
        .maybeSingle()
    : { data: null };

  const otherName =
    other?.display_name || other?.username || (isGuest ? "Værten" : "Gæsten");

  return (
    <main className="pb-nav flex min-h-0 flex-1 flex-col px-4 py-4">
      <BackButton fallback="/messages" />

      <div className="mt-3 flex items-center gap-3">
        <Avatar url={other?.avatar_url ?? null} name={otherName} size={40} />
        <div className="min-w-0">
          {otherId ? (
            <Link
              href={`/profile/${otherId}?from=/messages/${thread.id}`}
              className="block truncate text-sm font-semibold text-white hover:underline"
            >
              {otherName}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-white">
              {otherName}
            </p>
          )}
          <Link
            href={`/parties/${thread.party_id}`}
            className="block truncate text-xs text-amber-300 hover:underline"
          >
            {party?.title ?? "Se festen"}
          </Link>
        </div>
      </div>

      <ChatThread
        threadId={thread.id}
        meId={user.id}
        locked={thread.locked}
        initial={(messages ?? []) as Msg[]}
      />
    </main>
  );
}
