-- RPCs for the group-signup flow (00033). All SECURITY DEFINER, mirroring
-- respond_join_request (00019): verify the caller, lock the row, and perform
-- writes the caller's own RLS forbids. Clients reach these only through the
-- server actions in src/lib/parties/actions.ts.

-- ============================================================================
-- Shared helper: turn every accepted member into a 'going' attendee.
-- Suppresses notify_on_rsvp (00019) so the host isn't spammed with one "Ny
-- tilmelding" per member. Not callable by clients — only by the RPCs below,
-- which run as the owner and so retain execute rights.
-- ============================================================================

create function private.fan_out_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party uuid;
begin
  select party_id into v_party from public.party_groups where id = p_group_id;

  perform set_config('partymakr.skip_rsvp_notify', '1', true);
  insert into public.party_attendees (party_id, user_id, status)
  select v_party, m.user_id, 'going'
  from public.party_group_members m
  where m.group_id = p_group_id and m.status = 'accepted'
  on conflict (party_id, user_id) do update set status = 'going';
  perform set_config('partymakr.skip_rsvp_notify', '', true);

  -- These members are going as a group now — drop any stale solo join request.
  delete from public.party_join_requests r
  using public.party_group_members m
  where m.group_id = p_group_id and m.status = 'accepted'
    and r.party_id = v_party and r.user_id = m.user_id;
end;
$$;

revoke all on function private.fan_out_group(uuid) from public, anon, authenticated;

-- ============================================================================
-- create_group_with_invites: leader starts a group and invites accepted friends.
-- ============================================================================

create function public.create_group_with_invites(
  p_party_id   uuid,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_group     uuid;
  v_requested int;
  v_valid     int;
begin
  if v_uid is null then
    raise exception 'Du skal være logget ind.';
  end if;
  if not private.can_see_party(p_party_id) then
    raise exception 'Festen findes ikke eller er ikke synlig for dig.';
  end if;
  if private.is_party_host(p_party_id) then
    raise exception 'Værten kan ikke tilmelde sig sin egen fest som gæst.';
  end if;
  if exists (
    select 1 from public.party_groups
    where party_id = p_party_id and leader_id = v_uid
      and status in ('forming', 'requested', 'approved')
  ) then
    raise exception 'Du har allerede en aktiv gruppe til denne fest.';
  end if;

  -- Distinct invitees (the leader can't invite themselves).
  select count(*) into v_requested
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s;
  if v_requested = 0 then
    raise exception 'Vælg mindst én ven at invitere.';
  end if;

  -- Every invitee must be an ACCEPTED friend of the leader.
  select count(*) into v_valid
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s
  where exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = v_uid and f.addressee_id = s.id)
        or (f.addressee_id = v_uid and f.requester_id = s.id))
  );
  if v_valid <> v_requested then
    raise exception 'Du kan kun invitere venner du er forbundet med.';
  end if;

  insert into public.party_groups (party_id, leader_id, status)
  values (p_party_id, v_uid, 'forming')
  returning id into v_group;

  -- The leader is a member, auto-accepted.
  insert into public.party_group_members (group_id, user_id, status, responded_at)
  values (v_group, v_uid, 'accepted', now());

  insert into public.party_group_members (group_id, user_id, status)
  select v_group, s.id, 'pending'
  from (select distinct id from unnest(p_member_ids) as t(id) where id <> v_uid) s;

  return v_group;
end;
$$;

revoke all on function public.create_group_with_invites(uuid, uuid[]) from public, anon;
grant execute on function public.create_group_with_invites(uuid, uuid[]) to authenticated;

-- ============================================================================
-- respond_group_invite: an invited friend accepts or declines.
-- ============================================================================

create function public.respond_group_invite(p_group_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_gstatus party_group_status;
  v_status  invite_status;
begin
  select status into v_gstatus from public.party_groups where id = p_group_id;
  if v_gstatus is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_gstatus <> 'forming' then
    return; -- already submitted / settled — an invite response no longer matters
  end if;

  select status into v_status
  from public.party_group_members
  where group_id = p_group_id and user_id = v_uid
  for update;

  if v_status is null then
    raise exception 'Du er ikke inviteret til denne gruppe.';
  end if;
  if v_status <> 'pending' then
    return; -- double-tap / stale UI
  end if;

  update public.party_group_members
  set status       = case when p_accept then 'accepted'::invite_status
                          else 'declined'::invite_status end,
      responded_at = now()
  where group_id = p_group_id and user_id = v_uid;
end;
$$;

revoke all on function public.respond_group_invite(uuid, boolean) from public, anon;
grant execute on function public.respond_group_invite(uuid, boolean) to authenticated;

-- ============================================================================
-- submit_group: the leader sends the formed group to the host for approval.
-- ============================================================================

create function public.submit_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := auth.uid();
  v_leader   uuid;
  v_status   party_group_status;
  v_accepted int;
begin
  select leader_id, status into v_leader, v_status
  from public.party_groups where id = p_group_id for update;

  if v_leader is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_leader <> v_uid then
    raise exception 'Kun gruppens leder kan sende den til værten.';
  end if;
  if v_status <> 'forming' then
    return; -- already submitted / settled
  end if;

  select count(*) into v_accepted
  from public.party_group_members
  where group_id = p_group_id and status = 'accepted' and user_id <> v_uid;
  if v_accepted < 1 then
    raise exception 'Mindst én ven skal have accepteret, før gruppen kan sendes.';
  end if;

  update public.party_groups
  set status = 'requested', requested_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function public.submit_group(uuid) from public, anon;
grant execute on function public.submit_group(uuid) to authenticated;

-- ============================================================================
-- respond_group_request: the HOST approves or declines a submitted group.
-- Enforces capacity. Phase A has no payment, so approval confirms immediately
-- (fan-out + 'paid'). Phase B replaces this to gate 'paid' behind payment when
-- the party has an entré price.
-- ============================================================================

create function public.respond_group_request(p_group_id uuid, p_accept boolean)
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
    return; -- already handled
  end if;

  if not p_accept then
    update public.party_groups set status = 'declined' where id = p_group_id;
    return;
  end if;

  -- Capacity gate: accepted members (incl. leader) must fit the remaining room.
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

  perform private.fan_out_group(p_group_id);

  update public.party_groups
  set status = 'paid', approved_at = now(), paid_at = now()
  where id = p_group_id;
end;
$$;

revoke all on function public.respond_group_request(uuid, boolean) from public, anon;
grant execute on function public.respond_group_request(uuid, boolean) to authenticated;

-- ============================================================================
-- cancel_group: the leader backs out before the group is confirmed. Frees the
-- one-active-group slot so they can start over.
-- ============================================================================

create function public.cancel_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_leader uuid;
  v_status party_group_status;
begin
  select leader_id, status into v_leader, v_status
  from public.party_groups where id = p_group_id for update;

  if v_leader is null then
    raise exception 'Gruppen findes ikke.';
  end if;
  if v_leader <> v_uid then
    raise exception 'Kun gruppens leder kan annullere den.';
  end if;
  if v_status = 'paid' then
    raise exception 'Gruppen er allerede tilmeldt og kan ikke annulleres her.';
  end if;

  update public.party_groups set status = 'cancelled' where id = p_group_id;
end;
$$;

revoke all on function public.cancel_group(uuid) from public, anon;
grant execute on function public.cancel_group(uuid) to authenticated;

notify pgrst, 'reload schema';
