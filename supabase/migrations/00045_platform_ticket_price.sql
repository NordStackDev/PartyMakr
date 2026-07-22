-- Money model pivot: the platform (not the host) receives all entré payments,
-- and the price is a uniform, platform-set amount (TICKET_PRICE_DKK in env —
-- frozen into parties.entre_dkk at creation, so later price changes don't
-- affect existing parties). Hosts just toggle paid/free. Stripe Connect is
-- gone: no host onboarding, no payout accounts, plain Checkout to the platform.

-- The Connect payout table is no longer used.
drop table if exists public.host_payout_accounts;

-- create_party — drop the payout-account requirement for paid parties (the
-- platform receives the money now). The 18+ verification guard stays.
create or replace function public.create_party(
  p_title         text,
  p_description   text,
  p_lat           double precision,
  p_lng           double precision,
  p_address       text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_visibility    party_visibility,
  p_venue_type    party_venue_type,
  p_capacity      int,
  p_entre_dkk     int,
  p_min_age       int,
  p_gender_target text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1 from public.profile_age a
    where a.id = auth.uid()
      and extract(year from age(a.date_of_birth))::int >= 18
  ) then
    raise exception 'Du skal verificere din alder (18+) med MitID for at oprette en fest.';
  end if;

  insert into public.parties (
    host_id, title, description, location, address,
    starts_at, ends_at, visibility, venue_type, capacity, entre_dkk,
    min_age, gender_target
  )
  values (
    auth.uid(), p_title, nullif(p_description, ''),
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    nullif(p_address, ''), p_starts_at, p_ends_at, p_visibility, p_venue_type,
    p_capacity, p_entre_dkk, p_min_age, nullif(p_gender_target, '')
  )
  returning id into new_id;

  return new_id;
end;
$$;

notify pgrst, 'reload schema';
