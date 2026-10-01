"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type SubmitReviewResult = { error?: string };

/** Submit the one allowed host↔guest review for a completed party. The database
 * RPC is the authority for attendance, role, time window, and duplicate rules. */
export async function submitPartyReview(
  partyId: string,
  revieweeId: string,
  rating: number,
  comment: string,
): Promise<SubmitReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("submit_party_review", {
    p_party_id: partyId,
    p_reviewee_id: revieweeId,
    p_rating: rating,
    p_comment: comment.trim() || null,
  });
  if (error) return { error: error.message || "Kunne ikke gemme vurderingen." };

  revalidatePath(`/parties/${partyId}`);
  revalidatePath(`/profile/${revieweeId}`);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return {};
}

/** Dismiss every outstanding review for this user and party. */
export async function skipPartyReviews(
  partyId: string,
): Promise<SubmitReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("skip_party_reviews", {
    p_party_id: partyId,
  });
  if (error) {
    return { error: error.message || "Kunne ikke springe vurderingen over." };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/parties/${partyId}`);
  revalidatePath("/notifications");
  return {};
}
