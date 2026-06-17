-- Security Advisor: "RLS Disabled in Public" on public.spatial_ref_sys
--
-- spatial_ref_sys is PostGIS's coordinate-system reference table. PostGIS
-- creates it in `public`, where PostgREST exposes it, so the advisor flags the
-- missing RLS. Enable RLS and add a read-only policy (the data is harmless
-- public reference data; it just shouldn't be writable through the API).
--
-- The table is occasionally owned by supabase_admin rather than the migration
-- role; in that case ENABLE RLS raises "must be owner". We catch that so the
-- push never hard-fails — if it's skipped, dismiss the advisor note instead.

do $$
begin
  alter table public.spatial_ref_sys enable row level security;

  drop policy if exists "spatial_ref_sys is readable" on public.spatial_ref_sys;
  create policy "spatial_ref_sys is readable"
    on public.spatial_ref_sys for select
    to authenticated, anon
    using (true);
exception
  when insufficient_privilege then
    raise notice
      'Skipping spatial_ref_sys RLS: current role does not own the table.';
end
$$;
