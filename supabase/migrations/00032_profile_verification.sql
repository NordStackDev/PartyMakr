-- "Bekræftet person" foundation: hosts should be able to see that a guest is a
-- real human, not a bot. This adds the schema; the write path is the admin
-- server action setVerified() (service-role, gated by the 'moderate'
-- permission + audited — same pattern as ban/flags). The method is flexible
-- (admin now; phone-OTP / signup CAPTCHA can set it later, no schema change).
--
-- The columns are deliberately NOT in the 00031 grant list, so a user cannot
-- self-verify — only the service role writes them. `verified` stays readable
-- by everyone (profiles SELECT is using(true)), so the badge needs no new
-- policy: callers just add `verified` to their existing profiles selects.

alter table public.profiles
  add column verified            boolean not null default false,
  add column verified_at         timestamptz,
  add column verification_method text;
