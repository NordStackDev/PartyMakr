-- Switch the payment provider from Mollie to MobilePay (Vipps ePayment API).
-- The payment tables/RPCs are provider-agnostic; only the default label changes
-- so new rows record the right provider. Existing pending Mollie rows (if any)
-- are stale test data.

alter table public.party_payments alter column provider set default 'mobilepay';
