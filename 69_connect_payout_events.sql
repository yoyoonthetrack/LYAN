-- LYANN: bank payout outcomes, separate from milestone transfers.
-- Do not apply on Production until the founder agrees.
-- A payout row never updates payments or the seven historical financial records.
create table if not exists public.lyann_connect_payouts (
    stripe_payout_id text primary key,
    stripe_mode text not null check (stripe_mode in ('test', 'live')),
    stripe_account_id text not null,
    status text not null check (status in ('paid', 'failed')),
    failure_code text,
    amount_cents bigint,
    currency text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
alter table public.lyann_connect_payouts enable row level security;
revoke all on public.lyann_connect_payouts from anon, authenticated;
grant select, insert, update, delete on public.lyann_connect_payouts to service_role;
comment on table public.lyann_connect_payouts is 'Stripe bank payout result. Distinct from a Connect transfer.';
