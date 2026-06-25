-- Track whether a user has seen the first-time help guide. NULL = not yet shown
-- (so the guide auto-opens once); set to now() when the user closes it. Stored
-- on the profile so it persists across devices.
--
-- Updated by the user on their own row via the existing
-- "users can update their own profile" policy — no new policy needed.

alter table public.profiles
  add column onboarded_at timestamptz;
