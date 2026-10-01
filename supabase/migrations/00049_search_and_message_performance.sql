-- Faster people search, notification badges and message overview reads.

-- Trigram indexes support the existing contains search (`%query%`) without a
-- sequential scan as the profile directory grows.
create extension if not exists pg_trgm with schema extensions;

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops)
  where username is not null and deletion_requested_at is null;

create index if not exists profiles_display_name_trgm_idx
  on public.profiles using gin (display_name extensions.gin_trgm_ops)
  where display_name is not null and deletion_requested_at is null;

-- The navigation badge only counts unread rows, so avoid walking the full
-- per-user notification history on every authenticated navigation.
create index if not exists notifications_unread_user_idx
  on public.notifications (user_id)
  where not read;

-- Search and relationship state in one round-trip. The function exposes only
-- active profiles and only the caller's relationship to each result.
create function public.search_users_with_relationship(
  p_query text,
  p_limit int default 20
)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_url text,
  relationship text
)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with input as (
    select auth.uid() as user_id, btrim(coalesce(p_query, '')) as query
  )
  select
    profile.id,
    profile.display_name,
    profile.username,
    profile.avatar_url,
    case
      when friendship.status = 'accepted' then 'friends'
      when friendship.requester_id = input.user_id then 'outgoing'
      when friendship.addressee_id = input.user_id then 'incoming'
      else 'none'
    end as relationship
  from input
  join public.profiles profile
    on profile.id <> input.user_id
   and profile.deletion_requested_at is null
  left join lateral (
    select f.requester_id, f.addressee_id, f.status
    from public.friendships f
    where (f.requester_id = input.user_id and f.addressee_id = profile.id)
       or (f.requester_id = profile.id and f.addressee_id = input.user_id)
    limit 1
  ) friendship on true
  where input.user_id is not null
    and char_length(input.query) >= 1
    and (
      profile.username ilike '%' || input.query || '%'
      or profile.display_name ilike '%' || input.query || '%'
    )
  order by
    case
      when lower(profile.username) = lower(input.query) then 0
      when lower(profile.display_name) = lower(input.query) then 1
      when profile.username ilike input.query || '%' then 2
      when profile.display_name ilike input.query || '%' then 3
      else 4
    end,
    greatest(
      similarity(coalesce(profile.username, ''), input.query),
      similarity(coalesce(profile.display_name, ''), input.query)
    ) desc,
    profile.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_users_with_relationship(text, int)
  from public, anon;
grant execute on function public.search_users_with_relationship(text, int)
  to authenticated;

-- Resolve parties and counterpart profiles inside Postgres instead of using
-- the previous thread -> parties -> profiles request waterfall.
create function public.list_message_threads(
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  thread_id uuid,
  counterpart_name text,
  counterpart_avatar_url text,
  party_title text,
  unread boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with visible as (
    select
      thread.id,
      thread.guest_id,
      thread.last_message_at,
      thread.guest_last_read_at,
      thread.host_last_read_at,
      party.title,
      party.host_id,
      case
        when thread.guest_id = auth.uid() then party.host_id
        else thread.guest_id
      end as counterpart_id
    from public.party_threads thread
    join public.parties party on party.id = thread.party_id
    where auth.uid() is not null
      and (thread.guest_id = auth.uid() or party.host_id = auth.uid())
  )
  select
    visible.id as thread_id,
    coalesce(
      profile.display_name,
      profile.username,
      case when visible.guest_id = auth.uid() then 'Værten' else 'Gæsten' end
    ) as counterpart_name,
    profile.avatar_url as counterpart_avatar_url,
    visible.title as party_title,
    visible.last_message_at > case
      when visible.guest_id = auth.uid() then visible.guest_last_read_at
      else visible.host_last_read_at
    end as unread,
    count(*) over () as total_count
  from visible
  left join public.profiles profile
    on profile.id = visible.counterpart_id
   and profile.deletion_requested_at is null
  order by visible.last_message_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.list_message_threads(int, int)
  from public, anon;
grant execute on function public.list_message_threads(int, int)
  to authenticated;

notify pgrst, 'reload schema';
