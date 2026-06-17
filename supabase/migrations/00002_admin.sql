-- PartyMakr admin dashboard
-- Admin identity, additive admin RLS, append-only audit log, aggregate RPCs,
-- realtime publication, and an idempotent developer-admin seed.
--
-- Security notes:
--   * Admin identity lives in a DEDICATED table (admin_users) and is checked via
--     a SECURITY DEFINER function (is_admin). A profiles.role column would cause
--     "infinite recursion" when referenced from a profiles RLS policy; a separate
--     relation read as the function owner avoids that entirely.
--   * Every SECURITY DEFINER function pins search_path to block hijacking.
--   * Admin policies are PERMISSIVE (OR-combined) so they only widen admin access
--     and never weaken the existing user-scoped policies.

-- ============================================================================
-- Admin identity
-- ============================================================================

create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Trusted, recursion-free admin check for the current user.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "admins can read admin_users"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

-- ============================================================================
-- Banned marker
-- ============================================================================

alter table public.profiles add column banned_at timestamptz;

-- ============================================================================
-- Additive admin RLS (PERMISSIVE -> OR-combined with existing user policies)
-- ============================================================================

create policy "admins can read all profiles"
  on public.profiles for select to authenticated using (public.is_admin());

create policy "admins can read all parties"
  on public.parties for select to authenticated using (public.is_admin());

create policy "admins can read all invites"
  on public.party_invites for select to authenticated using (public.is_admin());

create policy "admins can read all attendees"
  on public.party_attendees for select to authenticated using (public.is_admin());

-- Moderation writes
create policy "admins can delete any party"
  on public.parties for delete to authenticated using (public.is_admin());

create policy "admins can revoke any invite"
  on public.party_invites for delete to authenticated using (public.is_admin());

create policy "admins can update any profile"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Append-only audit log
-- ============================================================================

create table public.admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

-- Admins read. There is intentionally NO insert policy for authenticated users:
-- the only write path is the SECURITY DEFINER function below (or the service
-- role), which keeps the log append-only and the actor un-forgeable.
create policy "admins can read audit log"
  on public.admin_audit_log for select
  to authenticated
  using (public.is_admin());

create function public.log_admin_action(
  p_action      text,
  p_target_type text,
  p_target_id   text  default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  insert into public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- ============================================================================
-- Aggregate RPCs (SECURITY DEFINER; each enforces is_admin())
-- ============================================================================

create function public.admin_overview_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users_total',      (select count(*) from public.profiles),
    'users_banned',     (select count(*) from public.profiles where banned_at is not null),
    'parties_total',    (select count(*) from public.parties),
    'parties_public',   (select count(*) from public.parties where visibility = 'public'),
    'parties_private',  (select count(*) from public.parties where visibility = 'private'),
    'parties_active',   (select count(*) from public.parties
                          where starts_at <= now() and (ends_at is null or ends_at > now())),
    'parties_upcoming', (select count(*) from public.parties where starts_at > now()),
    'invites_pending',  (select count(*) from public.party_invites where status = 'pending'),
    'invites_accepted', (select count(*) from public.party_invites where status = 'accepted'),
    'invites_declined', (select count(*) from public.party_invites where status = 'declined'),
    'rsvps_total',      (select count(*) from public.party_attendees),
    'rsvps_going',      (select count(*) from public.party_attendees where status = 'going'),
    'rsvps_interested', (select count(*) from public.party_attendees where status = 'interested'),
    'rsvps_maybe',      (select count(*) from public.party_attendees where status = 'maybe')
  ) into result;

  return result;
end;
$$;

create function public.admin_registrations_daily(days int default 30)
returns table (day date, count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      (current_date - make_interval(days => greatest(days, 1) - 1)),
      current_date,
      interval '1 day'
    )::date as day
  )
  select s.day, count(p.id)
  from span s
  left join public.profiles p
    on (p.created_at at time zone 'UTC')::date = s.day
  group by s.day
  order by s.day;
end;
$$;

create function public.admin_party_creation_daily(days int default 30)
returns table (day date, count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      (current_date - make_interval(days => greatest(days, 1) - 1)),
      current_date,
      interval '1 day'
    )::date as day
  )
  select s.day, count(p.id)
  from span s
  left join public.parties p
    on (p.created_at at time zone 'UTC')::date = s.day
  group by s.day
  order by s.day;
end;
$$;

create function public.admin_invite_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'pending',  count(*) filter (where status = 'pending'),
    'accepted', count(*) filter (where status = 'accepted'),
    'declined', count(*) filter (where status = 'declined'),
    'total',    count(*)
  ) into result
  from public.party_invites;

  return result;
end;
$$;

revoke all on function public.admin_overview_stats() from public;
revoke all on function public.admin_registrations_daily(int) from public;
revoke all on function public.admin_party_creation_daily(int) from public;
revoke all on function public.admin_invite_funnel() from public;
grant execute on function public.admin_overview_stats() to authenticated;
grant execute on function public.admin_registrations_daily(int) to authenticated;
grant execute on function public.admin_party_creation_daily(int) to authenticated;
grant execute on function public.admin_invite_funnel() to authenticated;

-- ============================================================================
-- Realtime (postgres_changes stays RLS-filtered per subscriber)
-- ============================================================================

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.parties;
alter publication supabase_realtime add table public.party_invites;

-- ============================================================================
-- Seed the developer admin (idempotent; a no-op if the account doesn't exist
-- yet — sign up first, then re-run this statement).
-- ============================================================================

insert into public.admin_users (user_id)
select id from auth.users where email = 'nordstack@outlook.dk'
on conflict (user_id) do nothing;
