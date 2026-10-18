"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushActionResult = { error?: string };

export async function savePushSubscription(
  subscription: PushSubscriptionInput,
): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (
    !subscription?.endpoint?.startsWith("https://") ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return { error: "Browseren returnerede et ugyldigt abonnement." };
  }

  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth: subscription.keys.auth,
  });

  return error
    ? { error: error.message || "Kunne ikke gemme notifikationstilladelsen." }
    : {};
}

export async function deletePushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("delete_push_subscription", {
    p_endpoint: endpoint,
  });
  return error
    ? { error: error.message || "Kunne ikke slå notifikationer fra." }
    : {};
}
