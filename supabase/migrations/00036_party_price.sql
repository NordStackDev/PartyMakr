-- Phase B: an optional entré price per party (whole DKK; null/0 = free). The
-- group leader pays entre_dkk × accepted members via Mollie before the group is
-- confirmed. Free parties keep the Phase-A behaviour (approval confirms at once).

alter table public.parties
  add column entre_dkk int check (entre_dkk is null or entre_dkk >= 0);

-- Column-level SELECT grants are additive, so just add the new column to what
-- 00030 already granted (address/location stay masked via the RPCs below).
grant select (entre_dkk) on public.parties to anon, authenticated;

-- ============================================================================
-- get_party — re-add entre_dkk to the return shape. Return shape changes, so
-- drop + recreate (keeps the 00030 SECURITY DEFINER masking body verbatim).
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
  entre_dkk   int,
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
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity, p.entre_dkk,
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
  where p.id = p_id and private.can_see_party(p.id);
$$;

revoke all on function public.get_party(uuid) from public, anon;
grant execute on function public.get_party(uuid) to authenticated;

-- ============================================================================
-- nearby_parties — re-add entre_dkk (keeps 00030 body + order by distance).
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
  entre_dkk    int,
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
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity, p.entre_dkk,
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
-- create_party / update_party — add a trailing p_entre_dkk. Signature changes,
-- so drop the 00017 (venue_type) signature, recreate, re-grant.
-- ============================================================================

drop function if exists public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
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
  p_capacity    int,
  p_entre_dkk   int
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
    starts_at, ends_at, visibility, venue_type, capacity, entre_dkk
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
    p_capacity,
    p_entre_dkk
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
) to authenticated;

drop function if exists public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int
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
  p_capacity    int,
  p_entre_dkk   int
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
    entre_dkk   = p_entre_dkk,
    updated_at  = now()
  where id = p_id and host_id = auth.uid();

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
) to authenticated;

notify pgrst, 'reload schema';
