-- LYANN Production precheck. SELECT only. Do not apply 68 or 69 from this file.
-- Save the result before any authorized migration. Expected today: 7 payments,
-- 6 TRANSFERRED, 1 PENDING_VALIDATION, all SUCCEEDED, 3 Connect ids, 0 duplicates.
select
  (select count(*)::int from public.payments) as payments,
  (select count(*)::int from public.profiles where stripe_account_id is not null and btrim(stripe_account_id) <> '') as connect_ids,
  (select count(*)::int from (
      select stripe_account_id from public.profiles
      where stripe_account_id is not null and btrim(stripe_account_id) <> ''
      group by stripe_account_id having count(*) > 1
  ) d) as duplicate_connect_ids,
  (select count(*)::int from public.profiles p
    where p.stripe_account_id is not null and btrim(p.stripe_account_id) <> ''
      and not exists (select 1 from auth.users u where u.id = p.id)) as connect_ids_without_auth_user,
  to_regclass('public.lyann_connect_accounts')::text as connect_table,
  to_regclass('public.lyann_connect_payouts')::text as payout_table,
  to_regclass('auth.users')::text as auth_users,
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'stripe_account_id') as stripe_account_id_type,
  (select string_agg(payment_status || '/' || transfer_status || ':' || n, ',' order by payment_status, transfer_status)
     from (select payment_status, transfer_status, count(*)::text as n from public.payments group by 1, 2) s) as payment_groups,
  (select md5(string_agg(id::text || '|' || payment_status || '|' || transfer_status || '|' || coalesce(stripe_payment_intent_id, '') || '|' || coalesce(stripe_transfer_id, '') || '|' || coalesce(stripe_refund_id, ''), ',' order by id))
     from public.payments) as payments_fingerprint;
