"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/** Send a message in a thread. RLS enforces that the sender is a participant
 * and that the thread isn't locked (declined request). Returns {error} instead
 * of throwing — thrown server-action messages are masked in production. */
export async function sendMessage(
  threadId: string,
  body: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const text = body.trim();
  if (!text || text.length > 2000) {
    return { error: "Beskeden skal være mellem 1 og 2000 tegn." };
  }

  // All sends go through the RPC (00026): it validates, records a flag on
  // circumvention attempts, and blocks them entirely before approval.
  const { data, error } = await supabase.rpc("send_party_message", {
    p_thread_id: threadId,
    p_body: text,
  });
  if (error) {
    return {
      error: error.message.includes("låst")
        ? "Samtalen er låst."
        : "Beskeden kunne ikke sendes.",
    };
  }
  if (data === "blocked") {
    return {
      error:
        "Beskeden blev ikke sendt: kontaktoplysninger og henvisninger til andre platforme kan først deles, når anmodningen er godkendt.",
    };
  }

  revalidatePath(`/messages/${threadId}`);
  return {};
}

/** Mark the caller's side of a thread as read (guest or host — the RPC picks
 * the right column and rejects non-participants). */
export async function markThreadRead(threadId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.rpc("mark_thread_read", { p_thread_id: threadId });

  revalidatePath("/messages");
}
