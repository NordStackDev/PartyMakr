"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: str(formData, "display_name").trim() || null,
      username: str(formData, "username").trim() || null,
      bio: str(formData, "bio").trim() || null,
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
