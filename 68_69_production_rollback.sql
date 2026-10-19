-- LYANN Production rollback for 68 and 69 only.
-- Do not run unless the founder stops the cutover before any Live Connect account or payout exists.
-- This drops the two new tables. It does not update, delete, or rewrite public.payments,
-- profiles.stripe_account_id, milestones, quotes, or missions.
do $$
begin
  if to_regclass('public.lyann_connect_accounts') is not null
     and exists (select 1 from public.lyann_connect_accounts where stripe_mode = 'live') then
    raise exception 'rollback refused: a live Connect account is already stored';
  end if;
  if to_regclass('public.lyann_connect_payouts') is not null
     and exists (select 1 from public.lyann_connect_payouts) then
    raise exception 'rollback refused: a bank payout row is already stored';
  end if;
  drop table if exists public.lyann_connect_payouts;
  drop table if exists public.lyann_connect_accounts;
end $$;
