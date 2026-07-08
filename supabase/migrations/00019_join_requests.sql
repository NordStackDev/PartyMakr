-- Join requests: guests ask to join a party and the HOST approves or declines.
-- Becoming 'going' now always goes through approval — self-service RSVP is
-- limited to the soft signals ('interested'/'maybe'). Both sides are notified
-- via the existing notifications table (SECURITY DEFINER triggers, like 00013).

-- ============================================================================
-- party_join_requests
-- ============================================================================

create table public.party_join_requests (
  party_id     uuid not null references public.parties(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- Reuses invite_status: 'pending' | 'accepted' | 'declined'.
  status       invite_status not null default 'pending',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (party_id, user_id)
);

create index party_join_requests_user_idx on public.party_join_requests (user_id);

alter table public.party_join_requests enable row level security;

-- Requester and host can see a request. Uses the private.* helpers (00010) so
-- the policy never re-enters parties/invites RLS.
create policy "requester or host can read join requests"
  on public.party_join_requests for select
  to authenticated
  using (user_id = auth.uid() or private.is_party_host(party_id));

-- Anyone who can see the party can ask to join it — except its own host.
create policy "users can request to join visible parties"
  on public.party_join_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and private.can_see_party(party_id)
    and not private.is_party_host(party_id)
  );

-- The requester can withdraw (also clears a declined row so they can re-ask).
create policy "requester can cancel their request"
  on public.party_join_requests for delete
  to authenticated
  using (user_id = auth.uid());

-- No UPDATE policy on purpose: responses only happen through
-- respond_join_request below, so a requester can never approve themselves.

-- ============================================================================
-- Tighten party_attendees: 'going' is no longer self-service
-- ============================================================================

drop policy "users can rsvp for themselves" on public.party_attendees;
create policy "users can rsvp for themselves"
  on public.party_attendees for insert
  to authenticated
  with check (user_id = auth.uid() and status in ('interested', 'maybe'));

drop policy "users can change their own rsvp" on public.party_attendees;
create policy "users can change their own rsvp"
  on public.party_attendees for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('interested', 'maybe'));

-- ============================================================================
-- respond_join_request: host approves/declines. SECURITY DEFINER because the
-- host must update the request row and (on accept) insert the guest's
-- attendee row — neither is allowed by the caller's own RLS.
-- ============================================================================

create function public.respond_join_request(
  p_party_id uuid,
  p_user_id  uuid,
  p_accept   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host   uuid;
  v_status invite_status;
begin
  select host_id into v_host from public.parties where id = p_party_id;
  if v_host is null or v_host <> auth.uid() then
    raise exception 'Kun værten kan besvare anmodninger.';
  end if;

  select status into v_status
  from public.party_join_requests
  where party_id = p_party_id and user_id = p_user_id
  for update;

  if v_status is null then
    raise exception 'Anmodningen findes ikke.';
  end if;
  if v_status <> 'pending' then
    return; -- already handled (double-tap / stale UI)
  end if;

  update public.party_join_requests
  set status       = case when p_accept then 'accepted'::invite_status
                          else 'declined'::invite_status end,
      responded_at = now()
  where party_id = p_party_id and user_id = p_user_id;

  if p_accept then
    -- The guest is now going. Suppress the generic "Ny tilmelding" trigger —
    -- the host performed this insert themselves via the approval.
    perform set_config('partymakr.skip_rsvp_notify', '1', true);
    insert into public.party_attendees (party_id, user_id, status)
    values (p_party_id, p_user_id, 'going')
    on conflict (party_id, user_id) do update set status = 'going';
    perform set_config('partymakr.skip_rsvp_notify', '', true);
  end if;
end;
$$;

revoke all on function public.respond_join_request(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.respond_join_request(uuid, uuid, boolean)
  to authenticated;

-- Teach the RSVP notifier about the suppression flag set above.
create or replace function public.notify_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p_title text;
  p_host  uuid;
begin
  if current_setting('partymakr.skip_rsvp_notify', true) = '1' then
    return new;
  end if;

  select title, host_id into p_title, p_host
  from public.parties where id = new.party_id;

  -- Don't notify the host about their own RSVP.
  if p_host is not null and p_host <> new.user_id then
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      p_host,
      'rsvp',
      'Ny tilmelding',
      'Nogen har svaret på «' || coalesce(p_title, 'din fest') || '»',
      new.party_id
    );
  end if;
  return new;
end;
$$;

-- ============================================================================
-- Notifications: host on new request, requester on the host's answer
-- ============================================================================

create function public.notify_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p_title text;
  p_host  uuid;
begin
  select title, host_id into p_title, p_host
  from public.parties where id = new.party_id;

  if p_host is not null then
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      p_host,
      'join_request',
      'Ny anmodning',
      'Nogen vil gerne med til «' || coalesce(p_title, 'din fest') || '»',
      new.party_id
    );
  end if;
  return new;
end;
$$;

create trigger on_join_request_created
  after insert on public.party_join_requests
  for each row execute function public.notify_on_join_request();

create function public.notify_on_join_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p_title text;
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    select title into p_title from public.parties where id = new.party_id;
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      new.user_id,
      'join_response',
      case when new.status = 'accepted'
        then 'Anmodning godkendt'
        else 'Anmodning afvist' end,
      case when new.status = 'accepted'
        then 'Du er med til «' || coalesce(p_title, 'festen') || '»'
        else 'Værten afviste din anmodning til «' || coalesce(p_title, 'festen') || '»'
      end,
      new.party_id
    );
  end if;
  return new;
end;
$$;

create trigger on_join_request_responded
  after update on public.party_join_requests
  for each row execute function public.notify_on_join_response();

-- Trigger functions aren't API endpoints — keep them off PostgREST (00013).
revoke all on function public.notify_on_join_request() from public, anon, authenticated;
revoke all on function public.notify_on_join_response() from public, anon, authenticated;
