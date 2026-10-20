import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Calendar,
  Clock,
  Home,
  Lock,
  MessageCircle,
  Navigation,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/user";
import { deleteParty } from "@/lib/parties/actions";
import { Avatar } from "@/components/friends/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { MiniMap } from "@/components/map/mini-map";
import { RsvpButtons } from "@/components/parties/rsvp-buttons";
import { JoinRequests } from "@/components/parties/join-requests";
import { HostGroupRequests } from "@/components/parties/host-group-requests";
import { GroupPanel } from "@/components/parties/group-panel";
import { VerifyAgeNotice } from "@/components/parties/verify-age-notice";
import { verifyStartHref } from "@/lib/idura/client";
import { ageFromDob } from "@/lib/age";
import { ConfirmButton } from "@/components/friends/confirm-button";
import { BackButton } from "@/components/back-button";
import { ReviewForm } from "@/components/parties/review-form";
import type { JoinRequestStatus, RsvpStatus } from "@/lib/parties/actions";

function fmt(value: string | null): string {
  if (!value) return "Ikke oplyst";
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
  min_age: number | null;
  gender_target: string | null;
  age_group: string | null;
  theme: string | null;
  music: string | null;
  alcohol_policy: string | null;
  dress_code: string | null;
  gender_mix: string | null;
  lon: number;
  lat: number;
};

type PartyInfo = Pick<
  Party,
  | "capacity"
  | "age_group"
  | "theme"
  | "music"
  | "alcohol_policy"
  | "dress_code"
  | "gender_mix"
>;

const GENDER_LABEL: Record<string, string> = {
  female: "Kvinder",
  male: "Mænd",
  other: "Andet",
};

