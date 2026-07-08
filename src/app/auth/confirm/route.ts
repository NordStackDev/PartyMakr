import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Only allow same-origin relative paths — an absolute/`//` URL here would be
  // an open redirect after a valid token (phishing / session fixation).
  const nextRaw = searchParams.get("next");
  const next =
    nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
      ? nextRaw
      : "/dashboard";

  const supabase = await createClient();

  // IMPORTANT: use next/navigation `redirect` (not NextResponse.redirect) so the
  // auth cookies written during verification are attached to the response —
  // otherwise the session is lost and the user lands logged-out on the homepage.

  // PKCE flow (the default for @supabase/ssr): the email link returns a `code`.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
  }

  // Token-hash flow: used when the Supabase email template sends
  // `{{ .TokenHash }}` + `type` (works across devices — no PKCE verifier needed).
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
  }

  redirect(
    `/login?error=${encodeURIComponent("Ugyldigt eller udløbet bekræftelseslink.")}`,
  );
}
