import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { buildAuthorizeUrl, iduraConfigured } from "@/lib/idura/client";
import { getSiteURL } from "@/lib/site-url";

/**
 * Begin MitID age verification: stash a state + nonce in short-lived cookies
 * and redirect the user to Idura's authorize endpoint. The browser comes back
 * to /api/verify/mitid/callback.
 */
export async function GET() {
  const base = getSiteURL();

  if (!iduraConfigured()) {
    return NextResponse.redirect(
      `${base}/settings?error=${encodeURIComponent("Aldersverifikation er ikke konfigureret.")}`,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${base}/login`);
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const redirectUri = `${base}/api/verify/mitid/callback`;

  let url: string;
  try {
    url = await buildAuthorizeUrl({ redirectUri, state, nonce });
  } catch {
    return NextResponse.redirect(
      `${base}/settings?error=${encodeURIComponent("Kunne ikke starte MitID.")}`,
    );
  }

  const res = NextResponse.redirect(url);
  const secure = base.startsWith("https://");
  const opts = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/api/verify/mitid",
    maxAge: 600, // 10 min
  };
  res.cookies.set("mitid_state", state, opts);
  res.cookies.set("mitid_nonce", nonce, opts);
  return res;
}
