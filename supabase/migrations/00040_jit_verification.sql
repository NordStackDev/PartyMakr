-- Just-in-time age verification. Rather than locking the whole app behind
-- MitID, we only require verification at the actions that need it:
--   * creating a party (any party) — enforced here in create_party,
--   * joining/paying for an age-restricted party — already enforced by
--     private.qualifies_for_party in the join RLS + group RPCs,
--   * the "verified" badge — set by set_verified_age.
-- So discovery must SHOW age/gender-restricted parties to everyone (you can't
-- buy a ticket to a party you can't see); the gate moves to the join action.

-- ============================================================================
-- nearby_parties — stop hiding parties the caller doesn't qualify for. Show
-- everything visible; qualification is enforced when they try to join. (Same
-- body as 00039 minus the qualifies_for_party filter.)
-- ============================================================================

create or replace function public.nearby_parties(
  lat       double precision,
  lng       double precision,
  radius_m  integer default 5000
)
returns table (
  id            uuid,
  host_id       uuid,
  title         text,
  description   text,
  address       text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  visibility    party_visibility,
  venue_type    party_venue_type,
  capacity      int,
  entre_dkk     int,
  min_age       int,
  gender_target text,
  going_count   int,
  lon           double precision,
  lat           double precision,
  distance_m    double precision
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
    p.min_age, p.gender_target,
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
-- create_party — require the host to be age-verified (18+) via MitID. Same
-- signature/body as 00039 plus the guard. SECURITY INVOKER: the user reads
-- their own profile_age row (RLS allows owner select).
-- ============================================================================

create or replace function public.create_party(
  p_title         text,
  p_description   text,
  p_lat           double precision,
  p_lng           double precision,
  p_address       text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_visibility    party_visibility,
  p_venue_type    party_venue_type,
  p_capacity      int,
  p_entre_dkk     int,
  p_min_age       int,
  p_gender_target text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1 from public.profile_age a
    where a.id = auth.uid()
      and extract(year from age(a.date_of_birth))::int >= 18
  ) then
    raise exception 'Du skal verificere din alder (18+) med MitID for at oprette en fest.';
  end if;

  insert into public.parties (
    host_id, title, description, location, address,
    starts_at, ends_at, visibility, venue_type, capacity, entre_dkk,
    min_age, gender_target
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
    p_entre_dkk,
    p_min_age,
    nullif(p_gender_target, '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

notify pgrst, 'reload schema';
