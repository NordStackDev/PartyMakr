"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";

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

  if (!email || !password) {
    withError("/login", "Email and password are required.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The password may be correct but the account isn't confirmed yet. Send the
    // user back with their email so the login page can offer to resend the link.
    if (error.code === "email_not_confirmed") {
      redirect(`/login?unconfirmed=${encodeURIComponent(email)}`);
    }
    withError("/login", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function resendConfirmation(formData: FormData) {
  const email = getString(formData, "email").trim();

  if (!email) {
    withError("/login", "Enter your email to resend the confirmation link.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${getSiteURL()}/auth/confirm`,
    },
  });

  if (error) {
    withError("/login", error.message);
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Confirmation email sent. Check your inbox.",
    )}`,
  );
}

export async function signUp(formData: FormData) {
  const email = getString(formData, "email").trim();
  const password = getString(formData, "password");

  if (!email || !password) {
    withError("/signup", "Email and password are required.");
  }
  if (password.length < 8) {
    withError("/signup", "Password must be at least 8 characters.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${getSiteURL()}/auth/confirm`,
    },
  });

  if (error) {
    withError("/signup", error.message);
  }

  // When the email is already registered, Supabase returns success with no
  // error (anti-enumeration) but the user carries an empty `identities` array.
  // Send them to sign in rather than telling them to check their inbox.
  if (data.user && data.user.identities?.length === 0) {
    redirect(
      `/login?message=${encodeURIComponent(
        "That email is already registered. Please sign in.",
      )}`,
    );
  }

  // If the project has email confirmation enabled, `session` is null and the
  // user must click the link sent by Supabase before they can sign in.
  if (!data.session) {
    redirect(
      `/login?message=${encodeURIComponent(
        "Check your email to confirm your account before signing in.",
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
  redirect("/login");
}
