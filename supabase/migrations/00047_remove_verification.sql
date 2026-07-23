-- Let a user remove their own age verification again (GDPR erasure + handy for
-- re-testing). profile_age has no DELETE policy (writes are service-role only),
-- so removal goes through a SECURITY DEFINER RPC scoped to auth.uid().
--
-- Consequence by design: without a verified age the JIT gates re-apply — the
-- user can no longer create parties or join age-restricted ones until they
-- verify again.

create function public.remove_verified_age()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.profile_age where id = auth.uid();

  -- Only clear the verified badge when it came from age verification (mitid /
  -- dev stub) — an admin-granted verification is not the user's to remove.
  update public.profiles
  set verified            = false,
      verified_at         = null,
      verification_method = null
  where id = auth.uid()
    and verification_method in ('mitid', 'stub');
end;
$$;

revoke all on function public.remove_verified_age() from public, anon;
grant execute on function public.remove_verified_age() to authenticated;

notify pgrst, 'reload schema';
