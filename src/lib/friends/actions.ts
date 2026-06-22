"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type Relationship = "none" | "incoming" | "outgoing" | "friends";

export type UserSearchResult = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  status: Relationship;
};

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user.id };
}

/** Send a friend request — or auto-accept if they already requested you. */
export async function sendFriendRequest(addresseeId: string) {
  const { supabase, userId } = await me();
  if (!addresseeId || addresseeId === userId) return;

  const { data: existing } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${userId})`,
    )
    .maybeSingle();

  if (!existing) {
    await supabase
      .from("friendships")
      .insert({ requester_id: userId, addressee_id: addresseeId });
  } else if (
    existing.status === "pending" &&
    existing.requester_id === addresseeId
  ) {
    // They already asked us — accept instead of creating a duplicate.
    await supabase
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("requester_id", addresseeId)
      .eq("addressee_id", userId);
  }

  revalidatePath("/friends");
}

/** Accept an incoming request (we are the addressee). */
export async function acceptFriendRequest(requesterId: string) {
  const { supabase, userId } = await me();
  await supabase
    .from("friendships")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("requester_id", requesterId)
    .eq("addressee_id", userId);
  revalidatePath("/friends");
}

/** Decline an incoming request (we are the addressee). */
export async function declineFriendRequest(requesterId: string) {
  const { supabase, userId } = await me();
  await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", requesterId)
    .eq("addressee_id", userId);
  revalidatePath("/friends");
}

/** Cancel a request we sent (we are the requester). */
export async function cancelRequest(addresseeId: string) {
  const { supabase, userId } = await me();
  await supabase
    .from("friendships")
    .delete()
    .eq("requester_id", userId)
    .eq("addressee_id", addresseeId);
  revalidatePath("/friends");
}

/** Remove a friend (either direction). */
export async function removeFriend(otherId: string) {
  const { supabase, userId } = await me();
  await supabase
    .from("friendships")
    .delete()
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${otherId}),and(requester_id.eq.${otherId},addressee_id.eq.${userId})`,
    );
  revalidatePath("/friends");
}

/** Search people by username / display name, annotated with our relationship. */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const q = query.replace(/[,()%]/g, "").trim();
  if (q.length < 1) return [];

  const { supabase, userId } = await me();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
    .neq("id", userId)
    .limit(20);

  const list = profiles ?? [];
  if (list.length === 0) return [];

  const { data: links } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id, status")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  const rel = new Map<string, Relationship>();
  for (const l of links ?? []) {
    const other = l.requester_id === userId ? l.addressee_id : l.requester_id;
    if (l.status === "accepted") rel.set(other, "friends");
    else if (l.requester_id === userId) rel.set(other, "outgoing");
    else rel.set(other, "incoming");
  }

  return list.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    avatar_url: p.avatar_url,
    status: rel.get(p.id) ?? "none",
  }));
}
