-- PartyMakr admin permissions (granular RBAC)
-- Adds per-admin permissions so a super-admin can grant each admin access to
-- only certain sections/actions. Permission keys:
--   overview · users · parties · invites · audit · moderate · manage_admins
--
-- Enforcement layers re-gated here:
--   * RLS read policies per section permission
--   * moderation write policies require 'moderate'
--   * admin_users visibility requires 'manage_admins'
--   * aggregate RPCs require 'overview'

-- ============================================================================
-- Permissions column
-- ============================================================================

alter table public.admin_users
  add column permissions text[] not null default '{}'::text[];

-- ============================================================================
-- Permission helpers (SECURITY DEFINER, locked search_path)
-- ============================================================================

-- True if the current user is an admin holding a specific permission.
create function public.has_admin_permission(perm text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid() and perm = any(a.permissions)
  );
$$;

revoke all on function public.has_admin_permission(text) from public;
grant execute on function public.has_admin_permission(text) to authenticated;

-- The current user's own permission list (used to drive the UI without needing
-- read access to the admin_users table).
create function public.my_admin_permissions()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select permissions from public.admin_users where user_id = auth.uid()),
    '{}'::text[]
  );
$$;

revoke all on function public.my_admin_permissions() from public;
grant execute on function public.my_admin_permissions() to authenticated;

-- ============================================================================
-- Re-gate RLS by permission (replaces the all-admins policies from 00002)
-- ============================================================================

drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select to authenticated
  using (public.has_admin_permission('users'));

drop policy if exists "admins can read all parties" on public.parties;
create policy "admins can read all parties"
  on public.parties for select to authenticated
  using (public.has_admin_permission('parties'));

drop policy if exists "admins can read all invites" on public.party_invites;
create policy "admins can read all invites"
  on public.party_invites for select to authenticated
  using (public.has_admin_permission('invites'));

drop policy if exists "admins can read all attendees" on public.party_attendees;
create policy "admins can read all attendees"
  on public.party_attendees for select to authenticated
  using (public.has_admin_permission('parties'));

drop policy if exists "admins can delete any party" on public.parties;
create policy "admins can delete any party"
  on public.parties for delete to authenticated
  using (public.has_admin_permission('moderate'));

drop policy if exists "admins can revoke any invite" on public.party_invites;
create policy "admins can revoke any invite"
  on public.party_invites for delete to authenticated
  using (public.has_admin_permission('moderate'));

drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile"
  on public.profiles for update to authenticated
  using (public.has_admin_permission('moderate'))
  with check (public.has_admin_permission('moderate'));

drop policy if exists "admins can read admin_users" on public.admin_users;
create policy "managers can read admin_users"
  on public.admin_users for select to authenticated
  using (public.has_admin_permission('manage_admins'));

drop policy if exists "admins can read audit log" on public.admin_audit_log;
create policy "admins can read audit log"
  on public.admin_audit_log for select to authenticated
  using (public.has_admin_permission('audit'));

-- ============================================================================
-- Re-gate aggregate RPCs by the 'overview' permission
-- ============================================================================

create or replace function public.admin_overview_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_admin_permission('overview') then
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

create or replace function public.admin_registrations_daily(days int default 30)
returns table (day date, count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_admin_permission('overview') then
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

create or replace function public.admin_party_creation_daily(days int default 30)
returns table (day date, count bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_admin_permission('overview') then
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

create or replace function public.admin_invite_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.has_admin_permission('overview') then
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

-- ============================================================================
-- Grant the developer account full permissions (idempotent + re-runnable).
-- If nordstack@outlook.dk signs up only later, re-run this statement.
-- ============================================================================

insert into public.admin_users (user_id, permissions)
select id, array['overview','users','parties','invites','audit','moderate','manage_admins']
from auth.users
where email = 'nordstack@outlook.dk'
on conflict (user_id) do update set permissions = excluded.permissions;
