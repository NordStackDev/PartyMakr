-- Group signup: a guest (the "leader") gathers friends who are also coming and
-- signs up as one group. Selected friends must ACCEPT an invite first (explicit
-- consent), the HOST then approves the whole group, and — once approved (and,
-- from Phase B, paid) — every accepted member becomes a 'going' attendee.
--
-- Writes go only through the SECURITY DEFINER RPCs in 00034 (like 00019's
-- respond_join_request), so RLS here is read-only for clients.

-- ============================================================================
-- Tables
-- ============================================================================

create type party_group_status as enum
  ('forming', 'requested', 'approved', 'paid', 'declined', 'cancelled');

create table public.party_groups (
  id           uuid primary key default gen_random_uuid(),
  party_id     uuid not null references public.parties(id) on delete cascade,
  leader_id    uuid not null references public.profiles(id) on delete cascade,
  status       party_group_status not null default 'forming',
  created_at   timestamptz not null default now(),
  requested_at timestamptz,
  approved_at  timestamptz,
  paid_at      timestamptz
);

-- At most one live group per leader per party (a settled group — declined /
-- cancelled — no longer blocks starting a fresh one).
create unique index party_groups_one_active
  on public.party_groups (party_id, leader_id)
  where status in ('forming', 'requested', 'approved');
create index party_groups_party_idx on public.party_groups (party_id);

create table public.party_group_members (
  group_id     uuid not null references public.party_groups(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- Reuses invite_status: 'pending' = invited, 'accepted' = coming, 'declined'.
  status       invite_status not null default 'pending',
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (group_id, user_id)
);

create index party_group_members_user_idx on public.party_group_members (user_id);

-- ============================================================================
-- Visibility helper (SECURITY DEFINER, private schema) — mirrors 00010 so the
-- RLS policies below never re-enter their own tables' policies (no recursion).
-- ============================================================================

create function private.can_see_group(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.party_groups g
    where g.id = p_group_id
      and (
        g.leader_id = auth.uid()
        or private.is_party_host(g.party_id)
        or exists (
          select 1 from public.party_group_members m
          where m.group_id = g.id and m.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function private.can_see_group(uuid) from public, anon;
grant execute on function private.can_see_group(uuid) to authenticated;

-- ============================================================================
-- RLS: read-only for clients (leader, members and the host can see a group).
-- Every write goes through the RPCs in 00034.
-- ============================================================================

alter table public.party_groups enable row level security;
alter table public.party_group_members enable row level security;

create policy "group visible to leader, members and host"
  on public.party_groups for select
  to authenticated
  using (private.can_see_group(id));

create policy "group members visible to leader, members and host"
  on public.party_group_members for select
  to authenticated
  using (private.can_see_group(group_id));

-- No INSERT / UPDATE / DELETE policies on purpose — the RPCs (SECURITY DEFINER)
-- own all writes, so a leader can't self-approve and a member can't add others.

notify pgrst, 'reload schema';
