import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe/client";
import { settleCheckoutSession } from "@/lib/stripe/settle";

/**
 * Historic Stripe webhook: settle Checkout sessions created before entry
 * payments were removed from the app. Signature-verified and idempotent.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe().webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    console.error("Stripe webhook signature failed:", e);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await settleCheckoutSession(event.data.object);
    }
  } catch (e) {
    // Non-2xx makes Stripe retry — right for transient failures.
    console.error("Stripe webhook settle failed:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
