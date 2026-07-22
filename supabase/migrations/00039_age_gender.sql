-- Age + gender. Gender is self-set on the profile. Age is VERIFIED (MitID via a
-- broker later; a stub sets it for now) and stored as a birthdate in a separate
-- owner-only table — we keep only the date of birth, never the CPR number, and
-- expose only the derived age. Parties can require a minimum age and/or target a
-- gender; the discovery RPC hides parties the caller doesn't qualify for.

-- ============================================================================
-- profiles.gender (self-set) + parties audience columns
-- ============================================================================

alter table public.profiles
  add column gender text
    check (gender is null or gender in ('male', 'female', 'other'));

-- Additive to 00031's grant so updateSettings can write it.
grant update (gender) on public.profiles to authenticated;

alter table public.parties
  add column min_age int
    check (min_age is null or (min_age between 0 and 120)),
  add column gender_target text
    check (gender_target is null or gender_target in ('male', 'female', 'other'));

-- Readable by the client (additive to 00030's column grant).
grant select (min_age, gender_target) on public.parties to anon, authenticated;

-- ============================================================================
-- profile_age — verified birthdate, readable only by the owner (and admins).
-- Written only by set_verified_age (service role / verification callback).
-- ============================================================================

create table public.profile_age (
  id            uuid primary key references public.profiles(id) on delete cascade,
  date_of_birth date not null,
  verified_at   timestamptz not null default now(),
  method        text not null default 'mitid'
);

alter table public.profile_age enable row level security;

create policy "owner reads own age"
  on public.profile_age for select
  to authenticated
  using (id = auth.uid());

create policy "admins read age"
  on public.profile_age for select
  to authenticated
  using (private.has_admin_permission('users'));
-- No INSERT/UPDATE/DELETE policies — writes go through set_verified_age only.

-- ============================================================================
-- Helpers (SECURITY DEFINER, private) — age math + party qualification, so the
-- discovery RPC and RLS never expose birthdates to the caller.
-- ============================================================================

create function private.qualifies_for_party(p_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select
      (p.host_id = auth.uid())
      or (
        (p.min_age is null or exists (
          select 1 from public.profile_age a
          where a.id = auth.uid()
            and extract(year from age(a.date_of_birth))::int >= p.min_age
        ))
        and (p.gender_target is null or p.gender_target = (
          select pr.gender from public.profiles pr where pr.id = auth.uid()
        ))
      )
    from public.parties p
    where p.id = p_party_id
  ), false);
$$;

revoke all on function private.qualifies_for_party(uuid) from public, anon;
grant execute on function private.qualifies_for_party(uuid) to authenticated;

-- Public: a profile's age for display (never the birthdate itself).
create function public.get_profile_age(p_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when a.date_of_birth is null then null
              else extract(year from age(a.date_of_birth))::int end
  from public.profile_age a
  where a.id = p_id;
$$;

revoke all on function public.get_profile_age(uuid) from public, anon;
grant execute on function public.get_profile_age(uuid) to authenticated;

-- ============================================================================
-- set_verified_age — store a verified birthdate and mark the person verified.
-- Called by the verification callback (real MitID) or the dev stub, both via
-- the service role.
-- ============================================================================

create function public.set_verified_age(p_uid uuid, p_dob date, p_method text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profile_age (id, date_of_birth, verified_at, method)
  values (p_uid, p_dob, now(), coalesce(p_method, 'mitid'))
  on conflict (id) do update
    set date_of_birth = excluded.date_of_birth,
        verified_at   = now(),
        method        = excluded.method;

  update public.profiles
  set verified            = true,
      verified_at         = now(),
      verification_method = coalesce(p_method, 'mitid')
  where id = p_uid;
end;
$$;

revoke all on function public.set_verified_age(uuid, date, text)
  from public, anon, authenticated;
grant execute on function public.set_verified_age(uuid, date, text) to service_role;

-- ============================================================================
-- Block join requests from users who don't meet the party's age/gender rules.
-- ============================================================================

-- Drop whatever insert policy currently exists (name has varied across
-- iterations) and replace it with the age/gender-qualified one.
drop policy if exists "users can request to join visible parties" on public.party_join_requests;
drop policy if exists "users can request to join visible free parties" on public.party_join_requests;
drop policy if exists "users can request to join parties they qualify for" on public.party_join_requests;
create policy "users can request to join parties they qualify for"
  on public.party_join_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and private.can_see_party(party_id)
    and not private.is_party_host(party_id)
    and private.qualifies_for_party(party_id)
  );

-- ============================================================================
-- get_party — add min_age + gender_target (keeps the 00036 masking body).
-- ============================================================================

drop function if exists public.get_party(uuid);

create function public.get_party(p_id uuid)
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
  lon           double precision,
  lat           double precision
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
-- nearby_parties — add the fields AND hide parties the caller doesn't qualify
-- for (age + gender). Hosts always see their own.
-- ============================================================================

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
    and private.qualifies_for_party(p.id)
  order by distance_m asc;
$$;

-- ============================================================================
-- create_party / update_party — add p_min_age + p_gender_target (drops the
-- 00036 signature, recreates, re-grants).
-- ============================================================================

drop function if exists public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
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

revoke all on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int, int, text
) from public, anon;
grant execute on function public.create_party(
  text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int, int, text
) to authenticated;

