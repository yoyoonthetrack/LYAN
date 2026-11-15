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
        'quote_amendments'
    ]) {
        assert.match(rollback, new RegExp(name));
    }
    assert.match(rollback, /Ne supprime pas/);
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
