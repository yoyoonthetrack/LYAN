'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const revision = require('../quote-revision');
const dossier = require('../mission-dossier');

const root = path.join(__dirname, '..');

test('prestation cap allows 1000 and refuses 1000.01 and 1200', () => {
    revision.setMissionCapEur(1000);
    assert.equal(revision.withinMissionCap(999).ok, true);
    assert.equal(revision.withinMissionCap(1000).ok, true);
    const cents = revision.withinMissionCap(1000.01);
    assert.equal(cents.ok, false);
    assert.equal(cents.message, 'Pour le moment, les missions sur LYANN sont limitées à 1 000 €. Ajustez votre devis pour continuer.');
    const milestones = revision.validateMilestones([
        { title: 'A', amount: 300 },
        { title: 'B', amount: 300 },
        { title: 'C', amount: 400 }
    ]);
    assert.equal(milestones.ok, true);
    assert.equal(milestones.totalAmount, 1000);
    const over = revision.validateMilestones([
        { title: 'A', amount: 500 },
        { title: 'B', amount: 500 },
        { title: 'C', amount: 500 }
    ]);
    assert.equal(over.ok, false);
    assert.equal(over.code, 'mission_cap');
});

test('an already accepted contract can be paid after the cap drops', () => {
    const legacy = revision.paymentContractDecision({
        contractualEur: 1500,
        milestoneSumEur: 1500,
        acceptedSnapshotEur: null
    });
    assert.equal(legacy.ok, true);
    assert.equal(legacy.grandfathered, true);
    const kept = revision.paymentContractDecision({
        contractualEur: 1000,
        milestoneSumEur: 1000,
        acceptedSnapshotEur: 1000
    });
    assert.equal(kept.ok, true);
    const inflated = revision.paymentContractDecision({
        contractualEur: 1000,
        milestoneSumEur: 1200,
        acceptedSnapshotEur: 1000
    });
    assert.equal(inflated.ok, false);
});

test('an opened unpaid mission is not labelled in progress', () => {
    const opened = dossier.dossierStatus({
        mission: { status: 'AGREED' },
        quotes: [{ status: 'ACCEPTED', milestones: [{ status: 'PENDING' }] }]
    });
    assert.equal(opened.label, 'Paiement à sécuriser');
    assert.equal(dossier.dossierBucket({ statusCode: opened.code }), 'waiting');
    const ready = dossier.dossierStatus({
        mission: { status: 'AGREED' },
        quotes: [{ status: 'ACCEPTED', milestones: [{ status: 'FUNDED' }] }]
    });
    assert.equal(ready.label, 'Prête à démarrer');
    assert.equal(dossier.dossierBucket({ statusCode: ready.code }), 'waiting');
    const started = dossier.dossierStatus({
        mission: { status: 'IN_PROGRESS' },
        quotes: [{ status: 'ACCEPTED', milestones: [{ status: 'IN_PROGRESS' }] }]
    });
    assert.equal(started.label, 'En cours');
    assert.equal(dossier.dossierBucket({ statusCode: started.code }), 'active');
});

