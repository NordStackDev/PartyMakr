"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { translateAuthError } from "@/lib/auth/errors";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function withError(path: string, message: string) {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const email = getString(formData, "email").trim();
  const password = getString(formData, "password");
  const captchaToken = getString(formData, "captchaToken") || undefined;

  if (!email || !password) {
    withError("/login", "E-mail og adgangskode er påkrævet.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });

  if (error) {
    // The password may be correct but the account isn't confirmed yet. Send the
    // user back with their email so the login page can offer to resend the link.
    if (error.code === "email_not_confirmed") {
      redirect(`/login?unconfirmed=${encodeURIComponent(email)}`);
    }
    withError("/login", translateAuthError(error));
  }

  // Belt-and-suspenders over the GoTrue ban: reject banned accounts even within
  // the residual access-token window, and sign them straight back out.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("banned_at")
      .eq("id", user.id)
      .single();
    if (profile?.banned_at) {
      await supabase.auth.signOut();
      withError("/login", "Din konto er blokeret.");
    }
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function resendConfirmation(formData: FormData) {
  const email = getString(formData, "email").trim();
  const captchaToken = getString(formData, "captchaToken") || undefined;

  if (!email) {
    withError("/login", "Indtast din e-mail for at sende bekræftelseslinket igen.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${getSiteURL()}/auth/confirm`,
      captchaToken,
    },
  });

  if (error) {
    withError("/login", translateAuthError(error));
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Bekræftelsesmail sendt. Tjek din indbakke.",
    )}`,
  );
}

export async function signUp(formData: FormData) {
  const email = getString(formData, "email").trim();
  const password = getString(formData, "password");
  const captchaToken = getString(formData, "captchaToken") || undefined;

  if (!email || !password) {
    withError("/signup", "E-mail og adgangskode er påkrævet.");
  }
  if (password.length < 8) {
    withError("/signup", "Adgangskoden skal være mindst 8 tegn.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteURL()}/auth/confirm`,
      captchaToken,
    },
  });

  if (error) {
    withError("/signup", translateAuthError(error));
  }

  // When the email is already registered, Supabase returns success with no
  // error (anti-enumeration) but the user carries an empty `identities` array.
  // Send them to sign in rather than telling them to check their inbox.
  if (data.user && data.user.identities?.length === 0) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Den e-mail er allerede registreret. Log venligst ind.",
      )}`,
    );
  }

  // If the project has email confirmation enabled, `session` is null and the
  // user must click the link sent by Supabase before they can sign in.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Tjek din e-mail for at bekræfte din konto, før du logger ind.",
      )}`,
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function requestPasswordReset(formData: FormData) {
  const email = getString(formData, "email").trim();
  const captchaToken = getString(formData, "captchaToken") || undefined;

  if (!email) {
    withError("/forgot-password", "Indtast din e-mailadresse.");
  }

  const supabase = await createClient();
  // The reset link routes back through /auth/confirm, which exchanges the code
  // for a recovery session and then forwards to /reset-password.
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getSiteURL()}/auth/confirm?next=/reset-password`,
    captchaToken,
  });

  if (error) {
    withError("/forgot-password", translateAuthError(error));
  }

  // Generic message regardless of whether the email exists (anti-enumeration).
  redirect(
    `/login?message=${encodeURIComponent(
      "Hvis e-mailen er registreret, er et nulstillingslink på vej.",
    )}`,
  );
}

export async function updatePassword(formData: FormData) {
  const password = getString(formData, "password");

  if (password.length < 8) {
    withError("/reset-password", "Adgangskoden skal være mindst 8 tegn.");
  }

  const supabase = await createClient();
  // Requires the recovery session established by the reset link.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    withError("/login", "Dit nulstillingslink er udløbet. Anmod om et nyt.");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    withError("/reset-password", translateAuthError(error));
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
