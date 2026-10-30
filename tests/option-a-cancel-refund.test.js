'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const {
    preparePreTransferRefund,
    classifyPreTransferRefundBusiness,
    customerFeeRefundPolicy,
    optionARefundBreakdown,
    optionARefundAmountCents,
    preTransferRefundExecutionEnabled
} = require('../api/stripe-policy');
const { missionCard } = require('../quote-payment-eligibility.js');
const { dossierActionIds } = require('../mission-dossier.js');

const requester = 'requester-a';
const provider = 'provider-b';

function payment8() {
    return {
        id: 'pay-8',
        milestone_id: 'milestone-1',
        payment_status: 'SUCCEEDED',
        transfer_status: 'PENDING_VALIDATION',
        client_validated_at: null,
        stripe_transfer_id: null,
        stripe_refund_id: null,
        stripe_payment_intent_id: 'pi_option_a',
        service_amount_cents: 800,
        customer_fee_cents: 149,
        customer_total_cents: 949
    };
}

function quote(overrides) {
    return Object.assign({
        id: 'quote-1',
        status: 'ACCEPTED',
        requester_id: requester,
        provider_id: provider,
        mission_id: 'mission-1',
        description: 'Option A',
        total_amount: 8,
        payments: [payment8()],
        milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'FUNDED', amount: 8 }]
    }, overrides || {});
}

function prepare(overrides) {
    return preparePreTransferRefund(Object.assign({
        authUid: requester,
        requesterId: requester,
        payment: payment8(),
        milestone: { status: 'FUNDED' },
        mission: { status: 'AGREED', requester_id: requester },
        body: { milestone_id: 'milestone-1' },
        livemode: false,
        grantActive: false,
        grantEvaluation: { ok: false, write: false, code: 'GRANT_INACTIVE' }
    }, overrides || {}));
}

test('retain refunds 8,00 € service and keeps 1,49 € LYANN fee', () => {
    const breakdown = optionARefundBreakdown(payment8());
    assert.equal(breakdown.service_cents, 800);
    assert.equal(breakdown.customer_fee_cents, 149);
    assert.equal(breakdown.customer_total_cents, 949);
    assert.equal(breakdown.remaining_service_cents, 800);
    assert.equal(breakdown.consistent, true);
    assert.equal(customerFeeRefundPolicy({}).code, 'FEE_POLICY_UNDECIDED');
    assert.equal(optionARefundAmountCents(payment8(), {}).code, 'FEE_POLICY_UNDECIDED');
    assert.equal(optionARefundAmountCents(payment8(), { LYANN_CUSTOMER_FEE_REFUND: 'refund' }).amount_cents, 949);
    const retain = optionARefundAmountCents(payment8(), { LYANN_CUSTOMER_FEE_REFUND: 'retain' });
    assert.equal(retain.ok, true);
    assert.equal(retain.amount_cents, 800);
    assert.equal(optionARefundAmountCents({
        ...payment8(),
        service_amount_cents: 800.5
    }, { LYANN_CUSTOMER_FEE_REFUND: 'retain' }).code, 'AMOUNT_UNAVAILABLE');
    assert.equal(optionARefundAmountCents({
        ...payment8(),
        amount_refunded_cents: 800,
        customer_fee_refunded_cents: 0
    }, { LYANN_CUSTOMER_FEE_REFUND: 'retain' }).code, 'ALREADY_REFUNDED');
    const twoJalons = [
        optionARefundAmountCents(payment8(), { LYANN_CUSTOMER_FEE_REFUND: 'retain' }),
        optionARefundAmountCents({
            ...payment8(),
            id: 'pay-12',
            milestone_id: 'milestone-2',
            service_amount_cents: 1200,
            customer_fee_cents: 149,
            customer_total_cents: 1349
        }, { LYANN_CUSTOMER_FEE_REFUND: 'retain' })
    ];
    assert.deepEqual(twoJalons.map((row) => row.amount_cents), [800, 1200]);
});

test('auto-refund execution stays off without commercial fee policy', () => {
    assert.equal(preTransferRefundExecutionEnabled(), false);
    assert.equal(prepare().code, 'EXECUTION_DISABLED');
    assert.equal(prepare({ env: { STRIPE_TEST_AUTO_REFUND: 'true' } }).code, 'FEE_POLICY_UNDECIDED');
    assert.equal(prepare({ livemode: true }).code, 'LIVE_REFUND_BLOCKED');
});