function PartyInfoTags({
  info,
  address,
  participantCount,
}: {
  info: PartyInfo | null;
  address: string | null;
  participantCount: number;
}) {
  if (!info) return null;

  const alcoholLabels: Record<string, string> = {
    no_alcohol: "Ingen alkohol",
    provided: "Alkohol serveres",
    bring_your_own: "Medbring selv",
  };
  const genderMixLabels: Record<string, string> = {
    mixed: "Blandet",
    mostly_women: "Flest kvinder",
    mostly_men: "Flest mænd",
    unknown: "Ikke afklaret",
  };
  const tags: [string, string | null][] = [
    [
      "Antal deltagere",
      `${participantCount} deltager${participantCount === 1 ? "" : "e"}${info.capacity ? ` · maks. ${info.capacity}` : ""}`,
    ],
    ["Aldersgruppe", info.age_group],
    ["Adresse", address ?? "Vises efter godkendelse"],
    ["Tema", info.theme],
    ["Musik", info.music],
    [
      "Alkohol",
      info.alcohol_policy ? alcoholLabels[info.alcohol_policy] ?? null : null,
    ],
    ["Dresscode", info.dress_code],
    [
      "Kønssammensætning",
      info.gender_mix ? genderMixLabels[info.gender_mix] ?? null : null,
    ],
  ].filter((tag): tag is [string, string] => Boolean(tag[1]));

  if (!tags.length) return null;

  return (
    <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-sm font-semibold text-white">Godt at vide</h2>
      <dl className="mt-3 flex flex-wrap gap-2">
        {tags.map(([label, value]) => (
          <div
            key={label}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-2"
          >
            <dt className="text-[10px] uppercase tracking-wide text-zinc-400">
              {label}
            </dt>
            <dd className="text-sm font-medium text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function PartyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase.rpc("get_party", { p_id: id });
  const party = ((rows ?? []) as Party[])[0];
  if (!party) notFound();
  const info: PartyInfo = party;

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
        .select("display_name, username, avatar_url, verified")
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
  const partyEndedAt = party.ends_at
    ? new Date(party.ends_at)
    : new Date(new Date(party.starts_at).getTime() + 6 * 60 * 60 * 1000);
  const ratingNow = new Date();
  const ratingsOpen =
    partyEndedAt <= ratingNow &&
    partyEndedAt >= new Date(ratingNow.getTime() - 30 * 24 * 60 * 60 * 1000);
  const goingGuestIds = rows2
    .filter((attendee) => attendee.status === "going" && attendee.user_id !== party.host_id)
    .map((attendee) => attendee.user_id);

  let reviewedIds = new Set<string>();
  let skippedIds = new Set<string>();
  let goingGuests: { id: string; name: string }[] = [];
  if (ratingsOpen) {
    const [
      { data: reviewRows },
      { data: skipRows },
      { data: guestProfiles },
    ] = await Promise.all([
      supabase
        .from("party_reviews")
        .select("reviewee_id")
        .eq("party_id", id)
        .eq("reviewer_id", user.id),
      supabase
        .from("party_review_skips")
        .select("reviewee_id")
        .eq("party_id", id)
        .eq("reviewer_id", user.id),
      isHost && goingGuestIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, username")
            .in("id", goingGuestIds)
        : Promise.resolve({ data: [] }),
    ]);
    reviewedIds = new Set((reviewRows ?? []).map((review) => review.reviewee_id));
    skippedIds = new Set((skipRows ?? []).map((skip) => skip.reviewee_id));
    goingGuests = (guestProfiles ?? []).map((guest) => ({
      id: guest.id,
      name: guest.display_name || guest.username || "en gæst",
    }));
  }

  // Just-in-time gate: if this party restricts age/gender and the viewer isn't
  // going yet, work out whether they can join — or must verify with MitID.
  let joinBlock: { verify: boolean; message: string } | null = null;
  if (!isHost && myRsvp !== "going") {
    const [{ data: viewerProfile }, { data: viewerAgeRow }] = await Promise.all([
      supabase.from("profiles").select("gender").eq("id", user.id).maybeSingle(),
      supabase
        .from("profile_age")
        .select("date_of_birth")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    const viewerAge = viewerAgeRow?.date_of_birth
      ? ageFromDob(viewerAgeRow.date_of_birth)
      : null;
    const viewerGender = viewerProfile?.gender ?? null;

    if (party.gender_target && viewerGender !== party.gender_target) {
      joinBlock = {
        verify: false,
        message: `Denne fest er kun for ${
          GENDER_LABEL[party.gender_target] ?? "en bestemt målgruppe"
        }.`,
      };
    } else if (
      party.min_age != null &&
      viewerAge != null &&
      viewerAge < party.min_age
    ) {
      joinBlock = {
        verify: false,
        message: `Denne fest er kun for ${party.min_age}+. Du opfylder ikke aldersgrænsen.`,
      };
    } else if (party.min_age != null && viewerAge == null) {
      joinBlock = {
        verify: true,
        message: `Denne fest er ${party.min_age}+. Verificér din alder med MitID for at deltage.`,
      };
    }
  }

  // Host only: resolve the pending requesters' names for the approval list.
  let requestList: { userId: string; name: string }[] = [];
  const reqRows = (pendingRes.data ?? []) as { user_id: string }[];
  if (reqRows.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, verified")
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
        verified: !!p?.verified,
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
        <span className="flex items-center gap-1.5 text-sm text-zinc-300">
          Vært: <span className="font-semibold text-white">{hostName}</span>
          {host?.verified ? <VerifiedBadge /> : null}
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
        <p className="flex items-center gap-2 text-zinc-200">
          {party.venue_type === "public_spot" ? (
            <Navigation size={16} className="shrink-0 text-amber-300" />
          ) : (
            <Home size={16} className="shrink-0 text-amber-300" />
          )}
          {party.venue_type === "public_spot" ? "Mødes i byen" : "Eget sted"}
        </p>
        {party.min_age || party.gender_target ? (
          <p className="flex items-center gap-2 text-zinc-400">
            <ShieldCheck size={16} className="shrink-0 text-zinc-400" />
            {[
              party.min_age ? `${party.min_age}+ år` : null,
              party.gender_target
                ? `Kun ${GENDER_LABEL[party.gender_target] ?? "målgruppe"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
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

      <PartyInfoTags
        info={info}
        address={party.address}
        participantCount={goingCount}
      />

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
            <HostGroupRequests
              partyId={party.id}
              capacity={party.capacity}
              goingCount={goingCount}
            />
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
            {joinBlock ? (
              joinBlock.verify ? (
                <VerifyAgeNotice
                  href={verifyStartHref()}
                  message={joinBlock.message}
                />
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                  {joinBlock.message}
                </div>
              )
            ) : (
              <>
                <p className="auth-label mb-2">Tag med?</p>
                <RsvpButtons
                  partyId={party.id}
                  current={myRsvp}
                  request={
                    (myRequest?.status as JoinRequestStatus | undefined) ?? null
                  }
                />
                <GroupPanel partyId={party.id} />
              </>
            )}
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

      {ratingsOpen && (isHost || myRsvp === "going") ? (
        <section
          id="ratings"
          className="glass-card mt-5 scroll-mt-4 space-y-4 rounded-2xl p-4"
        >
          <div>
            <h2 className="text-sm font-semibold text-white">Vurder festen</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Vurderinger er åbne i 30 dage efter festen. Kommentaren er kun synlig for modtageren.
            </p>
          </div>
          {isHost ? (
            goingGuests.some((guest) => !skippedIds.has(guest.id)) ? (
              goingGuests
                .filter((guest) => !skippedIds.has(guest.id))
                .map((guest) => (
                <ReviewForm
                  key={guest.id}
                  partyId={party.id}
                  revieweeId={guest.id}
                  revieweeName={guest.name}
                  submitted={reviewedIds.has(guest.id)}
                />
                ))
            ) : (
              <p className="text-sm text-zinc-400">
                {goingGuests.length
                  ? "Du har håndteret alle vurderinger for festen."
                  : "Ingen deltagende gæster at vurdere."}
              </p>
            )
          ) : myRsvp === "going" ? (
            skippedIds.has(party.host_id) ? (
              <p className="text-sm text-zinc-400">
                Du har valgt at springe vurderingen over.
              </p>
            ) : (
              <ReviewForm
                partyId={party.id}
                revieweeId={party.host_id}
                revieweeName={hostName}
                submitted={reviewedIds.has(party.host_id)}
              />
            )
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
