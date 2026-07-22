-- Danish-style billetgebyr: the GUEST pays entré + a per-ticket fee. The host
-- receives the full entré (transfer_data.amount at Stripe); the fee stays with
-- the platform and covers Stripe's processing cost. The fee is computed
-- server-side from env (PLATFORM_FEE_DKK) and recorded on the payment row so
-- settling can verify the exact charged total (entré + fee) tamper-free.

alter table public.party_payments
  add column fee_dkk int not null default 0 check (fee_dkk >= 0);
