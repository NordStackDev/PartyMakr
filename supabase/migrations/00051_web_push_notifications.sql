-- Browser push subscriptions and an atomic reminder claim function. This is a
-- separate migration because 00050 may already be applied in production.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Du skal være logget ind.';
  end if;
  if p_endpoint !~ '^https://' or char_length(p_endpoint) > 2048 then
    raise exception 'Ugyldigt push-abonnement.';
  end if;
  if char_length(p_p256dh) not between 20 and 512
     or char_length(p_auth) not between 8 and 512 then
    raise exception 'Ugyldige push-nøgler.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    updated_at = now();
end;
$$;

revoke all on function public.save_push_subscription(text, text, text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text)
  to authenticated;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.delete_push_subscription(text)
  from public, anon;
grant execute on function public.delete_push_subscription(text)
  to authenticated;

alter table public.notifications
  add column if not exists push_attempted_at timestamptz,
  add column if not exists push_sent_at timestamptz;

create index if not exists notifications_pending_review_push_idx
  on public.notifications (created_at)
  where type = 'review_reminder' and not read and push_sent_at is null;

-- Ensure databases where an earlier draft of 00050 was applied also clear
-- the unread reminder as soon as a review is submitted.
create or replace function public.mark_review_reminder_read()
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

drop trigger if exists on_party_review_mark_reminder_read
  on public.party_reviews;
create trigger on_party_review_mark_reminder_read
  after insert on public.party_reviews
  for each row execute function public.mark_review_reminder_read();

revoke all on function public.mark_review_reminder_read()
  from public, anon, authenticated;

-- Atomically claim due reminders and return exactly the notification rows that
-- were inserted by this invocation. The route can therefore push each one
-- once without a race-prone timestamp query.
create function public.enqueue_due_review_push_notifications()
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  party_id uuid
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with eligible as (
    select
      party.id as party_id,
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
      coalesce(party.ends_at, party.starts_at + interval '6 hours'),
      attendee.user_id,
      party.host_id
    from public.parties party
    join public.party_attendees attendee
      on attendee.party_id = party.id
     and attendee.status = 'going'
     and attendee.user_id <> party.host_id
  ), due as (
    select eligible.party_id, eligible.reviewer_id as user_id
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
    returning
      notifications.id,
      notifications.user_id,
      notifications.title,
      notifications.body,
      notifications.party_id
  )
  select
    notified.id,
    notified.user_id,
    notified.title,
    coalesce(notified.body, ''),
    notified.party_id
  from notified;
$$;

revoke all on function public.enqueue_due_review_push_notifications()
  from public, anon, authenticated;
grant execute on function public.enqueue_due_review_push_notifications()
  to service_role;

-- Claim unsent reminders for one worker. Failed deliveries become eligible
-- again after one hour, while SKIP LOCKED prevents concurrent workers from
-- sending the same push at the same time.
create function public.claim_review_push_notifications(p_limit int default 500)
returns table (
  notification_id uuid,
  user_id uuid,
  title text,
  body text,
  party_id uuid
)
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select notification.id
    from public.notifications notification
    where notification.type = 'review_reminder'
      and not notification.read
      and notification.push_sent_at is null
      and (
        notification.push_attempted_at is null
        or notification.push_attempted_at < now() - interval '1 hour'
      )
      and notification.created_at >= now() - interval '30 days'
    order by notification.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit, 500), 1), 500)
  ), claimed as (
    update public.notifications notification
    set push_attempted_at = now()
    from candidates
    where notification.id = candidates.id
    returning
      notification.id,
      notification.user_id,
      notification.title,
      notification.body,
      notification.party_id
  )
  select
    claimed.id,
    claimed.user_id,
    claimed.title,
    coalesce(claimed.body, ''),
    claimed.party_id
  from claimed;
$$;

revoke all on function public.claim_review_push_notifications(int)
  from public, anon, authenticated;
grant execute on function public.claim_review_push_notifications(int)
  to service_role;

notify pgrst, 'reload schema';
