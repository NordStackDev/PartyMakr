import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe/client";
import { isMarketplace, platformFeeDkk } from "@/lib/payments/mode";
import { getSiteURL } from "@/lib/site-url";

/**
 * Start a Stripe Checkout — pay-at-request, collected by the platform. Solo
 * (no `groupId`): the guest pays to file their join request. Group
 * (`groupId`): the leader pays to submit the group to the host. The RPCs
 * validate eligibility and record the pending payment with the authoritative
 * amount (the party's frozen ticket price × persons).
 */
export async function POST(req: Request) {
  let partyId: string | undefined;
  let groupId: string | undefined;
  try {
    const body = await req.json();
    partyId = body.partyId;
    groupId = body.groupId;
  } catch {
    // fall through to the missing-data check
  }
  if (!partyId) {
    return NextResponse.json({ error: "Manglende data." }, { status: 400 });
  }
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Betaling er ikke konfigureret." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
  }

  // Validate + record the pending payment (RPC checks eligibility + amount).
  const { data, error } = groupId
    ? await supabase.rpc("create_group_payment_intent", { p_group_id: groupId })
    : await supabase.rpc("create_solo_payment_intent", { p_party_id: partyId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const intent = (Array.isArray(data) ? data[0] : data) as
    | { reference: string; amount_dkk: number }
    | undefined;
  if (!intent) {
    return NextResponse.json(
      { error: "Kunne ikke starte betaling." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: party } = await admin
    .from("parties")
    .select("host_id, title, entre_dkk")
    .eq("id", partyId)
    .maybeSingle();

  const persons =
    party?.entre_dkk && party.entre_dkk > 0
      ? Math.max(1, Math.round(intent.amount_dkk / party.entre_dkk))
      : 1;

  // Marketplace mode: the ticket money is the HOST's (held in escrow until
  // after the party), and the platform adds its own fee line. The host must be
  // able to receive payouts before we take anyone's money.
  const marketplace = isMarketplace();
  const feeDkk = marketplace ? platformFeeDkk() * persons : 0;
  if (marketplace && party) {
    const { data: payout } = await admin
      .from("host_payout_accounts")
      .select("charges_enabled")
      .eq("id", party.host_id)
      .maybeSingle();
    if (!payout?.charges_enabled) {
      return NextResponse.json(
        { error: "Værten kan ikke modtage udbetalinger endnu." },
        { status: 409 },
      );
    }
  }

  const base = getSiteURL();
  try {
    const session = await createCheckoutSession({
      reference: intent.reference,
      amountDkk: intent.amount_dkk,
      description: marketplace
        ? persons > 1
          ? `Billet × ${persons} (vært) · ${party?.title ?? "PartyMakr"}`
          : `Billet til festen (vært) · ${party?.title ?? "PartyMakr"}`
        : persons > 1
          ? `Entré × ${persons} · ${party?.title ?? "PartyMakr"}`
          : `Entré · ${party?.title ?? "PartyMakr"}`,
      feeDkk,
      feeLabel: "PartyMakr platformgebyr",
      successUrl: `${base}/parties/${partyId}?betaling=retur&ref=${intent.reference}`,
      cancelUrl: `${base}/parties/${partyId}`,
      metadata: {
        reference: intent.reference,
        partyId,
        ...(groupId ? { groupId } : {}),
      },
    });

    // Session id in provider_ref until settled (then it becomes the intent
    // id). In marketplace mode the escrow amounts are frozen onto the row so
    // settle/release never depend on the flag or env at a later time.
    await admin
      .from("party_payments")
      .update({
        provider_ref: session.id,
        fee_dkk: feeDkk,
        host_amount_dkk: marketplace ? intent.amount_dkk : 0,
      })
      .eq("reference", intent.reference);

    return NextResponse.json({ checkout: session.url });
  } catch (e) {
    console.error("Stripe checkout failed:", e);
    return NextResponse.json(
      { error: "Betalingen kunne ikke oprettes." },
      { status: 502 },
    );
  }
}
