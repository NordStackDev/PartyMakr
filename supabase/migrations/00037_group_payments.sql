-- Phase B: payments for paid parties (via Mollie). Flow:
--   host approves group  -> respond_group_request sets 'approved' (if price > 0)
--   leader pays           -> create_group_payment_intent -> Mollie checkout
--   Mollie confirms       -> webhook -> mark_group_paid -> fan-out -> 'paid'
-- Free parties (entre_dkk null/0) skip payment entirely (approval = confirmed).

create type payment_status as enum ('pending', 'completed', 'failed', 'refunded');

create table public.party_payments (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.party_groups(id) on delete cascade,
  party_id     uuid not null references public.parties(id) on delete cascade,
  payer_id     uuid not null references public.profiles(id) on delete cascade,
  amount_dkk   int not null check (amount_dkk > 0),
  provider     text not null default 'mollie',
  -- Our idempotency key, passed to Mollie as metadata and matched on the webhook.
  reference    uuid not null unique,
  -- The Mollie payment id (tr_...), stored once known.
  provider_ref text,
  status       payment_status not null default 'pending',
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index party_payments_group_idx on public.party_payments (group_id);

alter table public.party_payments enable row level security;

-- The payer and the host can see a payment; nobody writes it from the client.
create policy "payer or host can read payments"
  on public.party_payments for select
  to authenticated
  using (payer_id = auth.uid() or private.is_party_host(party_id));

-- ============================================================================
-- create_group_payment_intent: the leader starts paying. Validates the group is
-- approved and priced, computes the authoritative amount, and records a pending
-- payment. Returns the reference (for Mollie metadata) and the amount.
-- ============================================================================

create function public.create_group_payment_intent(p_group_id uuid)
returns table (reference uuid, amount_dkk int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_party uuid;
  v_leader uuid;
  v_status party_group_status;
  v_price int;
  v_size  int;
  v_ref   uuid := gen_random_uuid();
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
  if v_status <> 'approved' then
    raise exception 'Gruppen er ikke klar til betaling.';
  end if;

  select entre_dkk into v_price from public.parties where id = v_party;
  if v_price is null or v_price <= 0 then
    raise exception 'Denne fest er gratis — ingen betaling nødvendig.';
  end if;

  select count(*) into v_size
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted';

  v_amount := v_price * v_size;

  -- One live intent per group: clear stale pending rows before inserting.
  delete from public.party_payments
  where group_id = p_group_id and status = 'pending';

  insert into public.party_payments
    (group_id, party_id, payer_id, amount_dkk, reference, status)
  values
    (p_group_id, v_party, v_uid, v_amount, v_ref, 'pending');

  reference := v_ref;
  amount_dkk := v_amount;
  return next;
end;
$$;

revoke all on function public.create_group_payment_intent(uuid) from public, anon;
grant execute on function public.create_group_payment_intent(uuid) to authenticated;

-- ============================================================================
-- mark_group_paid: called server-side (service role) after Mollie confirms the
-- payment. Idempotent, re-checks capacity (seats may have filled since
-- approval), then fans the group out to 'going' and marks it 'paid'.
-- ============================================================================

-- Returns an outcome the caller acts on: 'paid' (fanned out), 'capacity_full'
-- (payment refunded in DB → caller refunds it at Mollie too), 'already' (dup),
-- or 'missing'. Returns a value instead of raising on the capacity path so the
-- 'refunded' write commits rather than being rolled back by the exception.
create function public.mark_group_paid(
  p_group_id    uuid,
  p_reference   uuid,
  p_provider_ref text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party  uuid;
  v_status party_group_status;
  v_pay    party_payments%rowtype;
  v_cap    int;
  v_going  int;
  v_size   int;
begin
  select party_id, status into v_party, v_status
  from public.party_groups where id = p_group_id for update;
  if v_party is null then
    return 'missing';
  end if;
  if v_status = 'paid' then
    return 'already'; -- already settled (duplicate webhook)
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

  -- Capacity re-check — don't overbook if seats filled between approval & pay.
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
    return 'capacity_full'; -- caller refunds at Mollie
  end if;

  update public.party_payments
  set status = 'completed', provider_ref = p_provider_ref, completed_at = now()
  where id = v_pay.id;

  perform private.fan_out_group(p_group_id);

  update public.party_groups
  set status = 'paid', paid_at = now()
  where id = p_group_id;

  return 'paid';
end;
$$;

revoke all on function public.mark_group_paid(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_group_paid(uuid, uuid, text) to service_role;

-- ============================================================================
-- respond_group_request — Phase B: gate 'paid' behind payment when the party
-- has an entré price. Free parties still confirm immediately on approval.
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

  select count(*) into v_size
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted';
  select capacity into v_cap from public.parties where id = v_party;
  select count(*) into v_going
  from public.party_attendees
  where party_id = v_party and status = 'going';

  if v_cap is not null and v_going + v_size > v_cap then
    raise exception 'Festen har ikke plads til hele gruppen (% pladser tilbage).',
      greatest(v_cap - v_going, 0);
  end if;

  select entre_dkk into v_price from public.parties where id = v_party;

  if v_price is null or v_price <= 0 then
    -- Free party: confirm immediately (Phase-A behaviour).
    perform private.fan_out_group(p_group_id);
    update public.party_groups
    set status = 'paid', approved_at = now(), paid_at = now()
    where id = p_group_id;
  else
    -- Paid party: approve and wait for the leader to pay.
    update public.party_groups
    set status = 'approved', approved_at = now()
    where id = p_group_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
