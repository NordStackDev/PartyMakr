import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createTransfer } from "@/lib/stripe/client";

/**
 * Escrow release job (Vercel cron). Finds held marketplace payments whose
 * claim window has passed, and transfers the host's share to their Connect
 * account — unless the party has an open claim ("the party never happened"),
 * which blocks the whole party's payouts until resolved. Idempotent: each
 * transfer uses the payment reference as idempotency key, and released rows
 * are excluded from the next run. No-ops entirely in platform mode (nothing
 * is ever 'held').
 */
export async function GET(req: Request) {
  // Vercel cron sends Authorization: Bearer <CRON_SECRET> when configured.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: due } = await admin
    .from("party_payments")
    .select("reference, party_id, host_amount_dkk")
    .eq("payout_status", "held")
    .eq("status", "completed")
    .lte("payout_due_at", new Date().toISOString())
    .limit(50);

  let released = 0;
  let blocked = 0;
  let failed = 0;

  for (const pay of due ?? []) {
    try {
      // An open claim on the party blocks its payouts until resolved.
      const { data: claim } = await admin
        .from("party_claims")
        .select("party_id")
        .eq("party_id", pay.party_id)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();
      if (claim) {
        await admin
          .from("party_payments")
          .update({ payout_status: "disputed" })
          .eq("reference", pay.reference);
        blocked++;
        continue;
      }

      const { data: party } = await admin
        .from("parties")
        .select("host_id")
        .eq("id", pay.party_id)
        .maybeSingle();
      const { data: payout } = party
        ? await admin
            .from("host_payout_accounts")
            .select("stripe_account_id, charges_enabled")
            .eq("id", party.host_id)
            .maybeSingle()
        : { data: null };
      if (!payout?.charges_enabled) {
        // Host lost/never finished onboarding — leave held; retried next run.
        blocked++;
        continue;
      }

      const transferId = await createTransfer({
        reference: pay.reference,
        amountDkk: Number(pay.host_amount_dkk),
        destinationAccountId: payout.stripe_account_id,
      });
      await admin
        .from("party_payments")
        .update({ payout_status: "released", transfer_ref: transferId })
        .eq("reference", pay.reference);
      released++;
    } catch (e) {
      console.error(`Payout release failed for ${pay.reference}:`, e);
      failed++;
    }
  }

  return NextResponse.json({ released, blocked, failed });
}
