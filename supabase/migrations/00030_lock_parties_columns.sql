-- SECURITY (H1): parties.address + parties.location leaked via direct select.
--
-- The masking lives only inside get_party/nearby_parties, but those were
-- SECURITY INVOKER and the parties SELECT policy lets any authenticated user
-- read ALL columns of public parties. So `from('parties').select('address,
-- location')` with the public anon key returned the exact street address and
-- coordinates of every party — defeating 00020 entirely.
--
-- Fix: column-level lockdown. In Postgres a table-level SELECT grant lets you
-- read every column, so column grants only bite AFTER the table grant is
-- revoked. Revoke table SELECT, then grant back every column EXCEPT address
-- and location. The masking RPCs become SECURITY DEFINER so they can still
-- read those two columns internally (and must now filter rows themselves,
-- since definer bypasses RLS).

-- ============================================================================
-- Column-level SELECT: everything except address + location
-- ============================================================================

revoke select on public.parties from anon, authenticated;

grant select (
  id, host_id, title, description, starts_at, ends_at,
  visibility, venue_type, capacity, created_at, updated_at
) on public.parties to anon, authenticated;

-- ============================================================================
-- get_party — now SECURITY DEFINER + explicit row visibility (can_see_party).
-- Return shape unchanged, so CREATE OR REPLACE is enough.
-- ============================================================================

create or replace function public.get_party(p_id uuid)
returns table (
  id          uuid,
  host_id     uuid,
  title       text,
  description text,
  address     text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  visibility  party_visibility,
  venue_type  party_venue_type,
  capacity    int,
  lon         double precision,
  lat         double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, p.host_id, p.title, p.description,
    case when priv.ok then p.address else null end as address,
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity,
    case when priv.ok then st_x(p.location::geometry)
         else round(st_x(p.location::geometry)::numeric, 3)::double precision
    end as lon,
    case when priv.ok then st_y(p.location::geometry)
         else round(st_y(p.location::geometry)::numeric, 3)::double precision
    end as lat
  from public.parties p
  cross join lateral (
    select p.host_id = auth.uid()
        or exists (
             select 1 from public.party_attendees a
             where a.party_id = p.id
               and a.user_id = auth.uid()
               and a.status = 'going'
           ) as ok
  ) priv
  -- Definer bypasses RLS, so re-check row visibility explicitly.
  where p.id = p_id and private.can_see_party(p.id);
$$;

-- ============================================================================
-- nearby_parties — same treatment.
-- ============================================================================

create or replace function public.nearby_parties(
  lat       double precision,
  lng       double precision,
  radius_m  integer default 5000
)
returns table (
  id           uuid,
  host_id      uuid,
  title        text,
  description  text,
  address      text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  visibility   party_visibility,
  venue_type   party_venue_type,
  capacity     int,
  going_count  int,
  lon          double precision,
  lat          double precision,
  distance_m   double precision
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id, p.host_id, p.title, p.description,
    case when priv.ok then p.address else null end as address,
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity,
    (
      select count(*)::int
      from public.party_attendees a
      where a.party_id = p.id and a.status = 'going'
    ) as going_count,
    case when priv.ok then st_x(p.location::geometry)
         else round(st_x(p.location::geometry)::numeric, 3)::double precision
    end as lon,
    case when priv.ok then st_y(p.location::geometry)
         else round(st_y(p.location::geometry)::numeric, 3)::double precision
    end as lat,
    st_distance(p.location, st_makepoint(lng, lat)::geography) as distance_m
  from public.parties p
  cross join lateral (
    select p.host_id = auth.uid()
        or exists (
             select 1 from public.party_attendees a
             where a.party_id = p.id
               and a.user_id = auth.uid()
               and a.status = 'going'
           ) as ok
  ) priv
  where st_dwithin(p.location, st_makepoint(lng, lat)::geography, radius_m)
    and (p.ends_at is null or p.ends_at > now())
    and private.can_see_party(p.id)
  order by distance_m asc;
$$;

-- ============================================================================
-- Realtime: drop parties from the publication. Nothing subscribes to it, and
-- the replication stream doesn't honour column grants — so leaving it in would
-- be a side channel back to the same address/location leak.
-- ============================================================================

alter publication supabase_realtime drop table public.parties;

notify pgrst, 'reload schema';
