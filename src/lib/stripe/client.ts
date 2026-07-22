import "server-only";

import Stripe from "stripe";

// Stripe Connect (Express) + Checkout. Destination charges: the guest pays,
// the entré is transferred to the HOST's connected account, and the platform
// keeps an optional application fee (PLATFORM_FEE_PERCENT, default 0).

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

/** Danish-style billetgebyr per ticket (whole DKK), from PLATFORM_FEE_DKK.
 * The guest pays entré + fee; the host receives the full entré. */
export function ticketFeeDkk(): number {
  const fee = Number(process.env.PLATFORM_FEE_DKK ?? 0);
  return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
}

/** Create an Express account for a host (Denmark) and return its id. Hosts are
 * private individuals, so preset business_type — onboarding then skips the
 * "register as a company" questions. */
export async function createExpressAccount(email?: string): Promise<string> {
  const account = await stripe().accounts.create({
    type: "express",
    country: "DK",
    ...(email ? { email } : {}),
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
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
): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }> {
  const a = await stripe().accounts.retrieve(accountId);
  return {
    chargesEnabled: Boolean(a.charges_enabled),
    detailsSubmitted: Boolean(a.details_submitted),
  };
}

/**
 * Hosted Checkout for an entré payment: the entré plus a visible billetgebyr
 * line. Destination charge — transfer_data.amount sends exactly the entré to
 * the host; the fee stays on the platform (net of Stripe's processing cost).
 * Our `reference` rides in metadata + client_reference_id so the webhook /
 * reconcile can settle it.
 */
export async function createCheckoutSession(args: {
  reference: string;
  amountDkk: number; // the host's part: entré × persons
  feeDkk: number; // the platform's billetgebyr on top
  hostAccountId: string;
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
      ...(args.feeDkk > 0
        ? [
            {
              quantity: 1,
              price_data: {
                currency: "dkk" as const,
                unit_amount: args.feeDkk * 100,
                product_data: { name: "Billetgebyr" },
              },
            },
          ]
        : []),
    ],
    payment_intent_data: {
      transfer_data: {
        destination: args.hostAccountId,
        // The host gets exactly the entré; the fee stays with the platform.
        amount: args.amountDkk * 100,
      },
    },
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

/** Full refund of a payment intent (entré + gebyr). reverse_transfer pulls the
 * entré back from the host's connected account; the fee part comes back off
 * the platform balance. */
export async function refundPaymentIntent(paymentIntentId: string): Promise<void> {
  await stripe().refunds.create({
    payment_intent: paymentIntentId,
    reverse_transfer: true,
  });
}
