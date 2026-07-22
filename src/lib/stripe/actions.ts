"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/site-url";
import {
  createExpressAccount,
  createOnboardingLink,
  getAccountStatus,
  stripeConfigured,
} from "./client";

/**
 * Connect payouts: create (or reuse) the host's Stripe Express account and
 * send them to Stripe's hosted onboarding. They return to settings, where
 * refreshPayoutStatus picks up the result.
 */
export async function connectStripePayouts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!stripeConfigured()) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("Udbetalinger er ikke konfigureret endnu."),
    );
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("host_payout_accounts")
    .select("stripe_account_id")
    .eq("id", user.id)
    .maybeSingle();

  let accountId = existing?.stripe_account_id;
  let url: string;
  try {
    if (!accountId) {
      accountId = await createExpressAccount(user.email ?? undefined);
      await admin.from("host_payout_accounts").insert({
        id: user.id,
        stripe_account_id: accountId,
      });
    }

    const returnUrl = `${getSiteURL()}/settings?stripe=retur`;
    try {
      url = await createOnboardingLink(accountId, returnUrl, returnUrl);
    } catch (e) {
      // Stale account id — e.g. created under a test key, now running live (or
      // deleted in the dashboard). Mint a fresh account and retry once.
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("not connected to your platform or does not exist")) {
        throw e;
      }
      accountId = await createExpressAccount(user.email ?? undefined);
      await admin
        .from("host_payout_accounts")
        .update({
          stripe_account_id: accountId,
          charges_enabled: false,
          details_submitted: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      url = await createOnboardingLink(accountId, returnUrl, returnUrl);
    }
  } catch (e) {
    console.error("Stripe Connect onboarding failed:", e);
    redirect(
      "/settings?error=" +
        encodeURIComponent("Kunne ikke starte Stripe-tilslutningen."),
    );
  }

  redirect(url);
}

/** Sync the connected account's status from Stripe (called when the host
 * returns from onboarding). Safe to call repeatedly. */
export async function refreshPayoutStatus(userId: string) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("host_payout_accounts")
    .select("stripe_account_id")
    .eq("id", userId)
    .maybeSingle();
  if (!row) return;

  try {
    const status = await getAccountStatus(row.stripe_account_id);
    await admin
      .from("host_payout_accounts")
      .update({
        charges_enabled: status.chargesEnabled,
        details_submitted: status.detailsSubmitted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch (e) {
    console.error("Stripe status refresh failed:", e);
  }
}
