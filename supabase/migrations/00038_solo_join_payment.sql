-- A single guest joins as a SINGLE PERSON (not a "group of one"): the normal
-- join request, the host approves, and on a PAID party the guest then pays
-- entré × 1 before becoming 'going'. Groups (00033–00037) stay for 2+ people.

-- ============================================================================
-- party_payments: allow solo payments that aren't tied to a group.
-- ============================================================================

alter table public.party_payments alter column group_id drop not null;

-- ============================================================================
-- respond_join_request — price-aware. Free party: approval makes the guest
-- 'going' immediately (as before). Paid party: approval only marks the request
-- 'accepted'; the guest must pay to become 'going'.
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
begin
  select host_id into v_host from public.parties where id = p_party_id;
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

  update public.party_join_requests
  set status       = case when p_accept then 'accepted'::invite_status
                          else 'declined'::invite_status end,
      responded_at = now()
  where party_id = p_party_id and user_id = p_user_id;

  if p_accept then
    select entre_dkk into v_price from public.parties where id = p_party_id;
    if v_price is null or v_price <= 0 then
      -- Free: the guest is going now.
      perform set_config('partymakr.skip_rsvp_notify', '1', true);
      insert into public.party_attendees (party_id, user_id, status)
      values (p_party_id, p_user_id, 'going')
      on conflict (party_id, user_id) do update set status = 'going';
      perform set_config('partymakr.skip_rsvp_notify', '', true);
    end if;
    -- Paid: leave the request 'accepted'; the guest pays to become 'going'.
  end if;
end;
$$;

-- Approval message reflects whether payment is still needed.
create or replace function public.notify_on_join_response()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p_title text;
  v_price int;
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    select title, entre_dkk into p_title, v_price
    from public.parties where id = new.party_id;
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      new.user_id,
      'join_response',
      case when new.status = 'accepted' then 'Anmodning godkendt'
           else 'Anmodning afvist' end,
      case
        when new.status = 'accepted' and coalesce(v_price, 0) > 0
          then 'Godkendt — betal entré for at deltage i «' || coalesce(p_title, 'festen') || '»'
        when new.status = 'accepted'
          then 'Du er med til «' || coalesce(p_title, 'festen') || '»'
        else 'Værten afviste din anmodning til «' || coalesce(p_title, 'festen') || '»'
      end,
      new.party_id
    );
  end if;
  return new;
end;
$$;

-- ============================================================================
-- create_solo_payment_intent: a single approved guest starts paying. Records a
-- pending payment (no group) for entré × 1 and returns the reference + amount.
-- ============================================================================

create function public.create_solo_payment_intent(p_party_id uuid)
returns table (reference uuid, amount_dkk int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_price int;
  v_req   invite_status;
  v_ref   uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Du skal være logget ind.';
  end if;

  select status into v_req
  from public.party_join_requests
  where party_id = p_party_id and user_id = v_uid;
  if v_req is null or v_req <> 'accepted' then
    raise exception 'Din anmodning er ikke godkendt endnu.';
  end if;

  if exists (
    select 1 from public.party_attendees
    where party_id = p_party_id and user_id = v_uid and status = 'going'
  ) then
    raise exception 'Du er allerede tilmeldt.';
  end if;

  select entre_dkk into v_price from public.parties where id = p_party_id;
  if v_price is null or v_price <= 0 then
    raise exception 'Denne fest er gratis — ingen betaling nødvendig.';
  end if;

  -- One live intent per guest per party.
  delete from public.party_payments
  where party_id = p_party_id and payer_id = v_uid
    and group_id is null and status = 'pending';

  insert into public.party_payments
    (group_id, party_id, payer_id, amount_dkk, reference, status)
  values
    (null, p_party_id, v_uid, v_price, v_ref, 'pending');

  reference := v_ref;
  amount_dkk := v_price;
  return next;
end;
$$;

revoke all on function public.create_solo_payment_intent(uuid) from public, anon;
grant execute on function public.create_solo_payment_intent(uuid) to authenticated;

-- ============================================================================
-- mark_solo_paid: called server-side (service role) after Mollie confirms a
-- solo payment. Idempotent, capacity-checked, then inserts the single 'going'
-- attendee. Returns 'paid' | 'already' | 'capacity_full' | 'missing'.
-- ============================================================================

create function public.mark_solo_paid(p_reference uuid, p_provider_ref text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pay   party_payments%rowtype;
  v_cap   int;
  v_going int;
  v_title text;
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

  if exists (
    select 1 from public.party_attendees
    where party_id = v_pay.party_id and user_id = v_pay.payer_id and status = 'going'
  ) then
    update public.party_payments
    set status = 'completed', provider_ref = p_provider_ref, completed_at = now()
    where id = v_pay.id;
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

  perform set_config('partymakr.skip_rsvp_notify', '1', true);
  insert into public.party_attendees (party_id, user_id, status)
  values (v_pay.party_id, v_pay.payer_id, 'going')
  on conflict (party_id, user_id) do update set status = 'going';
  perform set_config('partymakr.skip_rsvp_notify', '', true);

  select title into v_title from public.parties where id = v_pay.party_id;
  insert into public.notifications (user_id, type, title, body, party_id)
  values (
    v_pay.payer_id, 'payment', 'Betaling gennemført',
    'Du er tilmeldt «' || coalesce(v_title, 'festen') || '»', v_pay.party_id
  );

  return 'paid';
end;
$$;

revoke all on function public.mark_solo_paid(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_solo_paid(uuid, text) to service_role;

notify pgrst, 'reload schema';
