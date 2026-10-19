-- LYANN: Stripe Connect accounts partitioned by mode.
-- Do not apply on Production until the founder agrees.
-- Service-role only. A live account id must never be written into profiles.stripe_account_id.
create table if not exists public.lyann_connect_accounts (
    user_id uuid not null references auth.users(id) on delete cascade,
    stripe_mode text not null check (stripe_mode in ('test', 'live')),
    stripe_account_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, stripe_mode),
    unique (stripe_account_id)
);
alter table public.lyann_connect_accounts enable row level security;
revoke all on public.lyann_connect_accounts from anon, authenticated;
grant select, insert, update, delete on public.lyann_connect_accounts to service_role;
comment on table public.lyann_connect_accounts is 'Maps a LYANN user to one Stripe Connect account per mode. Legacy profiles.stripe_account_id stays test-only.';

-- Keep existing test ids. Never label them live. Skip an id shared by two profiles.
insert into public.lyann_connect_accounts (user_id, stripe_mode, stripe_account_id)
select distinct on (p.stripe_account_id) p.id, 'test', p.stripe_account_id
from public.profiles p
where p.stripe_account_id is not null
  and btrim(p.stripe_account_id) <> ''
  and exists (select 1 from auth.users u where u.id = p.id)
  and p.stripe_account_id not in (
      select stripe_account_id
      from public.profiles
      where stripe_account_id is not null
        and btrim(stripe_account_id) <> ''
      group by stripe_account_id
      having count(*) > 1
  )
order by p.stripe_account_id, p.id
on conflict do nothing;
