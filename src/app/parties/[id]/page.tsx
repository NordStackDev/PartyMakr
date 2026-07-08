import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Calendar,
  Clock,
  Home,
  Lock,
  MapPin,
  MessageCircle,
  Navigation,
  Pencil,
  Trash2,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { deleteParty } from "@/lib/parties/actions";
import { Avatar } from "@/components/friends/avatar";
import { MiniMap } from "@/components/map/mini-map";
import { RsvpButtons } from "@/components/parties/rsvp-buttons";
import { JoinRequests } from "@/components/parties/join-requests";
import { ConfirmButton } from "@/components/friends/confirm-button";
import { BackButton } from "@/components/back-button";
import type { JoinRequestStatus, RsvpStatus } from "@/lib/parties/actions";

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
  venue_type: "own_place" | "public_spot";
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

  const isHost = party.host_id === user.id;

  const [
    { data: host },
    { data: attendees },
    { data: myRequest },
    pendingRes,
    threadsRes,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", party.host_id)
        .maybeSingle(),
      supabase
        .from("party_attendees")
        .select("user_id, status")
        .eq("party_id", id),
      supabase
        .from("party_join_requests")
        .select("status")
        .eq("party_id", id)
        .eq("user_id", user.id)
        .maybeSingle(),
      isHost
        ? supabase
            .from("party_join_requests")
            .select("user_id")
            .eq("party_id", id)
            .eq("status", "pending")
            .order("requested_at", { ascending: true })
        : Promise.resolve({ data: null }),
      // Chat threads for this party — RLS: a guest sees only their own,
      // the host sees all of them.
      supabase.from("party_threads").select("id, guest_id").eq("party_id", id),
    ]);

  const threadRows = (threadsRes.data ?? []) as {
    id: string;
    guest_id: string;
  }[];
  const myThreadId =
    threadRows.find((t) => t.guest_id === user.id)?.id ?? null;
  const threadByGuest = new Map(threadRows.map((t) => [t.guest_id, t.id]));

  const rows2 = (attendees ?? []) as { user_id: string; status: string }[];
  const goingCount = rows2.filter((a) => a.status === "going").length;
  const myRsvp =
    (rows2.find((a) => a.user_id === user.id)?.status as RsvpStatus | undefined) ??
    null;
  const hostName = host?.display_name || host?.username || "en vært";

  // Host only: resolve the pending requesters' names for the approval list.
  let requestList: { userId: string; name: string }[] = [];
  const reqRows = (pendingRes.data ?? []) as { user_id: string }[];
  if (reqRows.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in(
        "id",
        reqRows.map((r) => r.user_id),
      );
    requestList = reqRows.map((r) => {
      const p = (profs ?? []).find((x) => x.id === r.user_id);
      return {
        userId: r.user_id,
        name: p?.display_name || p?.username || "Ukendt bruger",
        avatarUrl: p?.avatar_url ?? null,
        threadId: threadByGuest.get(r.user_id) ?? null,
      };
    });
  }

  return (
    <main className="pb-nav flex flex-1 flex-col px-5 py-5">
      <BackButton />

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

      {/* Host profile — tap to see who is hosting. */}
      <Link
        href={`/profile/${party.host_id}?from=/parties/${party.id}`}
        className="mt-2 inline-flex items-center gap-2 self-start transition hover:opacity-80"
      >
        <Avatar url={host?.avatar_url ?? null} name={hostName} size={28} />
        <span className="text-sm text-zinc-300">
          Vært: <span className="font-semibold text-white">{hostName}</span>
        </span>
      </Link>

      <div className="mt-4 space-y-1.5 text-sm">
        <p className="flex items-center gap-2 text-zinc-200">
          <Calendar size={16} className="shrink-0 text-amber-300" />
          {fmt(party.starts_at)}
        </p>
        {party.ends_at ? (
          <p className="flex items-center gap-2 text-zinc-400">
            <Clock size={16} className="shrink-0 text-zinc-400" />
            Slutter: {fmt(party.ends_at)}
          </p>
        ) : null}
        {party.address ? (
          <p className="flex items-start gap-2 text-zinc-300">
            <MapPin size={16} className="mt-0.5 shrink-0 text-amber-300" />
            <span className="min-w-0 break-words">{party.address}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-2 text-zinc-200">
          {party.venue_type === "public_spot" ? (
            <Navigation size={16} className="shrink-0 text-amber-300" />
          ) : (
            <Home size={16} className="shrink-0 text-amber-300" />
          )}
          {party.venue_type === "public_spot" ? "Mødes i byen" : "Eget sted"}
        </p>
        <p className="flex items-center gap-2 text-zinc-400">
          <Users size={16} className="shrink-0 text-zinc-400" />
          {goingCount} kommer
          {party.capacity ? ` · ${party.capacity} pladser` : ""}
        </p>
        {!isHost && myRsvp !== "going" ? (
          <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
            <Lock size={15} className="mt-0.5 shrink-0 text-amber-300" />
            Adresse og præcis placering vises, når værten har godkendt din
            anmodning.
          </p>
        ) : null}
      </div>

      {party.description ? (
        <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-200">
          {party.description}
        </p>
      ) : null}

      <div className="mt-4 h-[clamp(9rem,32vh,14rem)] overflow-hidden rounded-xl border border-white/10">
        <MiniMap lat={party.lat} lng={party.lon} />
      </div>

      <div className="mt-5">
        {isHost ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
              Du er vært for denne fest.
            </p>
            <JoinRequests partyId={party.id} requests={requestList} />
            <Link
              href={`/parties/${party.id}/edit`}
              className="btn-primary flex items-center justify-center gap-2"
            >
              <Pencil size={16} />
              Rediger fest
            </Link>
            <ConfirmButton
              action={deleteParty.bind(null, party.id)}
              confirm={`Er du sikker på, at du vil slette «${party.title}»? Gæsterne får besked om aflysningen, og det kan ikke fortrydes.`}
              className="flex w-full min-h-11 items-center justify-center gap-2 rounded-full border border-red-400/40 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10 disabled:opacity-60"
            >
              <Trash2 size={16} />
              Slet fest
            </ConfirmButton>
          </div>
        ) : (
          <>
            <p className="auth-label mb-2">Tag med?</p>
            <RsvpButtons
              partyId={party.id}
              current={myRsvp}
              request={(myRequest?.status as JoinRequestStatus | undefined) ?? null}
            />
            {myThreadId ? (
              <Link
                href={`/messages/${myThreadId}`}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:underline"
              >
                <MessageCircle size={16} />
                Skriv til værten
              </Link>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