test('client trace helpers no longer insert a second chat line', () => {
    const chat = fs.readFileSync(path.join(root, 'chat-logic.js'), 'utf8');
    assert.match(chat, /async function traceQuoteInThread\(\) \{\s*return;\s*\}/);
    assert.doesNotMatch(chat, /await traceQuoteInThread\(/);
    assert.doesNotMatch(chat, /await traceMomentLine\(/);
    const sql = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    assert.match(sql, /lyann_assert_prestation_cap/);
    assert.match(sql, /withdraw_sent_quote/);
    assert.match(sql, /propose_quote_amendment/);
    assert.match(sql, /lyann_skip_legacy_system_card/);
    assert.match(sql, /Pour le moment, les missions sur LYANN sont limitées à 1 000 €/);
});

test('amounts with more than two decimals are rejected and not rounded under the cap', () => {
    revision.setMissionCapEur(1000);
    assert.equal(revision.setMissionCapEur(1000.001), 1000);
    const third = revision.withinMissionCap(1000.001);
    assert.equal(third.ok, false);
    assert.equal(third.code, 'money_scale');
    const underRounded = revision.withinMissionCap(999.999);
    assert.equal(underRounded.ok, false);
    assert.equal(underRounded.code, 'money_scale');
    const exact = revision.validateMilestones([
        { title: 'A', amount: '333.33' },
        { title: 'B', amount: '333.33' },
        { title: 'C', amount: '333.34' }
    ]);
    assert.equal(exact.ok, true);
    assert.equal(exact.totalAmount, 1000);
    const fraction = revision.validateMilestones([
        { title: 'A', amount: '333.333' },
        { title: 'B', amount: '333.33' },
        { title: 'C', amount: '333.34' }
    ]);
    assert.equal(fraction.ok, false);
    assert.equal(fraction.code, 'money_scale');
    const contract = revision.paymentContractDecision({
        contractualEur: '1000.004',
        milestoneSumEur: 1000,
        acceptedSnapshotEur: 1000
    });
    assert.equal(contract.ok, false);
    assert.equal(contract.code, 'money_scale');
});

test('concurrent milestone writes are settled under the quote lock', () => {
    const passed = revision.settleLockedMilestoneBatches({
        capEur: 1000,
        status: 'SENT',
        batches: [[600], [400]]
    });
    assert.equal(passed.ok, true);
    assert.equal(passed.cents, 100000);
    const raced = revision.settleLockedMilestoneBatches({
        capEur: 1000,
        status: 'SENT',
        batches: [[600], [600]]
    });
    assert.equal(raced.ok, false);
    assert.equal(raced.code, 'mission_cap');
    const sameTransaction = revision.settleLockedMilestoneBatches({
        capEur: 1000,
        status: 'ACCEPTED',
        acceptedEur: 600,
        batches: [[300, 300]]
    });
    assert.equal(sameTransaction.ok, true);
    const sql = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    assert.match(sql, /FOR UPDATE/);
    assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
    assert.match(sql, /ORDER BY q\.id/);
    assert.match(sql, /UPDATE OF amount, status, quote_id OR DELETE/);
});

test('message trigger order stays compatible with timeline protection', () => {
    const sql = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    const names = [
        'messages_protect_timeline_insert',
        'trg_block_restricted_messages',
        'trg_lyann_skip_legacy_system_card'
    ];
    assert.deepEqual([...names].sort(), names);
    for (const label of ['Mission commencée', 'Mission terminée', 'Mission annulée']) {
        assert.match(sql, new RegExp(label));
    }
    assert.match(sql, /message_type IN \([\s\S]*'mission_started'/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.lyann_guard_milestone_sum\(\)/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.lyann_quote_timeline\(\)/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.lyann_notify_quote_push\(\)/);
    assert.match(sql, /SET search_path = public/);
    const rollback = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_rollback.sql'), 'utf8');
    for (const name of [
        'lyann_insert_timeline_event',
        'lyann_quote_timeline',
        'lyann_notify_quote_push',
        'lyann_notify_on_message',
        'lyann_enqueue_push_from_notification',
        'revise_sent_quote',
        'idx_messages_timeline_event',
        'quote_amendments',
        'lyann_record_mission_transition',
        'lyann_refuse_paid_amendment'
    ]) {
        assert.match(rollback, new RegExp(name));
    }
    assert.match(rollback, /Ne supprime pas/);
});

function systemCardFunction(sql) {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_skip_legacy_system_card()');
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_record_mission_transition()');
    assert.ok(start > 0 && end > start);
    return sql.slice(start, end);
}

function amendmentAcceptAllowed(state) {
    const started = new Set(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED']);
    const engagedMilestones = new Set(['FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED']);
    if (started.has(state.mission)) return { ok: false, code: 'started' };
    if ((state.milestones || []).some((status) => engagedMilestones.has(status))) return { ok: false, code: 'payment_secured' };
    if ((state.payments || []).length > 0) return { ok: false, code: 'payment_secured' };
    return { ok: true };
}

test('a member system_card cannot mint an official mission event', () => {
    const sql = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    const skip = systemCardFunction(sql);
    assert.match(skip, /RETURN NULL/);
    assert.doesNotMatch(skip, /lyann_insert_timeline_event/);
    assert.doesNotMatch(skip, /lyann_insert_notification/);
    assert.doesNotMatch(skip, /mission_started/);
    const recordStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_record_mission_transition()');
    const recordEnd = sql.indexOf('REVOKE ALL ON FUNCTION public.lyann_record_mission_transition()');
    const record = sql.slice(recordStart, recordEnd);
    assert.match(record, /NEW\.helper_id/);
    assert.match(record, /NEW\.requester_id/);
    assert.match(record, /request_invitations/);
    assert.match(record, /conversation_participants/);
    assert.doesNotMatch(record, /payload/);
    assert.doesNotMatch(record, /system_card/);
    assert.match(record, /OLD\.status = 'AGREED' AND NEW\.status = 'IN_PROGRESS'/);
});

test('accepting an amendment relocks money and loses the race to a new payment', () => {
    const sql = fs.readFileSync(path.join(root, '99_mission_cap_and_deal_dedupe_staging.sql'), 'utf8');
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_refuse_paid_amendment');
    const end = sql.indexOf('REVOKE ALL ON FUNCTION public.lyann_refuse_paid_amendment');
    const guard = sql.slice(start, end);
    assert.match(guard, /lyann_lock_quote_payment_rows/);
    assert.doesNotMatch(guard, /payment_status/);
    assert.match(guard, /'FUNDED'/);
    const lockStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_lock_quote_payment_rows');
    const lockEnd = sql.indexOf('REVOKE ALL ON FUNCTION public.lyann_lock_quote_payment_rows');
    const lock = sql.slice(lockStart, lockEnd);
    assert.match(lock, /FROM public\.quotes[\s\S]*FOR UPDATE/);
    assert.match(lock, /FROM public\.missions[\s\S]*FOR UPDATE/);
    assert.match(lock, /FROM public\.milestones[\s\S]*ORDER BY id[\s\S]*FOR UPDATE/);
    assert.match(lock, /ORDER BY p\.id[\s\S]*FOR UPDATE/);
    const insertStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.lyann_insert_milestone_payment');
    const insertBody = sql.slice(insertStart, sql.indexOf('REVOKE ALL ON FUNCTION public.lyann_insert_milestone_payment'));
    assert.match(insertBody, /PERFORM public\.lyann_lock_quote_payment_rows\(v_quote_id\)/);
    const insertAt = insertBody.indexOf('INSERT INTO public.payments');
    const lockAt = insertBody.indexOf('lyann_lock_quote_payment_rows');
    assert.ok(lockAt > 0 && lockAt < insertAt);
    const api = fs.readFileSync(path.join(root, 'api/server.js'), 'utf8');
    assert.match(api, /rpc\('lyann_insert_milestone_payment'/);
    assert.match(sql, /PERFORM public\.lyann_refuse_paid_amendment\(v_quote\.id, v_quote\.mission_id\)/);
    const open = { mission: 'AGREED', milestones: ['PENDING'], payments: [] };
    assert.equal(amendmentAcceptAllowed(open).ok, true);
    for (const status of ['CREATED', 'FAILED', 'CANCELLED', 'REFUNDED']) {
        const blocked = amendmentAcceptAllowed({ mission: 'AGREED', milestones: ['PENDING'], payments: [status] });
        assert.equal(blocked.ok, false, status);
        assert.equal(blocked.code, 'payment_secured');
    }
    const started = amendmentAcceptAllowed({ mission: 'IN_PROGRESS', milestones: ['FUNDED'], payments: ['SUCCEEDED'] });
    assert.equal(started.ok, false);
    const funded = amendmentAcceptAllowed({ mission: 'AGREED', milestones: ['FUNDED'], payments: [] });
    assert.equal(funded.code, 'payment_secured');
});

test('a secured payment blocks an amendment and a sent quote can still be revised', () => {
    const sent = revision.assessRevision({
        id: 'q',
        status: 'SENT',
        version: 1,
        provider_id: 'lyanneur',
        milestones: [{ status: 'PENDING' }],
        payments: []
    }, 'lyanneur');
    assert.equal(sent.ok, true);
    const blocked = revision.assessAmendment({
        id: 'q',
        status: 'ACCEPTED',
        version: 1,
        provider_id: 'lyanneur',
        mission_status: 'AGREED',
        milestones: [{ status: 'FUNDED' }],
        payments: []
    }, 'lyanneur');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, 'payment_secured');
});
