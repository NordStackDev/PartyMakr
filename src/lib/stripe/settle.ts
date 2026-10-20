import "server-only";

import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { claimWindowDays } from "@/lib/payments/mode";
import { getSession, refundPaymentIntent } from "./client";

/**
 * Settle a historic Checkout Session: complete its payment row and file the
 * request. Kept for sessions created before entry payments were removed.
 * Idempotent. On a capacity race the DB refuses and we refund immediately.
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
    .select("group_id, party_id, amount_dkk, fee_dkk, host_amount_dkk, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!pay || pay.status === "completed") return;

  // Compare Stripe's charged total to the amount recorded server-side.
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
    return;
  }

  // Marketplace escrow: the host's share (frozen on the row at charge time) is
  // held until the party has been held plus the claim window, then released by
  // the payout job. Platform mode leaves host_amount at 0 and skips this.
  if (outcome === "paid" && Number(pay.host_amount_dkk ?? 0) > 0) {
    const { data: party } = await admin
      .from("parties")
      .select("starts_at, ends_at")
      .eq("id", pay.party_id)
      .maybeSingle();
    const heldAt = party?.ends_at
      ? new Date(party.ends_at)
      : party?.starts_at
        ? new Date(new Date(party.starts_at).getTime() + 6 * 3600_000)
        : new Date();
    const dueAt = new Date(
      heldAt.getTime() + claimWindowDays() * 24 * 3600_000,
    );
    await admin
      .from("party_payments")
      .update({ payout_status: "held", payout_due_at: dueAt.toISOString() })
      .eq("reference", reference);
  }
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
  // Escrow bookkeeping: a refunded payment must never be paid out to the host.
  await admin
    .from("party_payments")
    .update({ payout_status: "refunded" })
    .eq("reference", reference)
    .neq("payout_status", "na");
}

/** Cancellation sweep: refund every completed payment on a party (before it is
 * deleted, so the payment rows still exist). Escrow money is still on the
 * platform balance, so refunds always succeed; released payouts (post-event)
 * are skipped — that money is already with the host. */
export async function refundAllPartyPayments(partyId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: payments } = await admin
    .from("party_payments")
    .select("reference, payout_status")
    .eq("party_id", partyId)
    .eq("status", "completed");

  for (const pay of payments ?? []) {
    if (pay.payout_status === "released") continue;
    try {
      await refundByReference(pay.reference);
    } catch (e) {
      // Retryable — the payment row stays 'completed' for a manual sweep.
      console.error(`Cancel refund failed for ${pay.reference}:`, e);
    }
  }
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
