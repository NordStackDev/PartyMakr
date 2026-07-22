-- Notifications for the group-signup flow (00033/00034), following the
-- SECURITY DEFINER trigger pattern from 00019. Rows are written only by these
-- triggers (the notifications table has no INSERT policy).
--
-- Spam note: the attendee fan-out in private.fan_out_group sets
-- partymakr.skip_rsvp_notify, so notify_on_rsvp stays silent — the host is told
-- once (on submit) and members once (on confirm), never per attendee row.

-- ============================================================================
-- Invited friend → "you're invited to a group"
-- ============================================================================

create function public.notify_on_group_invite()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party  uuid;
  v_title  text;
  v_leader text;
begin
  if new.status <> 'pending' then
    return new; -- the leader's own auto-accepted row, not an invite
  end if;

  select g.party_id, p.title, coalesce(pr.display_name, pr.username, 'Nogen')
    into v_party, v_title, v_leader
  from public.party_groups g
  join public.parties p on p.id = g.party_id
  join public.profiles pr on pr.id = g.leader_id
  where g.id = new.group_id;

  insert into public.notifications (user_id, type, title, body, party_id)
  values (
    new.user_id,
    'group_invite',
    'Gruppeinvitation',
    v_leader || ' vil have dig med til «' || coalesce(v_title, 'en fest') || '»',
    v_party
  );
  return new;
end;
$$;

create trigger on_group_member_invited
  after insert on public.party_group_members
  for each row execute function public.notify_on_group_invite();

-- ============================================================================
-- Group status changes → host (submitted), leader (approved/declined),
-- leader + members (confirmed/paid).
-- ============================================================================

create function public.notify_on_group_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title  text;
  v_host   uuid;
  v_leader text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title, host_id into v_title, v_host
  from public.parties where id = new.party_id;

  if new.status = 'requested' then
    -- One notification to the host — not one per member.
    select coalesce(display_name, username, 'Nogen') into v_leader
    from public.profiles where id = new.leader_id;
    if v_host is not null then
      insert into public.notifications (user_id, type, title, body, party_id)
      values (
        v_host,
        'group_request',
        'Ny gruppeanmodning',
        v_leader || ' vil med til «' || coalesce(v_title, 'din fest') || '» med en gruppe',
        new.party_id
      );
    end if;

  elsif new.status = 'approved' then
    -- Awaiting payment (Phase B). Free parties skip straight to 'paid'.
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      new.leader_id,
      'group_approved',
      'Gruppe godkendt',
      'Værten godkendte din gruppe til «' || coalesce(v_title, 'festen') || '» — betal for at bekræfte',
      new.party_id
    );

  elsif new.status = 'declined' then
    insert into public.notifications (user_id, type, title, body, party_id)
    values (
      new.leader_id,
      'group_declined',
      'Gruppe afvist',
      'Værten afviste din gruppe til «' || coalesce(v_title, 'festen') || '»',
      new.party_id
    );

  elsif new.status = 'paid' then
    -- Confirmed: tell the leader and every accepted member (one row each).
    insert into public.notifications (user_id, type, title, body, party_id)
    select m.user_id, 'group_confirmed', 'Du er med',
      'Din gruppe er tilmeldt «' || coalesce(v_title, 'festen') || '»',
      new.party_id
    from public.party_group_members m
    where m.group_id = new.id and m.status = 'accepted';
  end if;

  return new;
end;
$$;

create trigger on_group_status_changed
  after update on public.party_groups
  for each row execute function public.notify_on_group_status();

-- Trigger functions aren't API endpoints — keep them off PostgREST (00013).
revoke all on function public.notify_on_group_invite() from public, anon, authenticated;
revoke all on function public.notify_on_group_status() from public, anon, authenticated;

notify pgrst, 'reload schema';
