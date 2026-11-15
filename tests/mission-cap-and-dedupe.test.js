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
