-- Notifications: in-app alerts for invites (to the invitee) and RSVPs (to the
-- party host). Rows are written only by SECURITY DEFINER triggers; users read
-- and mark-read their own.

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  party_id   uuid references public.parties(id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "users read own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "users update own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- No INSERT policy: notifications are created by the triggers below only.

-- ============================================================================
-- Triggers
-- ============================================================================

create function public.notify_on_invite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p_title text;
begin
  select title into p_title from public.parties where id = new.party_id;
  insert into public.notifications (user_id, type, title, body, party_id)
  values (
    new.invitee_id,
    'invite',
    'Ny invitation',
    'Du er inviteret til «' || coalesce(p_title, 'en fest') || '»',
    new.party_id
  );
  return new;
end;
$$;

create trigger on_invite_created
  after insert on public.party_invites
  for each row execute function public.notify_on_invite();

create function public.notify_on_rsvp()
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

create trigger on_rsvp_created
  after insert on public.party_attendees
  for each row execute function public.notify_on_rsvp();

-- Trigger functions aren't API endpoints — keep them off PostgREST.
revoke all on function public.notify_on_invite() from public, anon, authenticated;
revoke all on function public.notify_on_rsvp() from public, anon, authenticated;

-- Realtime for the live unread badge (RLS-filtered per subscriber).
alter publication supabase_realtime add table public.notifications;
