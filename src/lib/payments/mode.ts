import "server-only";

/** Claim window for any historic marketplace payments still being settled. */
export function claimWindowDays(): number {
  const days = Number(process.env.CLAIM_WINDOW_DAYS ?? 3);
  return Number.isFinite(days) && days >= 0 ? days : 3;
}
