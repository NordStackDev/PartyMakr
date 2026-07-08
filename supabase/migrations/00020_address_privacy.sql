-- Address privacy: the street address (and the exact point) belongs to the
-- host and APPROVED guests only. Everyone else gets address = null and
-- coordinates rounded to ~3 decimals (~100 m) — matching the discovery map's
-- fuzzing, so the party-page mini map still shows the area but never the house.
--
-- Return types are unchanged, so CREATE OR REPLACE suffices (no re-grants).

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
security invoker
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
  where p.id = p_id;
$$;

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
security invoker
set search_path = public
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
  where st_dwithin(
    p.location,
    st_makepoint(lng, lat)::geography,
    radius_m
  )
    and (p.ends_at is null or p.ends_at > now())
  order by distance_m asc;
$$;

notify pgrst, 'reload schema';
