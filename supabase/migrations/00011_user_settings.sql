-- User settings: search radius for party discovery (km).

alter table public.profiles
  add column search_radius_km int not null default 25
  check (search_radius_km between 1 and 500);
