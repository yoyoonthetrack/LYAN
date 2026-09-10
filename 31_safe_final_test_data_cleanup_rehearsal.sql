-- Migration 31 (Rehearsal): LYANN — Safe Final Production Test Data Cleanup (Rehearsal Copy - Guaranteed Rollback)
-- Target: Clean remaining 21 test requests and all dependent test rows.
-- ENDS WITH ROLLBACK TO PERSIST ZERO MUTATIONS.

BEGIN;

-- 1. PRE-CHECK ASSERTIONS
DO $$
DECLARE
    req_count INT;
    yoann_req_count INT;
    real_post_count INT;
BEGIN
    SELECT COUNT(*) INTO req_count FROM public.requests;
    IF req_count != 26 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 26 requests, found %', req_count;
    END IF;

    SELECT COUNT(*) INTO yoann_req_count FROM public.requests WHERE requester_id = '7fc0945b-3fda-43cc-8c62-b2490bda7927';
    IF yoann_req_count != 5 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Expected 5 Yoann requests, found %', yoann_req_count;
    END IF;

    SELECT COUNT(*) INTO real_post_count FROM public.bokantaj_posts WHERE id = '64318c77-c611-46de-9d9a-132e511bea35';
    IF real_post_count != 1 THEN
        RAISE EXCEPTION 'PRE-CHECK FAILED: Real bokantaj_posts row missing!';
    END IF;
END $$;

-- 2. CREATE ALLOWLIST TEMP TABLE OF THE 21 TARGET TEST REQUESTS
CREATE TEMP TABLE target_test_requests ON COMMIT DROP AS
SELECT id FROM public.requests WHERE id IN (
  'e68ee9e4-f54d-4fd1-b050-fd979121d38e',
  '620ca3c6-df89-441d-a1f9-9ef2136a4854',
  '4ffc185e-f3c8-4f7a-98d8-a1f615581ef8',
  '5da2573d-288b-4c5c-8866-e291bccc501e',
  'e09750e4-d6a6-4303-b79b-7b9b4c2849ff',
  '48b3f457-2b6f-42ec-917b-372d61a1c486',
  '1224025b-6393-4af8-a1c4-4fdb65e2ecf7',
  'e8f6827b-636e-4d4c-933c-93c4b28493d7',
  '56ea948d-acd6-4d43-81e2-5b93216406b3',
  '4912610f-96f6-40c1-9d52-a5ef051fa395',
  'b2624820-ac02-4cfd-b25a-049162b72bdf',
  '8a8f3c6d-4d0c-486f-b03f-2a3a6c4c537b',
  'f4df0e87-6402-4bf9-9096-ec1a663805ab',
  '16729610-b6b7-4df8-b911-9f1f77d45423',
  'f6ff943d-607a-49ec-b824-0ba034ede794',
  'c889cb22-edc2-479c-9353-217f1b42d040',
  '960eaa8f-9096-4751-9656-ce69e4d37bc9',
  'f8b01c6f-5ec6-4e97-8136-02741f2156be',
  'f95e046f-63ef-46aa-9bfe-9dc37cf667dd',
  '557e4ee2-2e95-481a-97ce-6996e61a6ddd',
  'de3a0ae4-de78-409c-9a01-cda7788eddf4'
);

-- Target invitations linked to target test requests
CREATE TEMP TABLE target_test_invitations ON COMMIT DROP AS
SELECT id FROM public.request_invitations WHERE request_id IN (SELECT id FROM target_test_requests);

-- Target quotes linked to target test requests or target test invitations
CREATE TEMP TABLE target_test_quotes ON COMMIT DROP AS
SELECT id FROM public.quotes WHERE request_id IN (SELECT id FROM target_test_requests)
                                 OR request_invitation_id IN (SELECT id FROM target_test_invitations);

-- Target missions linked to target test requests or target test invitations
CREATE TEMP TABLE target_test_missions ON COMMIT DROP AS
SELECT id FROM public.missions WHERE related_request_id IN (SELECT id FROM target_test_requests)
                                 OR request_invitation_id IN (SELECT id FROM target_test_invitations);

-- Target milestones linked to target test quotes
CREATE TEMP TABLE target_test_milestones ON COMMIT DROP AS
SELECT id FROM public.milestones WHERE quote_id IN (SELECT id FROM target_test_quotes);

-- Target payments linked to target test quotes, milestones, or missions
CREATE TEMP TABLE target_test_payments ON COMMIT DROP AS
SELECT id FROM public.payments WHERE quote_id IN (SELECT id FROM target_test_quotes)
                                 OR milestone_id IN (SELECT id FROM target_test_milestones)
                                 OR mission_id IN (SELECT id FROM target_test_missions);

-- Target disputes linked to target test payments or missions
CREATE TEMP TABLE target_test_disputes ON COMMIT DROP AS
SELECT id FROM public.disputes WHERE payment_id IN (SELECT id FROM target_test_payments)
                                 OR mission_id IN (SELECT id FROM target_test_missions);

-- 3. ASSERTIONS ON TARGET SETS BEFORE DELETION (SIMPLIFIED & SAFE)
DO $$
DECLARE
    target_req_count INT;
    real_in_target INT;
    real_payment_count INT;