test('started, completed, transferred and disputed work never auto-refund', () => {
    assert.equal(classifyPreTransferRefundBusiness({
        payment: payment8(),
        milestone: { status: 'IN_PROGRESS' },
        mission: { status: 'AGREED' }
    }).code, 'BUSINESS_POLICY_REQUIRED');
    assert.equal(prepare({ milestone: { status: 'IN_PROGRESS' } }).code, 'BUSINESS_POLICY_REQUIRED');
    assert.equal(prepare({ milestone: { status: 'COMPLETED' } }).code, 'BUSINESS_POLICY_REQUIRED');
    assert.equal(prepare({
        payment: Object.assign(payment8(), { transfer_status: 'TRANSFERRED', stripe_transfer_id: 'tr_1' }),
        milestone: { status: 'RELEASED' }
    }).code, 'ALREADY_TRANSFERRED');
    assert.equal(prepare({
        payment: Object.assign(payment8(), { payment_status: 'DISPUTED' }),
        milestone: { status: 'DISPUTED' }
    }).code, 'DISPUTED');
    assert.equal(prepare({
        payment: Object.assign(payment8(), { client_validated_at: '2026-10-29T00:00:00.000Z' }),
        milestone: { status: 'FUNDED' }
    }).code, 'TRANSFER_IN_PROGRESS');
});

test('provider consent after start makes the refund eligible, still not executed', () => {
    const classified = classifyPreTransferRefundBusiness({
        payment: payment8(),
        milestone: { status: 'IN_PROGRESS' },
        mission: { status: 'AGREED' },
        providerConsented: true
    });
    assert.equal(classified.decision, 'AUTO_ELIGIBLE');
    const prepared = prepare({
        milestone: { status: 'IN_PROGRESS', cancellation_status: 'ACCEPTED' },
        providerConsented: true
    });
    assert.equal(prepared.execute, false);
    assert.equal(prepared.code, 'EXECUTION_DISABLED');
});

test('dossier CTAs follow option A without hiding report after a refusal', () => {
    const funded = quote();
    assert.equal(missionCard(funded, requester, 'active').actions[0].id, 'refund');
    assert.match(missionCard(funded, requester, 'active').actions[0].label, /8,00/);
    assert.doesNotMatch(missionCard(funded, requester, 'active').actions[0].label, /9,49/);
    assert.match(missionCard(funded, requester, 'active').actions[0].confirmCopy, /Montant de prestation concerné : 8,00/);
    assert.match(missionCard(funded, requester, 'active').actions[0].confirmCopy, /conservés : 1,49/);
    assert.match(missionCard(funded, requester, 'active').actions[0].confirmCopy, /Total payé : 9,49/);
    assert.match(missionCard(funded, requester, 'active').actions[0].confirmCopy, /Aucun remboursement automatique/);
    assert.equal(missionCard(funded, provider, 'active').actions[0].id, 'start');

    const started = quote({ milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'IN_PROGRESS', amount: 8 }] });
    assert.equal(missionCard(started, requester, 'active').actions[0].id, 'request_cancel');
    assert.equal(missionCard(started, provider, 'active').actions[0].id, 'done');

    const asked = quote({
        milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'IN_PROGRESS', amount: 8, cancellation_status: 'REQUESTED' }]
    });
    const askedProvider = missionCard(asked, provider, 'active');
    assert.deepEqual(askedProvider.actions.map((action) => action.id), ['accept_cancel', 'refuse_cancel']);
    assert.equal(askedProvider.primaryAction.id, 'accept_cancel');
    assert.equal(askedProvider.secondaryActions[0].id, 'refuse_cancel');
    assert.equal(askedProvider.secondaryActions[0].label, 'Je continue');
    assert.equal(missionCard(asked, requester, 'active').actions.length, 0);

    const refused = quote({
        milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'IN_PROGRESS', amount: 8, cancellation_status: 'REFUSED' }]
    });
    assert.equal(missionCard(refused, requester, 'active').actions.some((action) => action.id === 'request_cancel' || action.id === 'refund'), false);
    const ids = dossierActionIds({
        roleCode: 'requester',
        quoteStatus: 'ACCEPTED',
        hasReportableMilestone: true,
        cardActionIds: []
    });
    assert.ok(ids.includes('report'));

    const validated = quote({ milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'COMPLETED', amount: 8 }] });
    assert.equal(missionCard(validated, requester, 'active').actions[0].id, 'release');
    assert.equal(missionCard(validated, requester, 'active').actions.some((action) => action.id === 'refund'), false);
});

