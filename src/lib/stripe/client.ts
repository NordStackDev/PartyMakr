import "server-only";

import Stripe from "stripe";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** Read an existing Checkout Session for historic payment reconciliation/refunds. */
export async function getSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.retrieve(sessionId);
}

/** Refund an existing payment from before entry payments were removed. */
export async function refundPaymentIntent(paymentIntentId: string): Promise<void> {
  await stripe().refunds.create({ payment_intent: paymentIntentId });
}

/** Release an existing marketplace payout recorded before entry payments were removed. */
export async function createTransfer(args: {
  reference: string;
  amountDkk: number;
  destinationAccountId: string;
}): Promise<string> {
  const transfer = await stripe().transfers.create(
    {
      amount: args.amountDkk * 100,
      currency: "dkk",
      destination: args.destinationAccountId,
      transfer_group: args.reference,
    },
    { idempotencyKey: `payout-${args.reference}` },
  );
  return transfer.id;
}
