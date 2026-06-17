-- Security Advisor: SECURITY DEFINER function executable by anon/authenticated
--
-- public.rls_auto_enable() is NOT part of this app's migrations — it was added
-- out of band (likely a pasted "auto-enable RLS" snippet). Until its purpose is
-- confirmed, revoke API execute so it can't be called over PostgREST by anon or
-- signed-in users. (If it backs an event trigger, that keeps working — triggers
-- fire regardless of EXECUTE grants.) Wrapped so the push is a no-op if it's
-- already gone.

do $$
begin
  revoke all on function public.rls_auto_enable() from public, anon, authenticated;
exception
  when undefined_function then
    raise notice 'rls_auto_enable() not found; nothing to revoke.';
end
$$;
