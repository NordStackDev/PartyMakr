import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  pushIsConfigured,
  sendWebPush,
  type StoredPushSubscription,
} from "@/lib/push/send";

export const runtime = "nodejs";

type Reminder = {
  notification_id: string;
  user_id: string;
  title: string;
  body: string;
  party_id: string;
};

type SubscriptionRow = StoredPushSubscription & { user_id: string };

function pushStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return null;
}

/** Queue one in-app rating reminder per eligible user and completed party. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: createdRows, error: enqueueError } = await admin.rpc(
    "enqueue_due_review_push_notifications",
  );
  if (enqueueError) {
    console.error("Review reminder job failed:", enqueueError);
    return NextResponse.json({ error: "reminder job failed" }, { status: 500 });
  }

  const created = (createdRows ?? []).length;
  if (!pushIsConfigured()) {
    return NextResponse.json({ created, push: "not configured" });
  }

  const { data: claimedRows, error: claimError } = await admin.rpc(
    "claim_review_push_notifications",
    { p_limit: 500 },
  );
  if (claimError) {
    console.error("Review push claim failed:", claimError);
    return NextResponse.json({ created, error: "push claim failed" }, { status: 500 });
  }

  const reminders = (claimedRows ?? []) as Reminder[];
  const userIds = [...new Set(reminders.map((reminder) => reminder.user_id))];
  const { data: subscriptionData, error: subscriptionError } = userIds.length
    ? await admin
        .from("push_subscriptions")
        .select("user_id, endpoint, p256dh, auth")
        .in("user_id", userIds)
    : { data: [], error: null };
  if (subscriptionError) {
    console.error("Push subscription lookup failed:", subscriptionError);
    return NextResponse.json(
      { created, error: "subscription lookup failed" },
      { status: 500 },
    );
  }

  const subscriptionsByUser = new Map<string, SubscriptionRow[]>();
  for (const subscription of (subscriptionData ?? []) as SubscriptionRow[]) {
    subscriptionsByUser.set(subscription.user_id, [
      ...(subscriptionsByUser.get(subscription.user_id) ?? []),
      subscription,
    ]);
  }

  const jobs = reminders.flatMap((reminder) =>
    (subscriptionsByUser.get(reminder.user_id) ?? []).map((subscription) => ({
      reminder,
      subscription,
    })),
  );
  const deliveredNotifications = new Set<string>();
  const expiredEndpoints = new Set<string>();
  let deliveredDevices = 0;
  let failed = 0;

  for (let offset = 0; offset < jobs.length; offset += 20) {
    const batch = jobs.slice(offset, offset + 20);
    await Promise.all(
      batch.map(async ({ reminder, subscription }) => {
        try {
          await sendWebPush(subscription, {
            title: reminder.title,
            body: reminder.body,
            url: `/parties/${reminder.party_id}#ratings`,
            tag: `review-${reminder.party_id}`,
          });
          deliveredDevices++;
          deliveredNotifications.add(reminder.notification_id);
        } catch (error) {
          const status = pushStatus(error);
          if (status === 404 || status === 410) {
            expiredEndpoints.add(subscription.endpoint);
          } else {
            console.error("Review push delivery failed:", error);
          }
          failed++;
        }
      }),
    );
  }

  await Promise.all([
    deliveredNotifications.size
      ? admin
          .from("notifications")
          .update({ push_sent_at: new Date().toISOString() })
          .in("id", [...deliveredNotifications])
      : Promise.resolve(),
    expiredEndpoints.size
      ? admin
          .from("push_subscriptions")
          .delete()
          .in("endpoint", [...expiredEndpoints])
      : Promise.resolve(),
  ]);

  return NextResponse.json({
    created,
    claimed: reminders.length,
    deliveredNotifications: deliveredNotifications.size,
    deliveredDevices,
    noSubscription: reminders.filter(
      (reminder) => !subscriptionsByUser.has(reminder.user_id),
    ).length,
    expired: expiredEndpoints.size,
    failed,
  });
}
