-- Add a venue type to parties, separate from visibility (public/private).
--
--   own_place   — the host has their own place (at my place / a venue)
--   public_spot — people meet out in the city somewhere (e.g. a street in Aalborg)
--
-- This is independent of visibility/RLS: it only describes where the party is,
-- not who may see it. Existing rows default to 'own_place'.

create type party_venue_type as enum ('own_place', 'public_spot');

alter table public.parties
  add column venue_type party_venue_type not null default 'own_place';

-- ============================================================================
-- create_party — add p_venue_type. Signature changes, so drop + recreate +
-- re-grant (mirrors 00009).
-- ============================================================================

drop function if exists public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
);

create function public.create_party(
  p_title       text,
  p_description text,
  p_lat         double precision,
  p_lng         double precision,
  p_address     text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_visibility  party_visibility,
  p_venue_type  party_venue_type,
  p_capacity    int
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  insert into public.parties (
    host_id, title, description, location, address,
    starts_at, ends_at, visibility, venue_type, capacity
  )
  values (
    auth.uid(),
    p_title,
    nullif(p_description, ''),
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    nullif(p_address, ''),
    p_starts_at,
    p_ends_at,
    p_visibility,
    p_venue_type,
    p_capacity
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
) to authenticated;

-- ============================================================================
-- update_party — add p_venue_type (mirrors 00016).
-- ============================================================================

drop function if exists public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
);

create function public.update_party(
  p_id          uuid,
  p_title       text,
  p_description text,
  p_lat         double precision,
  p_lng         double precision,
  p_address     text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_visibility  party_visibility,
  p_venue_type  party_venue_type,
  p_capacity    int
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.parties set
    title       = p_title,
    description = nullif(p_description, ''),
    location    = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    address     = nullif(p_address, ''),
    starts_at   = p_starts_at,
    ends_at     = p_ends_at,
    visibility  = p_visibility,
    venue_type  = p_venue_type,
    capacity    = p_capacity,
    updated_at  = now()
  where id = p_id and host_id = auth.uid();

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
) to authenticated;

-- ============================================================================
-- get_party — add venue_type to the returned columns (mirrors 00009).
-- ============================================================================

drop function if exists public.get_party(uuid);

create function public.get_party(p_id uuid)
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
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id, p.host_id, p.title, p.description, p.address,
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity,
    st_x(p.location::geometry) as lon,
    st_y(p.location::geometry) as lat
  from public.parties p
  where p.id = p_id;
$$;

revoke all on function public.get_party(uuid) from public, anon;
grant execute on function public.get_party(uuid) to authenticated;

-- ============================================================================
-- nearby_parties — add venue_type to the returned columns (mirrors 00014).
-- ============================================================================

drop function if exists public.nearby_parties(double precision, double precision, integer);

create function public.nearby_parties(
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
security invoker
set search_path = public
as $$
  select
    p.id, p.host_id, p.title, p.description, p.address,
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity,
    (
      select count(*)::int
      from public.party_attendees a
      where a.party_id = p.id and a.status = 'going'
    ) as going_count,
    st_x(p.location::geometry) as lon,
    st_y(p.location::geometry) as lat,
    st_distance(p.location, st_makepoint(lng, lat)::geography) as distance_m
  from public.parties p
  where st_dwithin(
    p.location,
    st_makepoint(lng, lat)::geography,
    radius_m
  )
    and (p.ends_at is null or p.ends_at > now())
  order by distance_m asc;
$$;

-- Let PostgREST pick up the new signatures immediately.
notify pgrst, 'reload schema';
