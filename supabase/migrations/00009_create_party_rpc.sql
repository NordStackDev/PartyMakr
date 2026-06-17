-- Consumer: create a party with a geographic location.
--
-- Inserting a geography(point) column cleanly is awkward over PostgREST, so we
-- expose a SECURITY INVOKER RPC that builds the point from lat/lng. INVOKER
-- means the existing RLS with-check (host_id = auth.uid()) still applies, and
-- the function sets host_id to the caller itself.

create function public.create_party(
  p_title       text,
  p_description text,
  p_lat         double precision,
  p_lng         double precision,
  p_address     text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_visibility  party_visibility,
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
    starts_at, ends_at, visibility, capacity
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
    p_capacity
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
) to authenticated;

-- ============================================================================
-- get_party: a single party (with lon/lat) by id. SECURITY INVOKER, so the
-- existing parties RLS decides whether the caller may see it.
-- ============================================================================

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
    p.starts_at, p.ends_at, p.visibility, p.capacity,
    st_x(p.location::geometry) as lon,
    st_y(p.location::geometry) as lat
  from public.parties p
  where p.id = p_id;
$$;

revoke all on function public.get_party(uuid) from public, anon;
grant execute on function public.get_party(uuid) to authenticated;
