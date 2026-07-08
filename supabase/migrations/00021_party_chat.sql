-- Chat between a guest and a party host. A thread is created automatically
-- when the guest requests to join (00019); it stays open after approval and
-- is LOCKED (read-only) when the host declines — a new request reopens it.
-- New-message notifications are sent only when the recipient has no unread
-- messages in the thread already (anti-spam). Patterns mirror 00013/00015.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.party_threads (
  id                 uuid primary key default gen_random_uuid(),
  party_id           uuid not null references public.parties(id) on delete cascade,
  guest_id           uuid not null references public.profiles(id) on delete cascade,
  locked             boolean not null default false,
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz not null default now(),
  guest_last_read_at timestamptz not null default now(),
  host_last_read_at  timestamptz not null default now(),
  unique (party_id, guest_id)
);

create index party_threads_guest_idx on public.party_threads (guest_id, last_message_at desc);
create index party_threads_party_idx on public.party_threads (party_id);

create table public.party_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.party_threads(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index party_messages_thread_idx on public.party_messages (thread_id, created_at);

alter table public.party_threads  enable row level security;
alter table public.party_messages enable row level security;

-- ============================================================================
-- RLS — participants only. Threads are written by triggers/RPC exclusively.
-- ============================================================================

create policy "participants can read threads"
  on public.party_threads for select
  to authenticated
  using (guest_id = auth.uid() or private.is_party_host(party_id));

create policy "participants can read messages"
  on public.party_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.party_threads t
      where t.id = party_messages.thread_id
        and (t.guest_id = auth.uid() or private.is_party_host(t.party_id))
    )
  );

create policy "participants can write in open threads"
  on public.party_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.party_threads t
      where t.id = party_messages.thread_id
        and not t.locked
        and (t.guest_id = auth.uid() or private.is_party_host(t.party_id))
    )
  );

-- ============================================================================
-- Thread lifecycle: created on join request, locked on decline
-- ============================================================================

create function public.create_thread_on_join_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.party_threads (party_id, guest_id)
  values (new.party_id, new.user_id)
  on conflict (party_id, guest_id) do update set locked = false;
  return new;
end;
$$;

create trigger on_join_request_thread
  after insert on public.party_join_requests
  for each row execute function public.create_thread_on_join_request();

create function public.lock_thread_on_decline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'declined' and old.status <> 'declined' then
    update public.party_threads
    set locked = true
    where party_id = new.party_id and guest_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger on_join_request_decline_lock
  after update on public.party_join_requests
  for each row execute function public.lock_thread_on_decline();

-- ============================================================================
-- New message: bump last_message_at + notify recipient (only if they have no
-- unread already). ONE function so the order of operations is explicit.
-- ============================================================================

create function public.on_new_party_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t          public.party_threads%rowtype;
  p_title    text;
  p_host     uuid;
  recipient  uuid;
  recip_read timestamptz;
begin
  select * into t from public.party_threads where id = new.thread_id;
  if t.id is null then
    return new;
  end if;

  select title, host_id into p_title, p_host
  from public.parties where id = t.party_id;

  if new.sender_id = t.guest_id then
    recipient  := p_host;
    recip_read := t.host_last_read_at;
  else
    recipient  := t.guest_id;
    recip_read := t.guest_last_read_at;
  end if;

  -- Notify only when the recipient had read everything up to now — rapid
  -- back-and-forth then produces one notification, not one per message.
  if recipient is not null and recip_read >= t.last_message_at then
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      recipient,
      'message',
      'Ny besked',
      'Ny besked om «' || coalesce(p_title, 'en fest') || '»',
      t.party_id
    );
  end if;

  update public.party_threads
  set last_message_at = new.created_at
  where id = new.thread_id;

  return new;
end;
$$;

create trigger on_party_message_created
  after insert on public.party_messages
  for each row execute function public.on_new_party_message();

-- ============================================================================
-- mark_thread_read: sets the caller's own read marker (guest or host)
-- ============================================================================

create function public.mark_thread_read(p_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.party_threads%rowtype;
begin
  select * into t from public.party_threads where id = p_thread_id;
  if t.id is null then
    raise exception 'Samtalen findes ikke.';
  end if;

  if t.guest_id = auth.uid() then
    update public.party_threads
    set guest_last_read_at = now() where id = p_thread_id;
  elsif exists (
    select 1 from public.parties p
    where p.id = t.party_id and p.host_id = auth.uid()
  ) then
    update public.party_threads
    set host_last_read_at = now() where id = p_thread_id;
  else
    raise exception 'Kun deltagere kan markere samtalen som læst.';
  end if;
end;
$$;

revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;

-- Trigger functions aren't API endpoints — keep them off PostgREST.
revoke all on function public.create_thread_on_join_request() from public, anon, authenticated;
revoke all on function public.lock_thread_on_decline() from public, anon, authenticated;
revoke all on function public.on_new_party_message() from public, anon, authenticated;

-- ============================================================================
-- Backfill threads for existing join requests
-- ============================================================================

insert into public.party_threads (party_id, guest_id, locked)
select r.party_id, r.user_id, r.status = 'declined'
from public.party_join_requests r
on conflict (party_id, guest_id) do nothing;

-- Realtime for the live chat view (RLS-filtered per subscriber).
alter publication supabase_realtime add table public.party_messages;

notify pgrst, 'reload schema';
