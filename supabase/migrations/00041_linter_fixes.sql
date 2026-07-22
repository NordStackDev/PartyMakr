-- Supabase security-linter fixes (2026-07).
--
-- 1. private.is_suspicious_message had a role-mutable search_path.
-- 2. The public `avatars` bucket had a broad SELECT policy on storage.objects,
--    letting any client list every file in the bucket.
-- 3. public.nearby_parties (SECURITY DEFINER) was executable by `anon` — the
--    map lives behind /dashboard which redirects logged-out users, so only
--    `authenticated` ever needs it.
-- 4. PostGIS ships public.st_estimatedextent as SECURITY DEFINER with EXECUTE
--    granted to PUBLIC, exposing it over /rest/v1/rpc. Nothing in the app
--    calls it through the API.
--
-- Not fixable here (see the linter report):
-- - `extension_in_public` (postgis): postgis is not relocatable — moving it
--   means dropping and recreating the extension, which would drop the
--   parties.location geography column. Accepted as-is.
-- - `authenticated_security_definer_function_executable` on the app RPCs
--   (get_party, submit_group, send_party_message, …): intentional. They are
--   the app's API surface and each validates auth.uid() internally.
-- - `auth_leaked_password_protection`: a dashboard toggle, not SQL.

-- ============================================================================
-- 1. Pin search_path on private.is_suspicious_message
-- ============================================================================
-- The function only uses regex operators (pg_catalog is always searched), so
-- an empty search_path is safe.

alter function private.is_suspicious_message(text) set search_path = '';

-- ============================================================================
-- 2. avatars bucket: stop anonymous listing, keep owner listing
-- ============================================================================
-- Public buckets serve objects via their public URL without any SELECT policy,
-- so reads of avatar images are unaffected. The avatar uploader, however,
-- calls storage.list(<uid>) and storage.remove(...) — both need SELECT on the
-- user's own folder — so the broad policy is narrowed, not just dropped.

drop policy "Avatar images are publicly readable" on storage.objects;

create policy "Users can list their own avatar folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================================
-- 3. nearby_parties: authenticated only
-- ============================================================================
-- Grants survive `create or replace`, but a future `drop function` +
-- `create function` resets EXECUTE to PUBLIC — re-apply this there.

revoke all on function public.nearby_parties(double precision, double precision, integer)
  from public, anon;
grant execute on function public.nearby_parties(double precision, double precision, integer)
  to authenticated;

-- ============================================================================
-- 4. st_estimatedextent: not callable over the API
-- ============================================================================

revoke all on function public.st_estimatedextent(text, text)
  from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text)
  from public, anon, authenticated;
revoke all on function public.st_estimatedextent(text, text, text, boolean)
  from public, anon, authenticated;
