-- SECURITY (L1 + L2): lock down which columns a user may UPDATE.
--
-- The "users can update their own profile" and "addressee accepts" RLS
-- policies scope updates to the right ROW but not the right COLUMNS. So a user
-- could clear their own profiles.banned_at (L1), or an addressee could rewrite
-- friendships.requester_id to forge a friendship (L2). Same fix as 00030:
-- revoke table-level UPDATE, then grant back only the safe columns. This also
-- makes the verification columns added in 00032 impossible to self-set.

-- profiles: only the fields src/lib/profile/actions.ts actually writes.
revoke update on public.profiles from authenticated;
grant update (
  username, display_name, bio, avatar_url, search_radius_km, onboarded_at
) on public.profiles to authenticated;

-- friendships: the addressee may change status/responded_at, never the
-- participant ids.
revoke update on public.friendships from authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
