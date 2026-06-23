-- Consumer: edit a party. Mirrors create_party — a SECURITY INVOKER RPC so the
-- existing "hosts can update their parties" RLS policy (host_id = auth.uid())
-- decides what may change, while the function rebuilds the geography point.

create function public.update_party(
  p_id          uuid,
  p_title       text,
  p_description text,
  p_lat         double precision,
  p_lng         double precision,
  p_address     text,
  p_starts_at   timestamptz,
  p_ends_at     timestamptz,
  p_visibility  party_visibility,
  p_capacity    int
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  update public.parties set
    title       = p_title,
    description = nullif(p_description, ''),
    location    = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    address     = nullif(p_address, ''),
    starts_at   = p_starts_at,
    ends_at     = p_ends_at,
    visibility  = p_visibility,
    capacity    = p_capacity,
    updated_at  = now()
  where id = p_id and host_id = auth.uid();

  return p_id;
end;
$$;

revoke all on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
) from public, anon;
grant execute on function public.update_party(
  uuid, text, text, double precision, double precision, text,
  timestamptz, timestamptz, party_visibility, int
) to authenticated;

notify pgrst, 'reload schema';
