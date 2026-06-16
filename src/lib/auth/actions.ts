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
    withError("/login", error.message);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
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
