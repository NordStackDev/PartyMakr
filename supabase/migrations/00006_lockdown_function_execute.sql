-- Security Advisor: "Public/Signed-in Can Execute SECURITY DEFINER Function"
--
-- Remove anon (logged-out) and PUBLIC execute on our SECURITY DEFINER
-- functions so they can only be called by signed-in users — and only do
-- anything for admins, thanks to each function's internal is_admin() /
-- has_admin_permission() guard.
--
-- handle_new_user is a trigger function: nothing should call it over the API,
-- and triggers fire regardless of EXECUTE grants, so we revoke it from
-- everyone (the trigger keeps working).
--
-- The remaining "authenticated can execute" notices for the admin RPCs are
-- intentional: the app (and RLS policies) call them as the signed-in user and
-- they self-authorize. Those are safe to dismiss in the advisor.

-- Trigger function: not an API endpoint.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Permission helpers — needed by authenticated (app + RLS policies), never anon.
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.has_admin_permission(text) from public, anon;
grant execute on function public.has_admin_permission(text) to authenticated;

revoke all on function public.my_admin_permissions() from public, anon;
grant execute on function public.my_admin_permissions() to authenticated;

revoke all on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- Aggregate RPCs — called by admins via the signed-in session; self-guarded.
revoke all on function public.admin_overview_stats() from public, anon;
grant execute on function public.admin_overview_stats() to authenticated;

revoke all on function public.admin_registrations_daily(integer) from public, anon;
grant execute on function public.admin_registrations_daily(integer) to authenticated;

revoke all on function public.admin_party_creation_daily(integer) from public, anon;
grant execute on function public.admin_party_creation_daily(integer) to authenticated;

revoke all on function public.admin_invite_funnel() from public, anon;
grant execute on function public.admin_invite_funnel() to authenticated;
