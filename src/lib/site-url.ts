/**
 * Resolves the canonical base URL used for building absolute links such as auth
 * email redirects. Resolution order:
 *
 *   1. NEXT_PUBLIC_SITE_URL          — explicit override (set this in Vercel to
 *                                      pin emails to the production domain).
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's production domain, set
 *                                      automatically by Vercel on every
 *                                      deployment (e.g. "party-makr.vercel.app").
 *                                      Using it means even preview builds send
 *                                      users to production, not the preview URL.
 *   3. VERCEL_URL                     — the per-deployment URL (last resort).
 *   4. http://localhost:3000          — local development.
 *
 * Returns an absolute origin with no trailing slash, e.g.
 * "https://party-makr.vercel.app".
 */
export function getSiteURL(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  if (!url.startsWith("http")) {
    url = `https://${url}`;
  }

  return url.replace(/\/+$/, "");
}