drop function if exists public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int
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
  p_gender_target text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.parties set
    title         = p_title,
    description   = nullif(p_description, ''),
    location      = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    address       = nullif(p_address, ''),
    starts_at     = p_starts_at,
    ends_at       = p_ends_at,
    visibility    = p_visibility,
    venue_type    = p_venue_type,
    capacity      = p_capacity,
    entre_dkk     = p_entre_dkk,
    min_age       = p_min_age,
    gender_target = nullif(p_gender_target, ''),
    updated_at    = now()
  where id = p_id and host_id = auth.uid();

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int, int, text
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, party_venue_type, int, int, int, text
) to authenticated;

-- ============================================================================
-- Group flow: enforce the party's age/gender rules too — the leader at group
-- creation, each invited friend at accept. (Same body as 00034 + one guard.)
-- ============================================================================

create or replace function public.create_group_with_invites(
  p_party_id   uuid,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_group     uuid;
  v_requested int;
  v_valid     int;
begin
  if v_uid is null then
    raise exception 'Du skal være logget ind.';
  end if;
  if not private.can_see_party(p_party_id) then
    raise exception 'Festen findes ikke eller er ikke synlig for dig.';
  end if;
  if private.is_party_host(p_party_id) then
    raise exception 'Værten kan ikke tilmelde sig sin egen fest som gæst.';
  end if;
  if not private.qualifies_for_party(p_party_id) then
    raise exception 'Du opfylder ikke festens krav (alder/køn).';
  end if;
  if exists (
    select 1 from public.party_groups
    where party_id = p_party_id and leader_id = v_uid
      and status in ('forming', 'requested', 'approved')
  ) then
    raise exception 'Du har allerede en aktiv tilmelding til denne fest.';
  end if;

  select count(*) into v_requested
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s;
  if v_requested = 0 then
    raise exception 'Vælg mindst én ven at invitere.';
  end if;

  select count(*) into v_valid
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s
  where exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_uid and f.addressee_id = s.id)
        or (f.addressee_id = v_uid and f.requester_id = s.id))
  );
  if v_valid <> v_requested then
    raise exception 'Du kan kun invitere venner du er forbundet med.';
  end if;

  insert into public.party_groups (party_id, leader_id, status)
  values (p_party_id, v_uid, 'forming')
  returning id into v_group;

  insert into public.party_group_members (group_id, user_id, status, responded_at)
  values (v_group, v_uid, 'accepted', now());

  insert into public.party_group_members (group_id, user_id, status)
  select v_group, s.id, 'pending'
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s;

  return v_group;
end;
$$;

create or replace function public.respond_group_invite(p_group_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_gstatus party_group_status;
  v_status  invite_status;
  v_party   uuid;
begin
  select status, party_id into v_gstatus, v_party
  from public.party_groups where id = p_group_id;
  if v_gstatus is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_gstatus <> 'forming' then
    return;
  end if;

  select status into v_status
  from public.party_group_members
  where group_id = p_group_id and user_id = v_uid
  for update;

  if v_status is null then
    raise exception 'Du er ikke inviteret til denne gruppe.';
  end if;
  if v_status <> 'pending' then
    return;
  end if;

  if p_accept and not private.qualifies_for_party(v_party) then
    raise exception 'Du opfylder ikke festens krav (alder/køn).';
  end if;

  update public.party_group_members
  set status       = case when p_accept then 'accepted'::invite_status
                          else 'declined'::invite_status end,
      responded_at = now()
  where group_id = p_group_id and user_id = v_uid;
end;
$$;

notify pgrst, 'reload schema';
