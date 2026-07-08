-- Default search radius: 25 km -> 250 km. Better to show every party than to
-- make a new user in a quiet area believe there are none.

alter table public.profiles
  alter column search_radius_km set default 250;

-- Existing rows still on the old default follow along. Anyone who has moved
-- the slider away from 25 keeps their choice.
update public.profiles
  set search_radius_km = 250
  where search_radius_km = 25;
