-- Chat opens on APPROVAL instead of at request time.
--
-- Before (00021): the thread was created when the guest REQUESTED to join.
-- Now: the thread is created when the host ACCEPTS the request — so there is
-- no chat at all until the host has said yes. The decline-lock trigger from
-- 00021 stays (covers: accepted guest leaves, re-requests, gets declined).
--
-- Note: with this model the address filter (00022/00023) almost never fires,
-- since chat participants are always approved. It is kept as a safety net —
-- it costs nothing and protects us if the flow ever changes again.

-- 1) Stop creating threads at request time.
drop trigger if exists on_join_request_thread on public.party_join_requests;
drop function if exists public.create_thread_on_join_request();

-- 2) Create (or reopen) the thread when the host accepts.
create function public.create_thread_on_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.party_threads (party_id, guest_id)
    values (new.party_id, new.user_id)
    on conflict (party_id, guest_id) do update set locked = false;
  end if;
  return new;
end;
$$;

create trigger on_join_request_approved_thread
  after update on public.party_join_requests
  for each row execute function public.create_thread_on_approval();

revoke all on function public.create_thread_on_approval()
  from public, anon, authenticated;

-- 3) Clean up: remove request-time threads that never got a message and
--    whose guest was never accepted. Threads WITH messages are kept (history).
delete from public.party_threads t
where not exists (
    select 1 from public.party_join_requests r
    where r.party_id = t.party_id
      and r.user_id = t.guest_id
      and r.status = 'accepted'
  )
  and not exists (
    select 1 from public.party_messages m where m.thread_id = t.id
  );

-- 4) Backfill: make sure every already-accepted guest has a thread.
insert into public.party_threads (party_id, guest_id)
select r.party_id, r.user_id
from public.party_join_requests r
where r.status = 'accepted'
on conflict (party_id, guest_id) do nothing;
