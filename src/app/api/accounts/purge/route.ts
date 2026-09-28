import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/** Permanently remove accounts that have completed the 30-day recovery period. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id")
    .lte("deletion_requested_at", cutoff)
    .limit(50);
  if (error) {
    console.error("Account purge lookup failed:", error);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  let deleted = 0;
  let failed = 0;
  for (const profile of profiles ?? []) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(profile.id);
    if (deleteError) {
      console.error(`Account purge failed for ${profile.id}:`, deleteError);
      failed++;
    } else {
      deleted++;
    }
  }

  return NextResponse.json({ deleted, failed });
}
