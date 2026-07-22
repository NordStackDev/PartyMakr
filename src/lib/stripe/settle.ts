import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSession, refundPaymentIntent } from "./client";

/**
 * Settle a paid Checkout Session: complete the payment row and file the
 * request (solo -> pending join request, group -> forming becomes requested).
 * Idempotent. On a capacity race the DB refuses and we refund immediately.
 * Shared by the webhook and the return-from-checkout reconcile.
 */
export async function settleCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.payment_status !== "paid") return;
  const reference = session.metadata?.reference ?? session.client_reference_id;
  if (!reference) return;

  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? session.id);

  const admin = createAdminClient();
  const { data: pay } = await admin
    .from("party_payments")
    .select("group_id, amount_dkk, fee_dkk, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!pay || pay.status === "completed") return;

  // Never trust the redirect — compare Stripe's charged total (entré + gebyr)
  // to what we recorded server-side.
  const expected = (Number(pay.amount_dkk) + Number(pay.fee_dkk ?? 0)) * 100;
  if (session.amount_total !== expected) return;

  const { data: outcome, error } = pay.group_id
    ? await admin.rpc("mark_group_requested", {
        p_group_id: pay.group_id,
        p_reference: reference,
        p_provider_ref: paymentIntent,
      })
    : await admin.rpc("mark_solo_paid", {
        p_reference: reference,
        p_provider_ref: paymentIntent,
      });
  if (error) throw new Error(error.message);

  if (outcome === "capacity_full") {
    // Seats filled while the guest was checking out — money back right away.
    await refundPaymentIntent(paymentIntent);
  }
}

/**
 * Reconcile by our reference (used on the return redirect, where the webhook
 * may not have fired — e.g. localhost). provider_ref holds the Checkout
 * Session id until settled. Safe to call repeatedly.
 */
export async function reconcileByReference(reference: string): Promise<void> {
  const admin = createAdminClient();
  const { data: pay } = await admin
    .from("party_payments")
    .select("provider_ref, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!pay?.provider_ref || pay.status !== "pending") return;
  if (!pay.provider_ref.startsWith("cs_")) return;

  const session = await getSession(pay.provider_ref);
  await settleCheckoutSession(session);
}

/**
 * Refund the completed payment behind a declined/withdrawn request or a
 * cancelled/declined group. Resolves the payment intent (provider_ref is a
 * payment intent after settling, or a session before), refunds at Stripe, and
 * marks the row refunded. No-op if there's nothing refundable.
 */
export async function refundByReference(reference: string): Promise<void> {
  const admin = createAdminClient();
  const { data: pay } = await admin
    .from("party_payments")
    .select("provider_ref, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!pay?.provider_ref || pay.status !== "completed") return;

  let paymentIntent = pay.provider_ref;
  if (paymentIntent.startsWith("cs_")) {
    const session = await getSession(paymentIntent);
    paymentIntent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? "");
  }
  if (!paymentIntent) return;

  await refundPaymentIntent(paymentIntent);
  await admin.rpc("mark_payment_refunded", { p_reference: reference });
}

/** Find the settled payment reference for a solo guest on a party (to refund). */
export async function findSoloReference(
  partyId: string,
  userId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("party_payments")
    .select("reference")
    .eq("party_id", partyId)
    .eq("payer_id", userId)
    .is("group_id", null)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.reference ?? null;
}

/** Find the settled payment reference for a group (to refund). */
export async function findGroupReference(groupId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("party_payments")
    .select("reference")
    .eq("group_id", groupId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.reference ?? null;
}