test('migration 88 is additive to 87 and blocks closing a paid request', () => {
    const sql87 = fs.readFileSync(path.join(__dirname, '../87_lyann_mission_cancel_after_payment_guard_staging.sql'), 'utf8');
    const sql88 = fs.readFileSync(path.join(__dirname, '../88_milestone_cancellation_option_a_staging.sql'), 'utf8');
    assert.match(sql87, /CREATE OR REPLACE FUNCTION public\.cancel_mission_secure/);
    assert.doesNotMatch(sql88, /CREATE OR REPLACE FUNCTION public\.cancel_mission_secure/);
    assert.match(sql88, /lyann_block_request_close_when_paid/);
    assert.match(sql88, /CLOSED', 'COMPLETED', 'CANCELLED/);
    assert.match(sql88, /BEFORE UPDATE OF status OR DELETE/);
    const server = fs.readFileSync(path.join(__dirname, '../api/server.js'), 'utf8');
    assert.match(server, /\/v1\/milestones\/request-cancel/);
    assert.match(server, /\/v1\/milestones\/decide-cancel/);
    const activity = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
    assert.match(activity, /requestHasEngagedMoney/);
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(chat, /confirmCopy/);
    assert.doesNotMatch(chat, /refunds\.create/);
    const policy = fs.readFileSync(path.join(__dirname, '../api/stripe-policy.js'), 'utf8');
    assert.match(policy, /STRIPE_TEST_AUTO_REFUND/);
    assert.match(policy, /remaining_service_cents/);
});

test('abandoned, failed and in-flight payments stay off the retain refund path', () => {
    assert.equal(prepare({
        payment: Object.assign(payment8(), { payment_status: 'FAILED', stripe_payment_intent_id: 'pi_fail' })
    }).code, 'NOT_FUNDED');
    assert.equal(prepare({
        payment: Object.assign(payment8(), { payment_status: 'CREATED' })
    }).code, 'NOT_FUNDED');
    const created = quote({
        payments: [{ ...payment8(), payment_status: 'CREATED' }],
        milestones: [{ id: 'milestone-1', title: 'Prestation', status: 'PENDING', amount: 8 }]
    });
    assert.equal(missionCard(created, requester, 'active').actions.some((action) => action.id === 'refund'), false);
    const mixed = quote({
        milestones: [
            { id: 'milestone-1', title: 'Acompte', status: 'IN_PROGRESS', amount: 8 },
            { id: 'milestone-2', title: 'Solde', status: 'PENDING', amount: 12 }
        ],
        payments: [payment8()]
    });
    const providerCard = missionCard(mixed, provider, 'active');
    assert.equal(providerCard.actions[0].id, 'done');
    const requesterCard = missionCard(mixed, requester, 'active');
    assert.equal(requesterCard.actions.some((action) => action.id === 'refund'), false);
    assert.equal(requesterCard.actions[0].id, 'request_cancel');
});

test('execution stays disabled even when retain and test auto-refund are both set', () => {
    const prepared = prepare({
        env: { LYANN_CUSTOMER_FEE_REFUND: 'retain', STRIPE_TEST_AUTO_REFUND: 'false' }
    });
    assert.equal(prepared.execute, false);
    assert.equal(prepared.code, 'EXECUTION_DISABLED');
    const wouldReady = prepare({
        env: { LYANN_CUSTOMER_FEE_REFUND: 'retain', STRIPE_TEST_AUTO_REFUND: 'true' }
    });
    assert.equal(wouldReady.execute, true);
    assert.equal(wouldReady.amount_cents, 800);
    assert.equal(wouldReady.fee_policy, 'FEE_RETAINED');
});
