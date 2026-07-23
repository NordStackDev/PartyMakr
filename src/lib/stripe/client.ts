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
 * Hosted Checkout for an entré payment. The charge always lands on the
 * PLATFORM account (in marketplace mode the host's share is held in escrow and
 * transferred after the party). A fee line is shown separately when feeDkk > 0
 * — per the payment-flow memo, the two amounts must be visible individually.
 * Our `reference` rides in metadata + client_reference_id so the webhook /
 * reconcile can settle it.
 */
export async function createCheckoutSession(args: {
  reference: string;
  amountDkk: number;
  description: string;
  feeDkk?: number;
  feeLabel?: string;
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
      ...((args.feeDkk ?? 0) > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency: "dkk" as const,
                unit_amount: (args.feeDkk ?? 0) * 100,
                product_data: {
                  name: args.feeLabel ?? "PartyMakr platformgebyr",
                },
              },
            },
          ]
        : []),
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

/** Full refund of a payment intent (decline / withdraw / cancel). Safe in
 * escrow too: funds sit on the platform balance until the payout release. */
export async function refundPaymentIntent(paymentIntentId: string): Promise<void> {
  await stripe().refunds.create({ payment_intent: paymentIntentId });
}

// ---------------------------------------------------------------------------
// Stripe Connect — marketplace mode only (dormant while PAYMENT_MODEL=platform).
// Hosts onboard as Express accounts; the escrow release job transfers their
// share after the party + claim window.
// ---------------------------------------------------------------------------

/** Create an Express account for a host (Denmark, private individual). The
 * business profile is prefilled so onboarding skips the industry/website
 * questions — hosts only do identity + bank. */
export async function createExpressAccount(email?: string): Promise<string> {
  const account = await stripe().accounts.create({
    type: "express",
    country: "DK",
    ...(email ? { email } : {}),
    business_type: "individual",
    business_profile: {
      // 7922: ticketing/entertainment events — matches party entry fees.
      mcc: "7922",
      product_description: "Entré til privat fest formidlet via PartyMakr",
    },
    capabilities: { transfers: { requested: true } },
  });
  return account.id;
}

/** One-time onboarding link for an Express account. */
export async function createOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });
  return link.url;
}

export async function getAccountStatus(
  accountId: string,
): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean; payoutsEnabled: boolean }> {
  const a = await stripe().accounts.retrieve(accountId);
  return {
    chargesEnabled: Boolean(a.charges_enabled),
    detailsSubmitted: Boolean(a.details_submitted),
    payoutsEnabled: Boolean(a.payouts_enabled),
  };
}

/** Escrow release: transfer the host's share to their connected account.
 * Idempotent via transfer_group + our reference as idempotency key. */
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
