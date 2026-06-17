import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { MiniMap } from "@/components/map/mini-map";
import { RsvpButtons } from "@/components/parties/rsvp-buttons";
import type { RsvpStatus } from "@/lib/parties/actions";

function fmt(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

type Party = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  address: string | null;
  starts_at: string;
  ends_at: string | null;
  visibility: "public" | "private";
  capacity: number | null;
  lon: number;
  lat: number;
};

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase.rpc("get_party", { p_id: id });
  const party = ((rows ?? []) as Party[])[0];
  if (!party) notFound();

  const [{ data: host }, { data: attendees }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", party.host_id)
      .maybeSingle(),
    supabase
      .from("party_attendees")
      .select("user_id, status")
      .eq("party_id", id),
  ]);

  const rows2 = (attendees ?? []) as { user_id: string; status: string }[];
  const goingCount = rows2.filter((a) => a.status === "going").length;
  const myRsvp =
    (rows2.find((a) => a.user_id === user.id)?.status as RsvpStatus | undefined) ??
    null;
  const isHost = party.host_id === user.id;
  const hostName = host?.display_name || host?.username || "en vært";

  return (
    <main className="flex flex-1 flex-col px-5 py-5">
      <Link
        href="/dashboard"
        className="text-sm text-zinc-300 hover:text-zinc-100"
      >
        ← Kort
      </Link>

      <div className="mt-3 flex items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-white">
          {party.title}
        </h1>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
            party.visibility === "public"
              ? "bg-amber-400/15 text-amber-300"
              : "bg-zinc-500/20 text-zinc-300"
          }`}
        >
          {party.visibility === "public" ? "Offentlig" : "Privat"}
        </span>
      </div>

      <p className="mt-1 text-sm text-zinc-300">Vært: {hostName}</p>

      <div className="mt-4 space-y-1 text-sm">
        <p className="text-zinc-200">🗓️ {fmt(party.starts_at)}</p>
        {party.ends_at ? (
          <p className="text-zinc-400">Slutter: {fmt(party.ends_at)}</p>
        ) : null}
        {party.address ? (
          <p className="text-zinc-300">📍 {party.address}</p>
        ) : null}
        <p className="text-zinc-400">
          {goingCount} kommer
          {party.capacity ? ` · ${party.capacity} pladser` : ""}
        </p>
      </div>

      {party.description ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-200">
          {party.description}
        </p>
      ) : null}

      <div className="mt-4 h-48 overflow-hidden rounded-xl border border-white/10">
        <MiniMap lat={party.lat} lng={party.lon} />
      </div>

      <div className="mt-5">
        {isHost ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
            Du er vært for denne fest.
          </p>
        ) : (
          <>
            <p className="auth-label mb-2">Tag med?</p>
            <RsvpButtons partyId={party.id} current={myRsvp} />
          </>
        )}
      </div>
    </main>
  );
}
