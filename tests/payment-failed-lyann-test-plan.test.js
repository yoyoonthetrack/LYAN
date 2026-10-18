'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql54 = fs.readFileSync(path.join(__dirname, '..', '54_deal_notification_skip.sql'), 'utf8');
const sql55 = fs.readFileSync(path.join(__dirname, '..', '55_payment_failed_notification.sql'), 'utf8');
const sql55rb = fs.readFileSync(path.join(__dirname, '..', '55_payment_failed_notification_rollback.sql'), 'utf8');

function skipList(sql) {
    const match = sql.match(/lyann_notify_on_message[\s\S]+?IF NEW\.message_type IN \(([\s\S]+?)\)\s+THEN/);
    return match ? match[1] : '';
}

test('2a.3 Lyann-test apply order: 55 is self-contained and atomic', () => {
    assert.match(sql55, /^BEGIN;/m);
    assert.match(sql55, /^COMMIT;/m);
    const producer = sql55.indexOf('CREATE TRIGGER trg_lyann_notify_payment_failed');
    const skip = sql55.indexOf('CREATE OR REPLACE FUNCTION public.lyann_notify_on_message');
    assert.ok(producer > 0 && skip > producer);
    assert.match(skipList(sql55), /payment_failed/);
    assert.doesNotMatch(skipList(sql54), /payment_failed/);
    assert.match(sql54, /Do not apply 54 after 55/);
    assert.doesNotMatch(skipList(sql55), /visit_accepted|visit_declined/);
    assert.match(sql55, /QUOTE_RECEIVED/);
    assert.match(sql55, /MISSION_ACCEPTED/);
    assert.match(sql55, /WORK_TO_VALIDATE/);
    assert.match(sql55, /PAYOUT_READY/);
});

test('2a.3 Lyann-test rollback plan does not silence the requester', () => {
    assert.match(sql55rb, /^BEGIN;/m);
    assert.match(sql55rb, /^COMMIT;/m);
    assert.match(sql55rb, /KEEPING lyann_notify_payment_failed/);
    assert.doesNotMatch(sql55rb, /^DROP TRIGGER IF EXISTS trg_lyann_notify_payment_failed/m);
    assert.doesNotMatch(skipList(sql55rb), /payment_failed/);
    assert.doesNotMatch(sql55rb, /DELETE FROM public\.notifications/);
});

test('2b rollback enqueue routes finances: PAYMENT_FAILED to Finances, never a contact', () => {
    const enqueue = sql55rb.slice(sql55rb.indexOf('lyann_enqueue_push_from_notification'));
    assert.match(enqueue, /ELSIF NEW\.type = 'PAYMENT_FAILED'/);
    assert.doesNotMatch(
        enqueue,
        /NEW\.type IN \('QUOTE_RECEIVED', 'MISSION_ACCEPTED', 'WORK_TO_VALIDATE', 'PAYMENT_FAILED'\)/
    );
    assert.match(enqueue, /split_part\(COALESCE\(NEW\.entity_id, ''\), ':', 1\) = 'finances'/);
    assert.match(enqueue, /v_route := 'finances'/);
    assert.match(enqueue, /v_contact := NULL/);
    assert.match(enqueue, /v_request := NULL/);
    assert.match(enqueue, /v_request := NULLIF\(split_part\(COALESCE\(NEW\.entity_id, ''\), ':', 3\), ''\)/);
    assert.match(sql55rb, /lyann_insert_notification/);
    assert.match(sql55rb, /ON CONFLICT DO NOTHING/);
    assert.match(sql55, /evt:PAYMENT_FAILED:/);
    assert.match(sql55rb, /evt:PAYMENT_FAILED:/);
});

test('2a.3 Lyann-test checklist remains unexecuted', () => {
    assert.match(sql55, /Lyann-test only/);
    assert.match(sql55, /Do not apply on Supabase Production/);
    assert.doesNotMatch(sql55, /psql |supabase db push|ALTER DATABASE/);
});
