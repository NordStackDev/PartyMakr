-- Persist the public postcode centre used by discovery. Previously the map
-- reverse-geocoded every returned party through DAWA on every fresh browser
-- session, producing an N+1 request waterfall before markers could render.

alter table public.parties
  add column if not exists postcode text,
  add column if not exists postcode_name text,
  add column if not exists postcode_lat double precision,
  add column if not exists postcode_lng double precision;

create index if not exists parties_postcode_idx
  on public.parties (postcode)
  where postcode is not null;

-- These values identify only a town/postcode centre and are safe to expose.
grant select (postcode, postcode_name, postcode_lat, postcode_lng)
  on public.parties to anon, authenticated;

-- create_party: append postcode metadata while preserving all existing age,
-- pricing, privacy and RLS behaviour.
drop function if exists public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text
);

create function public.create_party(
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
  p_gender_target text,
  p_postcode      text,
  p_postcode_name text,
  p_postcode_lat  double precision,
  p_postcode_lng  double precision
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

  if p_postcode !~ '^[0-9]{4}$'
     or nullif(trim(p_postcode_name), '') is null
     or p_postcode_lat is null
     or p_postcode_lng is null then
    raise exception 'Vælg et gyldigt postnummer.';
  end if;

  insert into public.parties (
    host_id, title, description, location, address,
    starts_at, ends_at, visibility, venue_type, capacity, entre_dkk,
    min_age, gender_target, postcode, postcode_name, postcode_lat, postcode_lng
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
    nullif(p_gender_target, ''),
    p_postcode,
    p_postcode_name,
    p_postcode_lat,
    p_postcode_lng
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
) to authenticated;

-- update_party: postcode arguments are optional so editing legacy parties
-- remains compatible when the host does not touch the postcode field.
drop function if exists public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text
);

create function public.update_party(
  p_id            uuid,
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
  p_gender_target text,
  p_postcode      text,
  p_postcode_name text,
  p_postcode_lat  double precision,
  p_postcode_lng  double precision
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_postcode is not null and (
    p_postcode !~ '^[0-9]{4}$'
    or nullif(trim(p_postcode_name), '') is null
    or p_postcode_lat is null
    or p_postcode_lng is null
  ) then
    raise exception 'Vælg et gyldigt postnummer.';
  end if;

  update public.parties set
    title           = p_title,
    description     = nullif(p_description, ''),
    location        = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    address         = nullif(p_address, ''),
    starts_at       = p_starts_at,
    ends_at         = p_ends_at,
    visibility      = p_visibility,
    venue_type      = p_venue_type,
    capacity        = p_capacity,
    entre_dkk       = p_entre_dkk,
    min_age         = p_min_age,
    gender_target   = nullif(p_gender_target, ''),
    postcode        = coalesce(p_postcode, postcode),
    postcode_name   = coalesce(p_postcode_name, postcode_name),
    postcode_lat    = coalesce(p_postcode_lat, postcode_lat),
    postcode_lng    = coalesce(p_postcode_lng, postcode_lng),
    updated_at      = now()
  where id = p_id and host_id = auth.uid();

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
) to authenticated;

-- nearby_parties now returns the already-known public grouping data.
drop function if exists public.nearby_parties(double precision, double precision, integer);

create function public.nearby_parties(
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
  postcode      text,
  postcode_name text,
  postcode_lat  double precision,
  postcode_lng  double precision,
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
    p.postcode, p.postcode_name, p.postcode_lat, p.postcode_lng,
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

revoke all on function public.nearby_parties(double precision, double precision, integer)
  from public, anon;
grant execute on function public.nearby_parties(double precision, double precision, integer)
  to authenticated;

-- One request supplies both persistent navigation badges. RLS continues to
-- scope notifications and threads to the signed-in user.
create or replace function public.nav_badge_counts()
returns table (
  unread_notifications bigint,
  unread_threads bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (
      select count(*)
      from public.notifications n
      where n.user_id = auth.uid() and not n.read
    ) as unread_notifications,
    (
      select count(*)
      from public.party_threads t
      where t.last_message_at >
        case when t.guest_id = auth.uid()
          then t.guest_last_read_at
          else t.host_last_read_at
        end
    ) as unread_threads;
$$;

revoke all on function public.nav_badge_counts() from public, anon;
grant execute on function public.nav_badge_counts() to authenticated;

notify pgrst, 'reload schema';
