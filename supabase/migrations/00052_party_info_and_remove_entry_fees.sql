-- Parties now carry concise discovery details. New and edited parties do not
-- expose or accept an entry price. Historical payment rows stay available for
-- settlement and refunds.

alter table public.parties
  add column age_group text check (age_group is null or char_length(age_group) <= 60),
  add column theme text check (theme is null or char_length(theme) <= 80),
  add column music text check (music is null or char_length(music) <= 100),
  add column alcohol_policy text check (
    alcohol_policy is null or alcohol_policy in ('no_alcohol', 'provided', 'bring_your_own')
  ),
  add column dress_code text check (dress_code is null or char_length(dress_code) <= 80),
  add column gender_mix text check (
    gender_mix is null or gender_mix in ('mixed', 'mostly_women', 'mostly_men', 'unknown')
  );

-- Prevent older clients or direct RPC calls from creating a newly paid party.
create or replace function public.force_party_free_entry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.entre_dkk := null;
  return new;
end;
$$;

revoke all on function public.force_party_free_entry() from public, anon, authenticated;

create trigger parties_force_free_entry_on_insert
before insert on public.parties
for each row execute function public.force_party_free_entry();

create trigger parties_force_free_entry_on_price_update
before update of entre_dkk on public.parties
for each row execute function public.force_party_free_entry();

-- Remove ticket prices from existing party listings as well. Payment ledger
-- rows are kept untouched for refunds and payouts already in progress.
update public.parties
set entre_dkk = null
where entre_dkk is not null;

-- Drop the price-taking RPC signatures and replace them with versions that
-- accept party information but have no entry-price parameter.
drop function if exists public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
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
  p_min_age       int,
  p_gender_target text,
  p_postcode      text,
  p_postcode_name text,
  p_postcode_lat  double precision,
  p_postcode_lng  double precision,
  p_age_group     text,
  p_theme         text,
  p_music         text,
  p_alcohol_policy text,
  p_dress_code    text,
  p_gender_mix    text
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
    starts_at, ends_at, visibility, venue_type, capacity,
    min_age, gender_target, postcode, postcode_name, postcode_lat, postcode_lng,
    age_group, theme, music, alcohol_policy, dress_code, gender_mix
  )
  values (
    auth.uid(), p_title, nullif(p_description, ''),
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    nullif(p_address, ''), p_starts_at, p_ends_at, p_visibility, p_venue_type,
    p_capacity, p_min_age, nullif(p_gender_target, ''),
    p_postcode, p_postcode_name, p_postcode_lat, p_postcode_lng,
    nullif(trim(p_age_group), ''), nullif(trim(p_theme), ''),
    nullif(trim(p_music), ''), nullif(p_alcohol_policy, ''),
    nullif(trim(p_dress_code), ''), nullif(p_gender_mix, '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, text, text, text, double precision, double precision,
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, text, text, text, double precision, double precision,
  text, text, text, text, text, text
) to authenticated;

drop function if exists public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, int, text, text, text, double precision, double precision
);

create function public.update_party(
  p_id             uuid,
  p_title          text,
  p_description    text,
  p_lat            double precision,
  p_lng            double precision,
  p_address        text,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_visibility     party_visibility,
  p_venue_type     party_venue_type,
  p_capacity       int,
  p_min_age        int,
  p_gender_target  text,
  p_postcode       text,
  p_postcode_name  text,
  p_postcode_lat   double precision,
  p_postcode_lng   double precision,
  p_age_group      text,
  p_theme          text,
  p_music          text,
  p_alcohol_policy text,
  p_dress_code     text,
  p_gender_mix     text
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
    entre_dkk       = null,
    min_age         = p_min_age,
    gender_target   = nullif(p_gender_target, ''),
    postcode        = coalesce(p_postcode, postcode),
    postcode_name   = coalesce(p_postcode_name, postcode_name),
    postcode_lat    = coalesce(p_postcode_lat, postcode_lat),
    postcode_lng    = coalesce(p_postcode_lng, postcode_lng),
    age_group       = nullif(trim(p_age_group), ''),
    theme           = nullif(trim(p_theme), ''),
    music           = nullif(trim(p_music), ''),
    alcohol_policy  = nullif(p_alcohol_policy, ''),
    dress_code      = nullif(trim(p_dress_code), ''),
    gender_mix      = nullif(p_gender_mix, ''),
    updated_at      = now()
  where id = p_id and host_id = auth.uid();

  if not found then
    raise exception 'Festen kunne ikke gemmes.';
  end if;

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, text, text, text, double precision, double precision,
  text, text, text, text, text, text
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type,
  int, int, text, text, text, double precision, double precision,
  text, text, text, text, text, text
) to authenticated;

drop function if exists public.get_party(uuid);

create function public.get_party(p_id uuid)
returns table (
  id             uuid,
  host_id        uuid,
  title          text,
  description    text,
  address        text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  visibility     party_visibility,
  venue_type     party_venue_type,
  capacity       int,
  min_age        int,
  gender_target  text,
  age_group      text,
  theme          text,
  music          text,
  alcohol_policy text,
  dress_code     text,
  gender_mix     text,
  lon            double precision,
  lat            double precision
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
    p.min_age, p.gender_target, p.age_group, p.theme, p.music,
    p.alcohol_policy, p.dress_code, p.gender_mix,
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
  min_age       int,
  gender_target text,
  age_group     text,
  theme         text,
  music         text,
  alcohol_policy text,
  dress_code    text,
  gender_mix    text,
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
    p.starts_at, p.ends_at, p.visibility, p.venue_type, p.capacity,
    p.min_age, p.gender_target, p.age_group, p.theme, p.music,
    p.alcohol_policy, p.dress_code, p.gender_mix,
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

-- No route or client can start a fresh payment after this migration.
drop function if exists public.create_solo_payment_intent(uuid);
drop function if exists public.create_group_payment_intent(uuid);

notify pgrst, 'reload schema';
