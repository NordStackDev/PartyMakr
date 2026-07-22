"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const radius = Math.min(
    500,
    Math.max(1, Math.round(Number(str(formData, "search_radius_km")) || 25)),
  );

  const genderRaw = str(formData, "gender");
  const gender =
    genderRaw === "male" || genderRaw === "female" || genderRaw === "other"
      ? genderRaw
      : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: str(formData, "display_name").trim() || null,
      username: str(formData, "username").trim() || null,
      bio: str(formData, "bio").trim() || null,
      gender,
      search_radius_km: radius,
    })
    .eq("id", user.id);

  if (error) {
    const msg =
      error.code === "23505"
        ? "Brugernavnet er allerede taget."
        : "Kunne ikke gemme indstillingerne.";
    redirect("/settings?error=" + encodeURIComponent(msg));
  }

  revalidatePath("/dashboard");
  redirect("/settings?saved=1");
}

/**
 * DEV STUB for age verification. Records a verified birthdate directly, standing
 * in for the real MitID (Criipto/Signicat) callback until that's wired up. The
 * write goes through the service-role RPC set_verified_age (users can't set
 * their own age). Swap the caller for the OIDC callback when the broker is live.
 */
export async function verifyAgeStub(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dob = str(formData, "date_of_birth");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
    redirect("/settings?error=" + encodeURIComponent("Ugyldig fødselsdato."));
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_verified_age", {
    p_uid: user.id,
    p_dob: dob,
    p_method: "stub",
  });
  if (error) {
    redirect(
      "/settings?error=" +
        encodeURIComponent("Kunne ikke verificere alderen."),
    );
  }

  revalidatePath("/settings");
  revalidatePath(`/profile/${user.id}`);
  redirect("/settings?saved=1");
}

/**
 * Mark the first-time help guide as seen so it won't auto-open again. Called
 * when the user closes the guide the first time. No redirect/revalidate — it's
 * a fire-and-forget background write from the client.
 */
export async function markOnboarded() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);
}

/** Persist a new avatar URL (file already uploaded to storage client-side). */
export async function updateAvatar(url: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: url || null })
    .eq("id", user.id);
  if (error) {
    throw new Error("Kunne ikke gemme profilbilledet.");
  }

  revalidatePath("/settings");
  revalidatePath("/dashboard");
}
