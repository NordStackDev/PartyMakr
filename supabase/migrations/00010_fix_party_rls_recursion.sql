-- Fix "infinite recursion detected in policy for relation parties".
--
-- The original (00001) policies cross-reference each other:
--   * parties SELECT checks party_invites
--   * party_invites SELECT/INSERT/DELETE check parties
--   * party_attendees SELECT checks parties
-- Evaluating any of them re-enters the other's RLS → infinite recursion (it
-- trips on INSERT ... RETURNING, on reading parties once rows exist, etc.).
--
-- Move the cross-table checks into SECURITY DEFINER helpers (in the private,
-- non-API schema) that read the tables as the owner, bypassing RLS, so the
-- policies no longer recurse.

create function private.is_party_host(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.parties
    where id = p_id and host_id = auth.uid()
  );
$$;

create function private.is_party_invitee(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.party_invites
    where party_id = p_id and invitee_id = auth.uid()
  );
$$;

create function private.can_see_party(p_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.parties p
    where p.id = p_id
      and (
        p.visibility = 'public'
        or p.host_id = auth.uid()
        or exists (
          select 1 from public.party_invites pi
          where pi.party_id = p.id and pi.invitee_id = auth.uid()
        )
      )
  );
$$;

revoke all on function private.is_party_host(uuid) from public, anon;
revoke all on function private.is_party_invitee(uuid) from public, anon;
revoke all on function private.can_see_party(uuid) from public, anon;
grant execute on function private.is_party_host(uuid) to authenticated;
grant execute on function private.is_party_invitee(uuid) to authenticated;
grant execute on function private.can_see_party(uuid) to authenticated;

-- ============================================================================
-- Recreate the recursive policies using the helpers
-- ============================================================================

drop policy if exists "public parties are readable" on public.parties;
create policy "public parties are readable"
  on public.parties for select
  to authenticated
  using (
    visibility = 'public'
    or host_id = auth.uid()
    or private.is_party_invitee(id)
  );

drop policy if exists "host or invitee can read invites" on public.party_invites;
create policy "host or invitee can read invites"
  on public.party_invites for select
  to authenticated
  using (invitee_id = auth.uid() or private.is_party_host(party_id));

drop policy if exists "host can invite people" on public.party_invites;
create policy "host can invite people"
  on public.party_invites for insert
  to authenticated
  with check (private.is_party_host(party_id));

drop policy if exists "host can revoke invites" on public.party_invites;
create policy "host can revoke invites"
  on public.party_invites for delete
  to authenticated
  using (private.is_party_host(party_id));

drop policy if exists "attendees are readable if party is readable" on public.party_attendees;
create policy "attendees are readable if party is readable"
  on public.party_attendees for select
  to authenticated
  using (private.can_see_party(party_id));
