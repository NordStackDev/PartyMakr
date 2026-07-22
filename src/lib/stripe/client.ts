import "server-only";

import Stripe from "stripe";

// Stripe Checkout, platform-collected: the guest pays the uniform ticket price
// (TICKET_PRICE_DKK) and the money stays with the platform. No Connect — hosts
// never onboard and never receive payouts.

let cached: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!cached) cached = new Stripe(key);
  return cached;
}

/** The platform's uniform entré (whole DKK) for paid parties, from
 * TICKET_PRICE_DKK. 0 = paid parties disabled. Frozen into the party row at
 * creation, so changing the env only affects new parties. */
export function ticketPriceDkk(): number {
  const price = Number(process.env.TICKET_PRICE_DKK ?? 0);
  return Number.isFinite(price) && price > 0 ? Math.round(price) : 0;
}

/**
 * Hosted Checkout for an entré payment. Plain platform charge — our
 * `reference` rides in metadata + client_reference_id so the webhook /
 * reconcile can settle it.
 */
export async function createCheckoutSession(args: {
  reference: string;
  amountDkk: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: args.reference,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "dkk",
          unit_amount: args.amountDkk * 100,
          product_data: { name: args.description },
        },
      },
    ],
    metadata: args.metadata,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  return { id: session.id, url: session.url };
}

export async function getSession(
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.retrieve(sessionId);
}

/** Full refund of a payment intent (decline / withdraw / cancel). */
export async function refundPaymentIntent(paymentIntentId: string): Promise<void> {
  await stripe().refunds.create({ payment_intent: paymentIntentId });
}