BEGIN
    -- Assert target test requests count equals 21
    SELECT COUNT(*) INTO target_req_count FROM target_test_requests;
    IF target_req_count != 21 THEN
        RAISE EXCEPTION 'TARGET ASSERTION FAILED: Expected 21 test requests in target set, found %', target_req_count;
    END IF;

    -- Assert no protected real request ID is in target set
    SELECT COUNT(*) INTO real_in_target 
    FROM target_test_requests 
    WHERE id IN (
        '309c322a-93ab-484d-a37f-e024f484226e',
        '778db8a4-c9a6-4547-b83d-41dc55413f8b',
        '13f4e770-8597-4cbb-b619-d410ee5e4e93',
        '43efb480-7acc-4f85-a370-1232baec9942',
        '4438dd40-0219-4628-bb16-2405ecf296bc'
    );
    IF real_in_target > 0 THEN
        RAISE EXCEPTION 'TARGET ASSERTION FAILED: Protected real request ID found in test target set!';
    END IF;

    -- Assert no real user payment is in target payment set
    SELECT COUNT(*) INTO real_payment_count 
    FROM public.payments 
    WHERE id IN (SELECT id FROM target_test_payments)
      AND (requester_id = '7fc0945b-3fda-43cc-8c62-b2490bda7927' OR provider_id = '7fc0945b-3fda-43cc-8c62-b2490bda7927');
    IF real_payment_count > 0 THEN
        RAISE EXCEPTION 'TARGET ASSERTION FAILED: Real user payment found in test payment set!';
    END IF;
END $$;

-- 4. DELETION IN LEAF-TO-ROOT ORDER (VERIFIED BASE TABLE COLUMNS ONLY)

-- Leaf 1: payment_adjustments (references payment_id, dispute_id)
DELETE FROM public.payment_adjustments 
WHERE payment_id IN (SELECT id FROM target_test_payments)
   OR dispute_id IN (SELECT id FROM target_test_disputes);

-- Leaf 2: dispute child tables (references dispute_id)
DELETE FROM public.dispute_messages WHERE dispute_id IN (SELECT id FROM target_test_disputes);
DELETE FROM public.dispute_evidence WHERE dispute_id IN (SELECT id FROM target_test_disputes);
DELETE FROM public.dispute_events WHERE dispute_id IN (SELECT id FROM target_test_disputes);

-- Leaf 3: disputes (references payment_id, mission_id)
DELETE FROM public.disputes WHERE id IN (SELECT id FROM target_test_disputes);

-- Leaf 4: payments (references quote_id, milestone_id, mission_id)
DELETE FROM public.payments WHERE id IN (SELECT id FROM target_test_payments);

-- Leaf 5: milestones (references quote_id)
DELETE FROM public.milestones WHERE quote_id IN (SELECT id FROM target_test_quotes);

-- Leaf 6: missions (references related_request_id, request_invitation_id)
DELETE FROM public.missions WHERE id IN (SELECT id FROM target_test_missions);

-- Leaf 7: quotes (references request_id, request_invitation_id)
DELETE FROM public.quotes WHERE id IN (SELECT id FROM target_test_quotes);

-- Leaf 8: request_invitations (references request_id)
DELETE FROM public.request_invitations WHERE id IN (SELECT id FROM target_test_invitations);

-- Leaf 9: bokantaj social tables (references request_id)
DELETE FROM public.bokantaj_reports WHERE request_id IN (SELECT id FROM target_test_requests);
DELETE FROM public.bokantaj_comments WHERE request_id IN (SELECT id FROM target_test_requests);
DELETE FROM public.bokantaj_likes WHERE request_id IN (SELECT id FROM target_test_requests);

-- Root: requests (the 21 allowlisted test request UUIDs)
DELETE FROM public.requests WHERE id IN (SELECT id FROM target_test_requests);

-- 5. POST-CLEANUP SAFETY ASSERTIONS
DO $$
DECLARE
    final_req_count INT;
    yoann_req_count INT;
    real_post_count INT;
    real1 INT; real2 INT; real3 INT; real4 INT; real5 INT;
BEGIN
    SELECT COUNT(*) INTO final_req_count FROM public.requests;
    IF final_req_count != 5 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 5 remaining requests, found %', final_req_count;
    END IF;

    SELECT COUNT(*) INTO yoann_req_count FROM public.requests WHERE requester_id = '7fc0945b-3fda-43cc-8c62-b2490bda7927';
    IF yoann_req_count != 5 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Expected 5 Yoann requests, found %', yoann_req_count;
    END IF;

    SELECT COUNT(*) INTO real1 FROM public.requests WHERE id = '309c322a-93ab-484d-a37f-e024f484226e';
    SELECT COUNT(*) INTO real2 FROM public.requests WHERE id = '778db8a4-c9a6-4547-b83d-41dc55413f8b';
    SELECT COUNT(*) INTO real3 FROM public.requests WHERE id = '13f4e770-8597-4cbb-b619-d410ee5e4e93';
    SELECT COUNT(*) INTO real4 FROM public.requests WHERE id = '43efb480-7acc-4f85-a370-1232baec9942';
    SELECT COUNT(*) INTO real5 FROM public.requests WHERE id = '4438dd40-0219-4628-bb16-2405ecf296bc';

    IF (real1 + real2 + real3 + real4 + real5) != 5 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: One or more protected real requests were deleted!';
    END IF;

    SELECT COUNT(*) INTO real_post_count FROM public.bokantaj_posts WHERE id = '64318c77-c611-46de-9d9a-132e511bea35';
    IF real_post_count != 1 THEN
        RAISE EXCEPTION 'POST-CHECK FAILED: Real bokantaj_posts row missing!';
    END IF;
END $$;

ROLLBACK;
