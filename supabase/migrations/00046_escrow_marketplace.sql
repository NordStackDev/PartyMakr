-- Escrow marketplace model — BUILT BUT DORMANT. Activated by the app-side
-- PAYMENT_MODEL=marketplace flag; until then nothing writes these tables and
-- the live platform-collects model is unaffected.
--
-- Marketplace flow (per the payment-flow memo):
--   * the HOST sets the ticket price; the platform adds a separate fee line,
--   * the guest's money lands with the platform and is HELD (escrow),
--   * after the party is held + a claim window, a scheduled job transfers the
--     host's share to their Stripe Connect account,
--   * guests can file a claim ("no party happened") inside the window, which
--     blocks the payout until resolved; cancellation refunds everyone.

-- ============================================================================
-- host_payout_accounts — recreated (00045 dropped it). Written only by the
-- service role (Connect onboarding actions); owner-only read.
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
-- party_payments — escrow bookkeeping. In platform mode these stay at their
-- defaults ('na'); in marketplace mode settle marks the payment 'held' with
-- the host's share and a due date, and the release job moves it to 'released'.
-- ============================================================================

alter table public.party_payments
  add column host_amount_dkk int not null default 0 check (host_amount_dkk >= 0),
  add column payout_status text not null default 'na'
    check (payout_status in ('na', 'held', 'released', 'refunded', 'disputed')),
  add column payout_due_at timestamptz,
  add column transfer_ref text;

create index party_payments_payout_due_idx
  on public.party_payments (payout_status, payout_due_at)
  where payout_status = 'held';

-- ============================================================================
-- party_claims — "the party didn't happen". A going, paid guest can file one
-- claim per party after its start; an open claim blocks the host payout for
-- the whole party until resolved (resolution is manual for now).
-- ============================================================================

create table public.party_claims (
  party_id   uuid not null references public.parties(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text,
  status     text not null default 'open'
    check (status in ('open', 'upheld', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (party_id, user_id)
);

alter table public.party_claims enable row level security;

-- The claimant and the host can see a claim.
create policy "claimant or host reads claims"
  on public.party_claims for select
  to authenticated
  using (user_id = auth.uid() or private.is_party_host(party_id));

-- Only a 'going' attendee can claim, only after the party has started.
create policy "going attendees can file a claim"
  on public.party_claims for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.party_attendees a
      where a.party_id = party_claims.party_id
        and a.user_id = auth.uid()
        and a.status = 'going'
    )
    and exists (
      select 1 from public.parties p
      where p.id = party_claims.party_id and p.starts_at < now()
    )
  );
-- No UPDATE/DELETE — resolution happens via the service role.

notify pgrst, 'reload schema';
