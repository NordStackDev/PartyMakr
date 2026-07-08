// Public profile page — e.g. the host checking who is requesting to join.
// Reads only from `profiles` (RLS: readable by all authenticated users).

import { notFound, redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/friends/avatar";
import { BackButton } from "@/components/back-button";

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  // Only allow internal paths as the back target.
  const backHref = from && from.startsWith("/") ? from : "/dashboard";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Din egen profil redigeres under Indstillinger — vis den bare her også.
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url, bio, created_at")
    .eq("id", id)
    .maybeSingle();
  const profile = data as Profile | null;
  if (!profile) notFound();

  const name = profile.display_name || profile.username || "Bruger uden navn";
  const memberSince = new Date(profile.created_at).toLocaleDateString(
    "da-DK",
    { month: "long", year: "numeric" },
  );

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <BackButton fallback={backHref} />

      <div className="mt-6 flex flex-col items-center text-center">
        <Avatar url={profile.avatar_url} name={name} size={96} />
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-white">
          {name}
        </h1>
        {profile.username ? (
          <p className="mt-0.5 text-sm text-zinc-400">@{profile.username}</p>
        ) : null}

        {profile.bio ? (
          <p className="mt-4 max-w-xs whitespace-pre-wrap text-sm text-zinc-200">
            {profile.bio}
          </p>
        ) : null}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-zinc-400">
          <CalendarDays size={14} className="text-amber-300" />
          Registreret siden {memberSince}
        </p>

        {/* TODO: venne-status + "Tilføj ven"-knap. Genbrug logikken fra
            src/lib/friends/actions.ts (sendFriendRequest + Relationship-
            typen fra searchUsers) og knapperne fra src/app/friends/page.tsx. */}

        {/* TODO (senere, kræver ny RLS/RPC): fælles venner, antal fester
            personen har deltaget i / været vært for, ratings (jf. roadmap). */}
      </div>
    </main>
  );
}
