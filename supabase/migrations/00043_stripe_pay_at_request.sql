-- Stripe Connect + pay-at-request.
--
-- Provider swap: MobilePay -> Stripe (Checkout + Connect destination charges,
-- so the entré lands with the HOST, not the platform). Payment timing flips:
--
--   OLD: request -> host approves -> guest pays -> going
--   NEW: guest PAYS when requesting -> host approves (money stays, guest is
--        going) or declines (full refund, handled app-side via Stripe).
--
-- Solo:  checkout at "Anmod og betal" -> mark_solo_paid creates the pending
--        join request (host notified by the existing trigger).
-- Group: leader checks out at "Send til vært og betal" -> mark_group_requested
--        moves the group forming -> requested.
-- Approval then only confirms attendance; declining triggers a refund in the
-- server action (the DB can't call Stripe).

alter table public.party_payments alter column provider set default 'stripe';

-- ============================================================================
-- host_payout_accounts — the host's Stripe Connect (Express) account. Written
-- only by the service role (connect/onboarding server actions + webhook).
-- Owner-only read: account ids aren't secrets, but nobody else needs them.
-- ============================================================================

create table public.host_payout_accounts (
  id                uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled   boolean not null default false,
  details_submitted boolean not null default false,
  updated_at        timestamptz not null default now()
);

alter table public.host_payout_accounts enable row level security;

create policy "owner reads own payout account"
  on public.host_payout_accounts for select
  to authenticated
  using (id = auth.uid());
-- No INSERT/UPDATE/DELETE policies — service role only.

-- ============================================================================
-- create_party — paid parties additionally require a ready payout account
-- (charges_enabled), so guests' money always has somewhere to land. SECURITY
-- INVOKER: the host reads their own rows (both RLS policies allow owner).
-- ============================================================================

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

  if p_entre_dkk is not null and p_entre_dkk > 0 and not exists (
    select 1 from public.host_payout_accounts h
    where h.id = auth.uid() and h.charges_enabled
  ) then
    raise exception 'Tilslut udbetalinger (Stripe) under Indstillinger, før du kan oprette en fest med entré.';
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

-- ============================================================================
-- create_solo_payment_intent — now called at REQUEST time (no join request
-- exists yet). Validates eligibility, fails fast on capacity, and records the
-- pending payment. Returns the reference + authoritative amount.
-- ============================================================================

create or replace function public.create_solo_payment_intent(p_party_id uuid)
returns table (reference uuid, amount_dkk int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_price int;
  v_cap   int;
  v_going int;
  v_ref   uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Du skal være logget ind.';
  end if;
  if not private.can_see_party(p_party_id) then
    raise exception 'Festen findes ikke eller er ikke synlig for dig.';
  end if;
  if private.is_party_host(p_party_id) then
    raise exception 'Værten kan ikke tilmelde sig sin egen fest.';
  end if;
  if not private.qualifies_for_party(p_party_id) then
    raise exception 'Du opfylder ikke festens krav (alder/køn).';
  end if;

  select entre_dkk, capacity into v_price, v_cap
  from public.parties where id = p_party_id;
  if v_price is null or v_price <= 0 then
    raise exception 'Denne fest er gratis — ingen betaling nødvendig.';
  end if;

  if exists (
    select 1 from public.party_attendees
    where party_id = p_party_id and user_id = v_uid and status = 'going'
  ) then
    raise exception 'Du er allerede tilmeldt.';
  end if;
  if exists (
    select 1 from public.party_join_requests
    where party_id = p_party_id and user_id = v_uid and status = 'pending'
  ) then
    raise exception 'Du har allerede en anmodning, der afventer værten.';
  end if;

  -- Fail fast before taking money (settle + approval re-check for races).
  select count(*) into v_going
  from public.party_attendees
  where party_id = p_party_id and status = 'going';
  if v_cap is not null and v_going + 1 > v_cap then
    raise exception 'Festen er fuld.';
  end if;

  delete from public.party_payments
  where party_id = p_party_id and payer_id = v_uid
    and group_id is null and status = 'pending';

  insert into public.party_payments
    (group_id, party_id, payer_id, amount_dkk, reference, status)
  values (null, p_party_id, v_uid, v_price, v_ref, 'pending');

  reference := v_ref;
  amount_dkk := v_price;
  return next;
end;
$$;

-- ============================================================================
-- mark_solo_paid — payment landed: complete the payment row and create the
-- PENDING join request (the 00019 trigger notifies the host). The guest only
-- becomes 'going' when the host approves. Capacity race -> 'capacity_full'
-- (caller refunds at Stripe).
-- ============================================================================

create or replace function public.mark_solo_paid(p_reference uuid, p_provider_ref text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay   party_payments%rowtype;
  v_cap   int;
  v_going int;
begin
  select * into v_pay
  from public.party_payments
  where reference = p_reference and group_id is null
  for update;
  if v_pay.id is null then
    return 'missing';
  end if;
  if v_pay.status = 'completed' then
    return 'already';
  end if;

  select capacity into v_cap from public.parties where id = v_pay.party_id;
  select count(*) into v_going
  from public.party_attendees
  where party_id = v_pay.party_id and status = 'going';
  if v_cap is not null and v_going + 1 > v_cap then
    update public.party_payments
    set status = 'refunded', provider_ref = p_provider_ref
    where id = v_pay.id;
    return 'capacity_full';
  end if;

  update public.party_payments
  set status = 'completed', provider_ref = p_provider_ref, completed_at = now()
  where id = v_pay.id;

  -- A stale declined row blocks the PK — clear it, then file the request.
  delete from public.party_join_requests
  where party_id = v_pay.party_id and user_id = v_pay.payer_id
    and status = 'declined';
  insert into public.party_join_requests (party_id, user_id)
  values (v_pay.party_id, v_pay.payer_id)
  on conflict (party_id, user_id) do nothing;

  return 'paid';
end;
$$;

-- ============================================================================
-- create_group_payment_intent — now called at SUBMIT time: group must be
-- forming with at least one accepted friend. Amount = entré × accepted members.
-- ============================================================================

create or replace function public.create_group_payment_intent(p_group_id uuid)
returns table (reference uuid, amount_dkk int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_party  uuid;
  v_leader uuid;
  v_status party_group_status;
  v_price  int;
  v_cap    int;
  v_going  int;
  v_size   int;
  v_others int;
  v_ref    uuid := gen_random_uuid();
  v_amount int;
begin
  select party_id, leader_id, status into v_party, v_leader, v_status
  from public.party_groups where id = p_group_id;
  if v_party is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_leader <> v_uid then
    raise exception 'Kun gruppens leder kan betale.';
  end if;
  if v_status <> 'forming' then
    raise exception 'Gruppen er allerede sendt til værten.';
  end if;

  select count(*) into v_others
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted' and user_id <> v_uid;
  if v_others < 1 then
    raise exception 'Mindst én ven skal have accepteret, før gruppen kan sendes.';
  end if;

  select entre_dkk, capacity into v_price, v_cap
  from public.parties where id = v_party;
  if v_price is null or v_price <= 0 then
    raise exception 'Denne fest er gratis — brug Send til vært.';
  end if;

  select count(*) into v_size
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted';

  select count(*) into v_going
  from public.party_attendees
  where party_id = v_party and status = 'going';
  if v_cap is not null and v_going + v_size > v_cap then
    raise exception 'Festen har ikke plads til hele gruppen (% pladser tilbage).',
      greatest(v_cap - v_going, 0);
  end if;

  v_amount := v_price * v_size;

  delete from public.party_payments
  where group_id = p_group_id and status = 'pending';

  insert into public.party_payments
    (group_id, party_id, payer_id, amount_dkk, reference, status)
  values (p_group_id, v_party, v_uid, v_amount, v_ref, 'pending');

  reference := v_ref;
  amount_dkk := v_amount;
  return next;
end;
$$;

-- ============================================================================
-- mark_group_requested — group payment landed: complete the payment and move
-- the group forming -> requested (the 00035 trigger notifies the host).
-- ============================================================================

create function public.mark_group_requested(
  p_group_id     uuid,
  p_reference    uuid,
  p_provider_ref text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay    party_payments%rowtype;
  v_status party_group_status;
  v_party  uuid;
  v_cap    int;
  v_going  int;
  v_size   int;
begin
  select party_id, status into v_party, v_status
  from public.party_groups where id = p_group_id for update;
  if v_party is null then
    return 'missing';
  end if;

  select * into v_pay
  from public.party_payments
  where group_id = p_group_id and reference = p_reference
  for update;
  if v_pay.id is null then
    return 'missing';
  end if;
  if v_pay.status = 'completed' then
    return 'already';
  end if;

  select count(*) into v_size
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted';
  select capacity into v_cap from public.parties where id = v_party;
  select count(*) into v_going
  from public.party_attendees
  where party_id = v_party and status = 'going';
  if v_cap is not null and v_going + v_size > v_cap then
    update public.party_payments
    set status = 'refunded', provider_ref = p_provider_ref
    where id = v_pay.id;
    return 'capacity_full';
  end if;

  update public.party_payments
  set status = 'completed', provider_ref = p_provider_ref, completed_at = now()
  where id = v_pay.id;

  if v_status = 'forming' then
    update public.party_groups
    set status = 'requested', requested_at = now()
    where id = p_group_id;
  end if;

  return 'paid';
end;
$$;

revoke all on function public.mark_group_requested(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_group_requested(uuid, uuid, text) to service_role;

-- ============================================================================
-- submit_group — free parties only now; paid groups are submitted by paying.
-- ============================================================================

create or replace function public.submit_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid             uuid := auth.uid();
  v_leader          uuid;
  v_party           uuid;
  v_status          party_group_status;
  v_price           int;
  v_others_total    int;
  v_others_accepted int;
begin
  select leader_id, party_id, status into v_leader, v_party, v_status
  from public.party_groups where id = p_group_id for update;

  if v_leader is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_leader <> v_uid then
    raise exception 'Kun gruppens leder kan sende den til værten.';
  end if;
  if v_status <> 'forming' then
    return;
  end if;

  select entre_dkk into v_price from public.parties where id = v_party;
  if v_price is not null and v_price > 0 then
    raise exception 'Denne fest har entré — gruppen sendes ved at betale.';
  end if;

  select
    count(*),
    count(*) filter (where status = 'accepted')
  into v_others_total, v_others_accepted
  from public.party_group_members
  where group_id = p_group_id and user_id <> v_uid;

  if v_others_total > 0 and v_others_accepted < 1 then
    raise exception 'Mindst én ven skal have accepteret, før gruppen kan sendes.';
  end if;

  update public.party_groups
  set status = 'requested', requested_at = now()
  where id = p_group_id;
end;
$$;

-- ============================================================================
-- respond_join_request — approval now CONFIRMS a prepaid guest. On a paid
-- party, accept requires a completed payment (it exists by construction, since
-- the request is only created by mark_solo_paid). Declining just declines —
-- the server action issues the Stripe refund and marks the payment.
-- ============================================================================

create or replace function public.respond_join_request(
  p_party_id uuid,
  p_user_id  uuid,
  p_accept   boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host   uuid;
  v_status invite_status;
  v_price  int;
  v_cap    int;
  v_going  int;
begin
  select host_id, entre_dkk, capacity into v_host, v_price, v_cap
  from public.parties where id = p_party_id;
  if v_host is null or v_host <> auth.uid() then
    raise exception 'Kun værten kan besvare anmodninger.';
  end if;

  select status into v_status
  from public.party_join_requests
  where party_id = p_party_id and user_id = p_user_id
  for update;
  if v_status is null then
    raise exception 'Anmodningen findes ikke.';
  end if;
  if v_status <> 'pending' then
    return;
  end if;

  if p_accept then
    if v_price is not null and v_price > 0 and not exists (
      select 1 from public.party_payments
      where party_id = p_party_id and payer_id = p_user_id
        and group_id is null and status = 'completed'
    ) then
      raise exception 'Gæsten har ikke betalt endnu.';
    end if;

    select count(*) into v_going
    from public.party_attendees
    where party_id = p_party_id and status = 'going';
    if v_cap is not null and v_going + 1 > v_cap then
      raise exception 'Festen er fuld — afvis anmodningen, så gæsten refunderes.';
    end if;
  end if;

  update public.party_join_requests
  set status       = case when p_accept then 'accepted'::invite_status
                          else 'declined'::invite_status end,
      responded_at = now()
  where party_id = p_party_id and user_id = p_user_id;

  if p_accept then
    perform set_config('partymakr.skip_rsvp_notify', '1', true);
    insert into public.party_attendees (party_id, user_id, status)
    values (p_party_id, p_user_id, 'going')
    on conflict (party_id, user_id) do update set status = 'going';
    perform set_config('partymakr.skip_rsvp_notify', '', true);
  end if;
end;
$$;

-- ============================================================================
-- respond_group_request — approving a prepaid group fans it out immediately
-- (payment already done); free groups keep the Phase-A behaviour. Declining
-- just declines — the refund happens app-side.
-- ============================================================================

create or replace function public.respond_group_request(p_group_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party  uuid;
  v_status party_group_status;
  v_cap    int;
  v_going  int;
  v_size   int;
  v_price  int;
begin
  select party_id, status into v_party, v_status
  from public.party_groups where id = p_group_id for update;

  if v_party is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if not private.is_party_host(v_party) then
    raise exception 'Kun værten kan besvare gruppeanmodninger.';
  end if;
  if v_status <> 'requested' then
    return;
  end if;

  if not p_accept then
    update public.party_groups set status = 'declined' where id = p_group_id;
    return;
  end if;

  select entre_dkk into v_price from public.parties where id = v_party;
  if v_price is not null and v_price > 0 and not exists (
    select 1 from public.party_payments
    where group_id = p_group_id and status = 'completed'
  ) then
    raise exception 'Gruppen har ikke betalt endnu.';
  end if;

  select count(*) into v_size
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted';
  select capacity into v_cap from public.parties where id = v_party;
  select count(*) into v_going
  from public.party_attendees
  where party_id = v_party and status = 'going';
  if v_cap is not null and v_going + v_size > v_cap then
    raise exception 'Festen har ikke plads til gruppen — afvis, så lederen refunderes.';
  end if;

  perform private.fan_out_group(p_group_id);

  update public.party_groups
  set status = 'paid', approved_at = now(), paid_at = now()
  where id = p_group_id;
end;
$$;

-- ============================================================================
-- Join-request RLS — clients may only file FREE requests themselves; on paid
-- parties the request is created by mark_solo_paid (SECURITY DEFINER bypasses
-- RLS) once the money has landed. Re-adds the free-only guard 00039 dropped.
-- ============================================================================

drop policy if exists "users can request to join parties they qualify for" on public.party_join_requests;
create policy "users can request to join parties they qualify for"
  on public.party_join_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and private.can_see_party(party_id)
    and not private.is_party_host(party_id)
    and private.qualifies_for_party(party_id)
    and not exists (
      select 1 from public.parties p
      where p.id = party_id and coalesce(p.entre_dkk, 0) > 0
    )
  );

-- ============================================================================
-- mark_payment_refunded — bookkeeping after an app-side Stripe refund
-- (decline / withdraw / cancel). Service role only.
-- ============================================================================

create function public.mark_payment_refunded(p_reference uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.party_payments
  set status = 'refunded'
  where reference = p_reference and status in ('pending', 'completed');
end;
$$;

revoke all on function public.mark_payment_refunded(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_payment_refunded(uuid) to service_role;

notify pgrst, 'reload schema';
