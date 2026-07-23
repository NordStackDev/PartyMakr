import "server-only";

// The payment-model feature flag. The escrow marketplace model is built and
// ready but DORMANT — flip PAYMENT_MODEL=marketplace to activate it.
//
//   platform    (default) — uniform TICKET_PRICE_DKK, all money to the
//                platform, no host payouts. Scam-proof: a fake party earns
//                its host nothing.
//   marketplace — the host sets the ticket price, the guest pays price +
//                platform fee (separate lines), the money is HELD by the
//                platform until the party happened + a claim window, then the
//                host's share is transferred to their Connect account.

export type PaymentModel = "platform" | "marketplace";

export function paymentModel(): PaymentModel {
  return process.env.PAYMENT_MODEL === "marketplace"
    ? "marketplace"
    : "platform";
}

export function isMarketplace(): boolean {
  return paymentModel() === "marketplace";
}

/** Marketplace mode: the platform's fee per ticket (whole DKK), shown as its
 * own checkout line on top of the host's price. */
export function platformFeeDkk(): number {
  if (!isMarketplace()) return 0;
  const fee = Number(process.env.PLATFORM_FEE_DKK ?? 0);
  return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
}

/** Days guests have after the party to claim it never happened, before the
 * host's payout is released. */
export function claimWindowDays(): number {
  const days = Number(process.env.CLAIM_WINDOW_DAYS ?? 3);
  return Number.isFinite(days) && days >= 0 ? days : 3;
}
