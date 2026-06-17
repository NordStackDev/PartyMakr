-- Move admin functions out of the exposed API schema so they no longer trip the
-- "SECURITY DEFINER function executable by anon/authenticated" advisor lints,
-- without weakening enforcement.
--
--   * has_admin_permission stays SECURITY DEFINER (RLS needs it; reading
--     admin_users from within admin_users' own policy must bypass RLS to avoid
--     recursion) but moves to a private schema the API does not serve, so the
--     linter no longer scans it. RLS policies are repointed at it.
--   * The aggregate stats become SECURITY INVOKER, callable only by service_role.
--     The server calls them with the service key after an app-level admin check;
--     service_role bypasses RLS, so the counts stay global.
--   * is_admin / my_admin_permissions / log_admin_action / admin_invite_funnel
--     are dropped: the app now reads its own admin row directly (new self-read
--     policy) and writes audit rows with the service role.

-- ============================================================================
-- Private schema + relocate has_admin_permission
-- ============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.has_admin_permission(text) set schema private;
revoke all on function private.has_admin_permission(text) from public, anon;
grant execute on function private.has_admin_permission(text) to authenticated;

-- ============================================================================
-- Repoint RLS policies at private.has_admin_permission
-- ============================================================================

drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select to authenticated
  using (private.has_admin_permission('users'));

drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile"
  on public.profiles for update to authenticated
  using (private.has_admin_permission('moderate'))
  with check (private.has_admin_permission('moderate'));

drop policy if exists "admins can read all parties" on public.parties;
create policy "admins can read all parties"
  on public.parties for select to authenticated
  using (private.has_admin_permission('parties'));

drop policy if exists "admins can delete any party" on public.parties;
create policy "admins can delete any party"
  on public.parties for delete to authenticated
  using (private.has_admin_permission('moderate'));

drop policy if exists "admins can read all invites" on public.party_invites;
create policy "admins can read all invites"
  on public.party_invites for select to authenticated
  using (private.has_admin_permission('invites'));

drop policy if exists "admins can revoke any invite" on public.party_invites;
create policy "admins can revoke any invite"
  on public.party_invites for delete to authenticated
  using (private.has_admin_permission('moderate'));

drop policy if exists "admins can read all attendees" on public.party_attendees;
create policy "admins can read all attendees"
  on public.party_attendees for select to authenticated
  using (private.has_admin_permission('parties'));

drop policy if exists "managers can read admin_users" on public.admin_users;
create policy "managers can read admin_users"
  on public.admin_users for select to authenticated
  using (private.has_admin_permission('manage_admins'));

drop policy if exists "admins can read audit log" on public.admin_audit_log;
create policy "admins can read audit log"
  on public.admin_audit_log for select to authenticated
  using (private.has_admin_permission('audit'));

-- ============================================================================
-- Self-read policy so the app can read its own admin row (drives the UI)
-- ============================================================================

drop policy if exists "admins read own admin row" on public.admin_users;
create policy "admins read own admin row"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- Aggregates -> SECURITY INVOKER, callable only by service_role
-- ============================================================================

create or replace function public.admin_overview_stats()
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
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
set search_path = public, pg_temp
as $$
begin
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
set search_path = public, pg_temp
as $$
begin
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

-- Lock the aggregates to service_role only (the server calls them with the
-- service key after an app-level admin check).
revoke all on function public.admin_overview_stats() from public, anon, authenticated;
revoke all on function public.admin_registrations_daily(integer) from public, anon, authenticated;
revoke all on function public.admin_party_creation_daily(integer) from public, anon, authenticated;
grant execute on function public.admin_overview_stats() to service_role;
grant execute on function public.admin_registrations_daily(integer) to service_role;
grant execute on function public.admin_party_creation_daily(integer) to service_role;

-- ============================================================================
-- Drop functions the app no longer calls over the API
-- ============================================================================

drop function if exists public.is_admin();
drop function if exists public.my_admin_permissions();
drop function if exists public.log_admin_action(text, text, text, jsonb);
drop function if exists public.admin_invite_funnel();
