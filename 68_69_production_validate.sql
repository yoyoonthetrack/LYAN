-- LYANN Production validation. SELECT only. Run after an authorized apply of 68 and 69.
-- Fail the cutover if any row below is unexpected. Do not update payments from this file.
select
  (select count(*)::int from public.payments) as payments,
  (select string_agg(payment_status || '/' || transfer_status || ':' || n, ',' order by payment_status, transfer_status)
     from (select payment_status, transfer_status, count(*)::text as n from public.payments group by 1, 2) s) as payment_groups,
  (select md5(string_agg(id::text || '|' || payment_status || '|' || transfer_status || '|' || coalesce(stripe_payment_intent_id, '') || '|' || coalesce(stripe_transfer_id, '') || '|' || coalesce(stripe_refund_id, ''), ',' order by id))
     from public.payments) as payments_fingerprint,
  (select count(*)::int from public.profiles where stripe_account_id is not null and btrim(stripe_account_id) <> '') as legacy_connect_ids,
  (select count(*)::int from public.lyann_connect_accounts where stripe_mode = 'test') as mapped_test,
  (select count(*)::int from public.lyann_connect_accounts where stripe_mode = 'live') as mapped_live,
  (select count(*)::int from public.lyann_connect_payouts) as payout_rows,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'lyann_connect_accounts') as connect_rls,
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'lyann_connect_payouts') as payout_rls;
-- Expected immediately after migration, before any Live account:
-- payments 7, groups SUCCEEDED/PENDING_VALIDATION:1,SUCCEEDED/TRANSFERRED:6,
-- payments_fingerprint identical to the precheck, mapped_test = legacy_connect_ids,
-- mapped_live 0, payout_rows 0, both RLS flags true.
