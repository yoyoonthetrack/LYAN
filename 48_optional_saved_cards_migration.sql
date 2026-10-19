-- LYANN: Stripe Customers for optional, consent-based reusable cards.
-- Apply to the isolated test Supabase project before enabling checkout sessions.
-- Service-role only; no card number, CVC, or payment token is stored here.
create table if not exists public.lyann_payment_customers (
    user_id uuid not null references auth.users(id) on delete cascade,
    stripe_mode text not null check (stripe_mode in ('test', 'live')),
    stripe_customer_id text not null unique,
    primary key (user_id, stripe_mode),
    created_at timestamptz not null default now()
);
alter table public.lyann_payment_customers enable row level security;
revoke all on public.lyann_payment_customers from anon, authenticated;
grant select, insert, update, delete on public.lyann_payment_customers to service_role;
comment on table public.lyann_payment_customers is 'Only maps an authenticated LYANN user to Stripe Customer; no card details.';
