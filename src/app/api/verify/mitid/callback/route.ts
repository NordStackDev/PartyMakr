import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  birthdateFromClaims,
  decodeIdToken,
  exchangeCode,
} from "@/lib/idura/client";
import { getSiteURL } from "@/lib/site-url";

function clearCookies(res: NextResponse): NextResponse {
  const opts = { path: "/api/verify/mitid", maxAge: 0 };
  res.cookies.set("mitid_state", "", opts);
  res.cookies.set("mitid_nonce", "", opts);
  return res;
}

/**
 * MitID redirects back here. Verify the state, exchange the code for an
 * id_token server-side, read the verified birthdate, and store it via the
 * service-role RPC. The birthdate never reaches the browser.
 */
export async function GET(req: NextRequest) {
  const base = getSiteURL();
  const done = (msg?: string) =>
    clearCookies(
      NextResponse.redirect(
        msg
          ? `${base}/settings?error=${encodeURIComponent(msg)}`
          : `${base}/settings?saved=1`,
      ),
    );

  const url = req.nextUrl;
  if (url.searchParams.get("error")) {
    return done("MitID blev afbrudt.");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.cookies.get("mitid_state")?.value;
  const nonce = req.cookies.get("mitid_nonce")?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return done("Ugyldig MitID-session. Prøv igen.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${base}/login`);
  }

  let birthdate: string | null = null;
  try {
    const { idToken } = await exchangeCode({
      code,
      redirectUri: `${base}/api/verify/mitid/callback`,
    });
    if (!idToken) throw new Error("no id_token");
    const claims = decodeIdToken(idToken);
    if (nonce && claims.nonce && claims.nonce !== nonce) {
      throw new Error("nonce mismatch");
    }
    birthdate = birthdateFromClaims(claims);
  } catch (e) {
    console.error("MitID callback error:", e);
    return done("Kunne ikke bekræfte MitID.");
  }

  if (!birthdate) {
    return done("MitID returnerede ingen alder.");
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_verified_age", {
    p_uid: user.id,
    p_dob: birthdate,
    p_method: "mitid",
  });
  if (error) {
    console.error("set_verified_age failed:", error);
    return done("Kunne ikke gemme verifikationen.");
  }

  return done();
}
