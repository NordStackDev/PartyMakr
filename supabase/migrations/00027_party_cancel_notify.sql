-- When a party is deleted (host cancels or admin removes it), notify the
-- people it affects: approved/soft attendees and pending requesters.
--
-- party_id is left NULL on these notifications on purpose: notifications
-- reference parties with ON DELETE CASCADE, so a linked notification would be
-- wiped in the same statement that creates it. The title carries the context.

create function public.notify_on_party_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, type, title, body, party_id)
  select distinct u.user_id,
         'party_cancelled',
         'Fest aflyst',
         '«' || old.title || '» er blevet aflyst.',
         null
  from (
    select a.user_id
    from public.party_attendees a
    where a.party_id = old.id
    union
    select r.user_id
    from public.party_join_requests r
    where r.party_id = old.id and r.status = 'pending'
  ) u
  where u.user_id <> old.host_id;

  return old;
end;
$$;

create trigger on_party_deleted
  before delete on public.parties
  for each row execute function public.notify_on_party_delete();

-- Trigger functions aren't API endpoints — keep them off PostgREST.
revoke all on function public.notify_on_party_delete() from public, anon, authenticated;
