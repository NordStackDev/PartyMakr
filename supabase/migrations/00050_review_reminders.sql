-- Re-engage hosts and guests after a party with one idempotent notification
-- per user/party, and let users dismiss outstanding reviews explicitly.

create table public.party_review_skips (
  party_id    uuid not null references public.parties(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (party_id, reviewer_id, reviewee_id),
  check (reviewer_id <> reviewee_id)
);

alter table public.party_review_skips enable row level security;

create policy "users read their own skipped reviews"
  on public.party_review_skips for select
  to authenticated
  using (reviewer_id = auth.uid());

-- Internal delivery ledger. Its primary key makes the scheduled job safe to
-- retry and prevents duplicate reminders even if cron runs more than once.
create table public.party_review_reminder_deliveries (
  party_id uuid not null references public.parties(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

alter table public.party_review_reminder_deliveries enable row level security;

-- Engaging with a reminder clears its unread badge regardless of whether the
-- review came from the current UI or another trusted client.
create function public.mark_review_reminder_read()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.notifications
  set read = true
  where user_id = new.reviewer_id
    and party_id = new.party_id
    and type = 'review_reminder'
    and not read;
  return new;
end;
$$;

create trigger on_party_review_mark_reminder_read
  after insert on public.party_reviews
  for each row execute function public.mark_review_reminder_read();

revoke all on function public.mark_review_reminder_read()
  from public, anon, authenticated;

-- Return the caller's parties that still have at least one eligible review.
create function public.get_pending_party_reviews(p_limit int default 3)
returns table (
  party_id uuid,
  party_title text,
  ended_at timestamptz,
  pending_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with eligible as (
    -- Host reviews every guest whose final attendance is "going".
    select
      party.id as party_id,
      party.title as party_title,
      coalesce(party.ends_at, party.starts_at + interval '6 hours') as ended_at,
      party.host_id as reviewer_id,
      attendee.user_id as reviewee_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
    where party.host_id = auth.uid()

    union all

    -- Every attending guest reviews the host.
    select
      party.id,
      party.title,
      coalesce(party.ends_at, party.starts_at + interval '6 hours'),
      attendee.user_id,
      party.host_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
    where attendee.user_id = auth.uid()
  )
  select
    eligible.party_id,
    eligible.party_title,
    eligible.ended_at,
    count(*) as pending_count
  from eligible
  where auth.uid() is not null
    and eligible.ended_at <= now()
    and eligible.ended_at >= now() - interval '30 days'
    and not exists (
      select 1
      from public.party_reviews review
      where review.party_id = eligible.party_id
        and review.reviewer_id = eligible.reviewer_id
        and review.reviewee_id = eligible.reviewee_id
    )
    and not exists (
      select 1
      from public.party_review_skips skip
      where skip.party_id = eligible.party_id
        and skip.reviewer_id = eligible.reviewer_id
        and skip.reviewee_id = eligible.reviewee_id
    )
  group by eligible.party_id, eligible.party_title, eligible.ended_at
  order by eligible.ended_at desc
  limit least(greatest(coalesce(p_limit, 3), 1), 20);
$$;

revoke all on function public.get_pending_party_reviews(int) from public, anon;
grant execute on function public.get_pending_party_reviews(int) to authenticated;

-- Dismiss every currently outstanding review for one party. Eligibility is
-- rebuilt server-side, so a caller cannot dismiss reviews on another user's
-- behalf or invent arbitrary reviewer/recipient pairs.
create function public.skip_party_reviews(p_party_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  skipped_count integer;
begin
  if auth.uid() is null then
    raise exception 'Du skal være logget ind.';
  end if;

  with eligible as (
    select party.id as party_id, party.host_id as reviewer_id, attendee.user_id as reviewee_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
    where party.id = p_party_id
      and party.host_id = auth.uid()
      and coalesce(party.ends_at, party.starts_at + interval '6 hours') <= now()
      and coalesce(party.ends_at, party.starts_at + interval '6 hours') >= now() - interval '30 days'

    union all

    select party.id, attendee.user_id, party.host_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
    where party.id = p_party_id
      and attendee.user_id = auth.uid()
      and coalesce(party.ends_at, party.starts_at + interval '6 hours') <= now()
      and coalesce(party.ends_at, party.starts_at + interval '6 hours') >= now() - interval '30 days'
  ), inserted as (
    insert into public.party_review_skips (party_id, reviewer_id, reviewee_id)
    select eligible.party_id, eligible.reviewer_id, eligible.reviewee_id
    from eligible
    where not exists (
      select 1
      from public.party_reviews review
      where review.party_id = eligible.party_id
        and review.reviewer_id = eligible.reviewer_id
        and review.reviewee_id = eligible.reviewee_id
    )
    on conflict do nothing
    returning 1
  )
  select count(*)::integer into skipped_count from inserted;

  update public.notifications
  set read = true
  where user_id = auth.uid()
    and party_id = p_party_id
    and type = 'review_reminder'
    and not read;

  return skipped_count;
end;
$$;

revoke all on function public.skip_party_reviews(uuid) from public, anon;
grant execute on function public.skip_party_reviews(uuid) to authenticated;

-- Called only by the service-role cron endpoint. At most 500 users are queued
-- per run so a backlog cannot make one serverless invocation run indefinitely.
create function public.enqueue_due_review_notifications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  notification_count integer;
begin
  with eligible as (
    select
      party.id as party_id,
      party.title as party_title,
      coalesce(party.ends_at, party.starts_at + interval '6 hours') as ended_at,
      party.host_id as reviewer_id,
      attendee.user_id as reviewee_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id

    union all

    select
      party.id,
      party.title,
      coalesce(party.ends_at, party.starts_at + interval '6 hours'),
      attendee.user_id,
      party.host_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
  ), due as (
    select
      eligible.party_id,
      eligible.reviewer_id as user_id,
      max(eligible.party_title) as party_title,
      max(eligible.ended_at) as ended_at
    from eligible
    join public.profiles reviewer on reviewer.id = eligible.reviewer_id
    join public.profiles reviewee on reviewee.id = eligible.reviewee_id
    where eligible.ended_at <= now()
      and eligible.ended_at >= now() - interval '30 days'
      and reviewer.deletion_requested_at is null
      and reviewee.deletion_requested_at is null
      and not exists (
        select 1
        from public.party_reviews review
        where review.party_id = eligible.party_id
          and review.reviewer_id = eligible.reviewer_id
          and review.reviewee_id = eligible.reviewee_id
      )
      and not exists (
        select 1
        from public.party_review_skips skip
        where skip.party_id = eligible.party_id
          and skip.reviewer_id = eligible.reviewer_id
          and skip.reviewee_id = eligible.reviewee_id
      )
    group by eligible.party_id, eligible.reviewer_id
    order by max(eligible.ended_at) desc
    limit 500
  ), delivered as (
    insert into public.party_review_reminder_deliveries (party_id, user_id)
    select due.party_id, due.user_id
    from due
    on conflict do nothing
    returning party_id, user_id
  ), notified as (
    insert into public.notifications (user_id, type, title, body, party_id)
    select
      delivered.user_id,
      'review_reminder',
      'Hvordan gik festen?',
      'Giv din vurdering af «' || party.title || '»',
      delivered.party_id
    from delivered
    join public.parties party on party.id = delivered.party_id
    returning 1
  )
  select count(*)::integer into notification_count from notified;

  return notification_count;
end;
$$;

revoke all on function public.enqueue_due_review_notifications()
  from public, anon, authenticated;
grant execute on function public.enqueue_due_review_notifications()
  to service_role;

notify pgrst, 'reload schema';
