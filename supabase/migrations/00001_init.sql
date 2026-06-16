-- PartyMakr initial schema
-- Map-first party discovery: profiles, parties (public/private), invites, attendees.

-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists postgis;

-- ============================================================================
-- Enums
-- ============================================================================

create type party_visibility as enum ('public', 'private');
create type invite_status   as enum ('pending', 'accepted', 'declined');
create type rsvp_status     as enum ('going', 'interested', 'maybe');

-- ============================================================================
-- profiles  (extends auth.users)
-- ============================================================================

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  bio          text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Create a profile row whenever a new auth user is created.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- parties
-- ============================================================================

create table public.parties (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  description  text,
  -- WGS84 lon/lat as a geography point; enables PostGIS distance queries.
  location     geography(point, 4326) not null,
  address      text,
  starts_at    timestamptz not null,
  ends_at      timestamptz,
  visibility   party_visibility not null default 'public',
  capacity     int check (capacity is null or capacity > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create index parties_location_gix on public.parties using gist (location);
create index parties_starts_at_idx on public.parties (starts_at);
create index parties_host_idx on public.parties (host_id);

-- ============================================================================
-- party_invites  (only used for private parties)
-- ============================================================================

create table public.party_invites (
  party_id    uuid not null references public.parties(id) on delete cascade,
  invitee_id  uuid not null references public.profiles(id) on delete cascade,
  status      invite_status not null default 'pending',
  invited_at  timestamptz not null default now(),
  responded_at timestamptz,
  primary key (party_id, invitee_id)
);

create index party_invites_invitee_idx on public.party_invites (invitee_id);

-- ============================================================================
-- party_attendees  (RSVPs for public parties)
-- ============================================================================

create table public.party_attendees (
  party_id    uuid not null references public.parties(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      rsvp_status not null default 'going',
  rsvp_at     timestamptz not null default now(),
  primary key (party_id, user_id)
);

create index party_attendees_user_idx on public.party_attendees (user_id);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

create function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger parties_set_updated_at
  before update on public.parties
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row-Level Security
-- ============================================================================

alter table public.profiles        enable row level security;
alter table public.parties         enable row level security;
alter table public.party_invites   enable row level security;
alter table public.party_attendees enable row level security;

-- profiles: anyone authenticated can read; only owner can update.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- parties:
--   read: public parties visible to all authed users;
--         private parties visible to host + pending/accepted invitees.
create policy "public parties are readable"
  on public.parties for select
  to authenticated
  using (
    visibility = 'public'
    or host_id = auth.uid()
    or exists (
      select 1 from public.party_invites pi
      where pi.party_id = parties.id and pi.invitee_id = auth.uid()
    )
  );

create policy "users can create parties as themselves"
  on public.parties for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "hosts can update their parties"
  on public.parties for update
  to authenticated
  using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "hosts can delete their parties"
  on public.parties for delete
  to authenticated
  using (host_id = auth.uid());

-- party_invites: host and invitee can see; host can insert/update/delete;
--                invitee can update their own response status.
create policy "host or invitee can read invites"
  on public.party_invites for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or exists (
      select 1 from public.parties p
      where p.id = party_invites.party_id and p.host_id = auth.uid()
    )
  );

create policy "host can invite people"
  on public.party_invites for insert
  to authenticated
  with check (
    exists (
      select 1 from public.parties p
      where p.id = party_invites.party_id and p.host_id = auth.uid()
    )
  );

create policy "invitee can respond"
  on public.party_invites for update
  to authenticated
  using (invitee_id = auth.uid()) with check (invitee_id = auth.uid());

create policy "host can revoke invites"
  on public.party_invites for delete
  to authenticated
  using (
    exists (
      select 1 from public.parties p
      where p.id = party_invites.party_id and p.host_id = auth.uid()
    )
  );

-- party_attendees: anyone who can see the party can see its attendees;
--                  users manage their own RSVP.
create policy "attendees are readable if party is readable"
  on public.party_attendees for select
  to authenticated
  using (
    exists (select 1 from public.parties p where p.id = party_attendees.party_id)
  );

create policy "users can rsvp for themselves"
  on public.party_attendees for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can change their own rsvp"
  on public.party_attendees for update
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users can withdraw their own rsvp"
  on public.party_attendees for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- RPC: nearby_parties
-- Returns parties within `radius_m` metres of (lat, lng), respecting RLS.
-- Call from the client: supabase.rpc('nearby_parties', { lat, lng, radius_m })
-- ============================================================================

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
  capacity     int,
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
