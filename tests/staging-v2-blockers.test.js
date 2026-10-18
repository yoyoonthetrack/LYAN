'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const sql57 = read('57_conversation_participant_rls.sql');
const rb57 = read('57_conversation_participant_rls_rollback.sql');
const sql58 = read('58_quote_duplicate_errcode.sql');
const rb58 = read('58_quote_duplicate_errcode_rollback.sql');
const sql55 = read('55_payment_failed_notification.sql');
const sql56 = read('56_profiles_anon_rls.sql');
const sql04 = read('04_quotes_and_milestones_migration.sql');
const client = read('api-client.js');
const messaging = read('messaging-repository.js');

function between(sql, start, end) {
    const from = sql.indexOf(start);
    const to = end ? sql.indexOf(end, from + start.length) : sql.length;
    assert.ok(from >= 0, start);
    return sql.slice(from, to === -1 ? sql.length : to);
}

test('57 reads participants without re-entering RLS and keeps the same membership test', () => {
    assert.match(sql57, /SECURITY DEFINER/);
    assert.match(sql57, /SET row_security = off/);
    assert.match(sql57, /user_id = auth\.uid\(\)/);
    assert.match(sql57, /conversation_id = _conversation_id/);
    assert.match(sql57, /REVOKE ALL ON FUNCTION public\.is_current_user_conversation_participant\(uuid\) FROM PUBLIC, anon/);
    assert.match(sql57, /GRANT EXECUTE ON FUNCTION public\.is_current_user_conversation_participant\(uuid\) TO authenticated, service_role/);
    assert.doesNotMatch(sql57, /GRANT EXECUTE[\s\S]+anon/);
    assert.doesNotMatch(sql57, /DELETE FROM|DROP TABLE|DROP POLICY/);
    assert.match(rb57, /RESET row_security/);
    assert.doesNotMatch(rb57, /SET row_security = off/);
});

test('58 changes only the existing-active-quote refusal to P0001', () => {
    const existsRaise = between(
        sql58,
        'Un devis actif (SENT ou ACCEPTED) existe déjà pour cette invitation',
        'SELECT COALESCE(MAX(version)'
    );
    assert.match(existsRaise, /ERRCODE = 'P0001'/);
    assert.doesNotMatch(existsRaise, /40001/);
    const race = between(
        sql58,
        'EXCEPTION WHEN unique_violation',
        'RETURN jsonb_build_object'
    );
    assert.match(race, /ERRCODE = '40001'/);
    assert.match(sql04, /idx_quotes_one_active_per_invitation/);
    assert.doesNotMatch(sql58, /DROP INDEX/);
    assert.doesNotMatch(sql58, /accept_request_quote/);
    assert.match(rb58, /existe déjà pour cette invitation'[\s\S]+ERRCODE = '40001'/);
    assert.equal(client.includes("code === '40001'"), false);
    assert.equal(client.includes('P0001'), false);
});

test('55 and 56 stay compatible with 57 and 58', () => {
    assert.doesNotMatch(sql55, /is_current_user_conversation_participant|create_request_quote/);
    assert.doesNotMatch(sql56, /SET row_security|create_request_quote/);
    assert.match(sql56, /is_current_user_conversation_participant\(conversation_id\)/);
    const order = [
        'schema.sql',
        'scripts/isolated-qa-requests-bridge.sql',
        '02_security_migration.sql',
        '57_conversation_participant_rls.sql',
        '04_quotes_and_milestones_migration.sql',
        '58_quote_duplicate_errcode.sql',
        '49_push_delivery_queue.sql',
        '55_payment_failed_notification.sql',
        '56_profiles_anon_rls.sql'
    ];
    order.forEach((name) => assert.equal(fs.existsSync(path.join(root, name)), true, name));
    assert.doesNotMatch(sql55, /payment_failed stays outside/);
    assert.match(sql55, /'payment_failed'/);
});

test('mission and milestone reads use Staging V2 column names', () => {
    assert.match(messaging, /related_request_id,request_invitation_id/);
    assert.doesNotMatch(messaging, /related_request_id,request_id,request_invitation_id/);
    assert.match(messaging, /order\('display_order'/);
    assert.doesNotMatch(messaging, /order\('position'/);
    assert.doesNotMatch(sql04, /milestones\.position/);
    assert.match(sql04, /display_order/);
    assert.doesNotMatch(sql57 + sql58, /missions\.request_id|milestones\.position/);
});
