-- Add a `going_count` to nearby_parties so the map can colour each party by how
-- full it is (green = room, orange = almost full, red = full).
--
-- Still SECURITY INVOKER: parties are filtered by the caller's RLS, and the
-- attendee count uses the attendees SELECT policy (which calls the SECURITY
-- DEFINER private.can_see_party, so there's no RLS recursion). The count is just
-- a number — no attendee identities are exposed.

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
    p.starts_at, p.ends_at, p.visibility, p.capacity,
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

-- Let PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';
