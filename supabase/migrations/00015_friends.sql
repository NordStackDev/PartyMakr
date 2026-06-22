-- Friends: request -> accept (mutual). A friendship is one row owned by the
-- requester; the addressee accepts it. Reads/writes are scoped to the two users
-- by RLS, and both sides get a notification via SECURITY DEFINER triggers.

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id);
create index friendships_requester_idx on public.friendships (requester_id);

alter table public.friendships enable row level security;

-- Both parties can see the row.
create policy "see own friendships"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- You can only create requests as yourself.
create policy "send own requests"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid());

-- Only the addressee accepts (status -> accepted).
create policy "addressee accepts"
  on public.friendships for update
  to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either party can remove: cancel / decline / unfriend.
create policy "either removes"
  on public.friendships for delete
  to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- ============================================================================
-- Notifications (mirror notify_on_invite)
-- ============================================================================

create function public.notify_on_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  select coalesce(display_name, username, 'Nogen') into who
  from public.profiles where id = new.requester_id;

  insert into public.notifications (user_id, type, title, body)
  values (
    new.addressee_id,
    'friend',
    'Ny venneanmodning',
    coalesce(who, 'Nogen') || ' vil være ven med dig'
  );
  return new;
end;
$$;

create trigger on_friend_request
  after insert on public.friendships
  for each row execute function public.notify_on_friend_request();

create function public.notify_on_friend_accept()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  who text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(display_name, username, 'Nogen') into who
    from public.profiles where id = new.addressee_id;

    insert into public.notifications (user_id, type, title, body)
    values (
      new.requester_id,
      'friend',
      'Venneanmodning accepteret',
      coalesce(who, 'Nogen') || ' accepterede din venneanmodning'
    );
  end if;
  return new;
end;
$$;

create trigger on_friend_accept
  after update on public.friendships
  for each row execute function public.notify_on_friend_accept();

-- Trigger functions aren't API endpoints — keep them off PostgREST.
revoke all on function public.notify_on_friend_request() from public, anon, authenticated;
revoke all on function public.notify_on_friend_accept() from public, anon, authenticated;

notify pgrst, 'reload schema';
