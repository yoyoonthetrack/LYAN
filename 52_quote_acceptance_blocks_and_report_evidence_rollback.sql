-- Controlled deactivation of the evidence upload added by
-- 52_quote_acceptance_blocks_and_report_evidence.sql.
-- Do not run until Yoann asks for it.
--
-- This file does not restore accept_request_quote from
-- 05_fix_accept_quote_mission_title_v51.sql. That older body accepts a sent
-- quote without checking a block or a version.
-- Both accept signatures, the block on a sent quote, the stale-version check
-- and the commercial triggers stay installed.
-- Existing proof rows and files are left in place. Only new uploads by
-- signed-in members are closed.

BEGIN;

DROP POLICY IF EXISTS report_evidence_storage_insert ON storage.objects;
REVOKE INSERT ON TABLE public.report_evidence FROM PUBLIC, anon, authenticated;

COMMIT;
