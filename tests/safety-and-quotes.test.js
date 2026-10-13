'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const revision = require('../quote-revision.js');

const provider = 'provider-1';
const requester = 'requester-1';

function sentQuote(overrides = {}) {
    return {
        id: 'quote-1',
        status: 'SENT',
        version: 2,
        provider_id: provider,
        requester_id: requester,
        description: 'Peinture du salon',
        milestones: [
            { id: 'm1', title: 'Préparation', amount: 100, status: 'PENDING', display_order: 1 },
            { id: 'm2', title: 'Finition', amount: 150, status: 'PENDING', display_order: 2 }
        ],
        payments: [],
        ...overrides
    };
}

test('a provider can revise a sent quote and the total is the sum of the parts', () => {
    const reordered = [
        { title: 'Finition', description: 'Deux couches', amount: 180 },
        { title: 'Préparation', description: '', amount: 90 },
        { title: 'Protection', description: 'Bâchage', amount: 30 }
    ];
    const result = revision.validateRevision({
        quote: sentQuote(),
        callerId: provider,
        description: 'Peinture, deux couches, délai de huit jours.',
        milestones: reordered,
        expectedVersion: 2
    });
    assert.equal(result.ok, true);
    assert.equal(result.totalAmount, 300);
    assert.deepEqual(result.milestones.map((row) => row.display_order), [1, 2, 3]);
    assert.equal(result.milestones[0].title, 'Finition');
});

test('a single part is a fixed-price revision', () => {
    const result = revision.validateRevision({
        quote: sentQuote({ milestones: [{ title: 'Forfait', amount: 80, status: 'PENDING' }] }),
        callerId: provider,
        description: 'Forfait déplacement et réparation.',
        milestones: [{ title: 'Forfait', amount: 95 }],
        expectedVersion: 2
    });
    assert.equal(result.ok, true);
    assert.equal(result.milestones.length, 1);
    assert.equal(result.totalAmount, 95);
});

test('an accepted quote cannot be revised', () => {
    const result = revision.assessRevision(sentQuote({ status: 'ACCEPTED' }), provider);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'immutable');
});

test('the client cannot revise the provider quote', () => {
    const result = revision.assessRevision(sentQuote(), requester);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'forbidden');
});

test('a funded milestone and any recorded payment freeze the quote', () => {
    assert.equal(revision.assessRevision(sentQuote({
        milestones: [{ title: 'Acompte', amount: 100, status: 'FUNDED' }]
    }), provider).code, 'locked_milestone');
    assert.equal(revision.assessRevision(sentQuote({
        payments: [{ milestone_id: 'm1', payment_status: 'FAILED' }]
    }), provider).code, 'payment');
});

test('a stale version is rejected', () => {
    const result = revision.validateRevision({
        quote: sentQuote(),
        callerId: provider,
        description: 'Mise à jour',
        milestones: [{ title: 'Forfait', amount: 40 }],
        expectedVersion: 1
    });
    assert.equal(result.code, 'conflict');
});

test('removing the last part is rejected', () => {
    assert.equal(revision.validateMilestones([]).code, 'empty');
});

test('a revised quote shows the old amount, the new amount and the milestone changes', () => {
    const summary = revision.describeRevision({
        version: 3,
        total_amount: 300,
        milestones: [
            { title: 'Finition', amount: 180, description: 'Deux couches' },
            { title: 'Protection', amount: 30, description: '' }
        ],
        previousRevision: {
            version: 2,
            total_amount: 250,
            description: 'Peinture du salon',
            milestones: [
                { title: 'Préparation', amount: 100, description: '' },
                { title: 'Finition', amount: 150, description: '' }
            ]
        }
    });
    assert.equal(summary.changed, true);
    assert.equal(summary.title, 'Devis modifié');
    assert.equal(summary.previousAmount, 250);
    assert.equal(summary.nextAmount, 300);
    assert.ok(summary.lines.some((line) => line.kind === 'removed' && line.text.includes('Préparation')));
    assert.ok(summary.lines.some((line) => line.kind === 'changed' && line.text.includes('150.00') && line.text.includes('180.00')));
    assert.ok(summary.lines.some((line) => line.kind === 'added' && line.text.includes('Protection')));
});

test('acceptance keeps old clients, exact versions, blocks and a single mission', () => {
    const sent = { status: 'SENT', version: 1, blocked: false, activeMission: false };
    assert.equal(revision.decideAcceptance(sent).code, 'legacy_current');
    assert.equal(revision.decideAcceptance({ ...sent, expectedVersion: 1 }).code, 'versioned');
    assert.equal(revision.decideAcceptance({ ...sent, blocked: true }).code, 'blocked');
    assert.equal(revision.decideAcceptance({ ...sent, blocked: true, expectedVersion: 1 }).code, 'blocked');
    assert.equal(revision.decideAcceptance({ ...sent, version: 2 }).code, 'legacy_revised');
    assert.equal(revision.decideAcceptance({ ...sent, version: 2, expectedVersion: 1 }).code, 'stale');
    assert.equal(revision.decideAcceptance({ ...sent, version: 2, expectedVersion: 2 }).code, 'versioned');
    assert.equal(revision.decideAcceptance({ ...sent, status: 'ACCEPTED', expectedVersion: 1 }).code, 'not_sent');
    assert.equal(revision.decideAcceptance({ ...sent, activeMission: true, expectedVersion: 1 }).code, 'already_open');
    assert.equal(revision.decideAcceptance({ ...sent, expectedVersion: 1 }).payment, false);
});

test('accepting a quote sends the displayed version and never falls back to the old signature', () => {
    assert.equal(revision.planQuoteAcceptance(1).version, 1);
    assert.equal(revision.planQuoteAcceptance(2).ok, true);
    assert.equal(revision.planQuoteAcceptance(null).code, 'version_required');
    assert.equal(revision.planQuoteAcceptance('').payment, false);
    assert.equal(revision.planQuoteAcceptance(1.5).ok, false);
    const missing = { code: 'PGRST202', message: 'Could not find the function public.accept_request_quote(p_quote_id, p_expected_version) in the schema cache' };
    assert.equal(revision.acceptSignatureFallback(missing, 1).retry, false);
    assert.equal(revision.acceptSignatureFallback(missing, 1).payment, false);
    assert.match(revision.acceptSignatureFallback(missing, 1).message, /pas encore active/);
    const revised = revision.acceptSignatureFallback(missing, 2);
    assert.equal(revised.retry, false);
    assert.match(revised.message, /pas encore active/);
    assert.equal(revision.acceptSignatureFallback({ message: 'Seul le demandeur de la prestation peut accepter ce devis' }, 1).retry, false);
    const client = fs.readFileSync(path.join(__dirname, '..', 'api-client.js'), 'utf8');
    const call = client.slice(client.indexOf('async acceptRequestQuote'), client.indexOf('async rejectRequestQuote'));
    assert.match(call, /p_expected_version: version/);
    assert.match(call, /acceptSignatureFallback/);
    assert.doesNotMatch(call, /rpc\('accept_request_quote', \{ p_quote_id: quoteId \}\)/);
    assert.doesNotMatch(call, /stripe|createPayment|paymentIntents/i);
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const accept = chat.slice(chat.indexOf('window.handleAcceptQuote'), chat.indexOf('window.handleRejectQuote'));
    assert.match(accept, /quoteActionLocks.has\(quoteId\)/);
    assert.match(accept, /planQuoteAcceptance/);
    assert.match(accept, /acceptRequestQuote\(quoteId, acceptance.version\)/);
});

test('a new annonce does not inherit a completed mission from the same conversation', () => {
    const oldMission = { id: 'mission-old', status: 'COMPLETED', related_request_id: 'annonce-ancienne', title: 'Ancienne mission' };
    const active = { id: 'mission-live', status: 'IN_PROGRESS', related_request_id: 'annonce-b', title: 'Mission en cours' };
    const otherActive = { id: 'mission-other', status: 'AGREED', request_id: 'annonce-c', title: 'Autre mission' };
    const fromLyanner = revision.selectThreadContext({
        missions: [oldMission, active],
        requestId: 'annonce-nouvelle'
    });
    assert.equal(fromLyanner.mission, null);
    assert.equal(fromLyanner.requestId, 'annonce-nouvelle');
    const sameAnnonce = revision.selectThreadContext({
        missions: [oldMission],
        requestId: 'annonce-ancienne'
    });
    assert.equal(sameAnnonce.mission.id, 'mission-old');
    const fromInbox = revision.selectThreadContext({ missions: [oldMission, { ...oldMission, id: 'mission-old-2' }] });
    assert.equal(fromInbox.mission, null);
    assert.equal(fromInbox.ambiguous, false);
    const several = revision.selectThreadContext({ missions: [active, otherActive] });
    assert.equal(several.mission, null);
    assert.equal(several.ambiguous, true);
    const explicit = revision.selectThreadContext({
        missions: [oldMission, active],
        explicitMissionId: 'mission-old'
    });
    assert.equal(explicit.mission.id, 'mission-old');
});

test('a quote follows the open annonce and leaves the completed mission untouched', () => {
    const oldInvitation = {
        id: 'inv-old', request_id: 'annonce-ancienne', status: 'ACCEPTED',
        requester_id: 'ludivine', recipient_id: 'helper'
    };
    const newInvitation = {
        id: 'inv-new', request_id: 'annonce-nouvelle', status: 'ACCEPTED',
        requester_id: 'ludivine', recipient_id: 'helper'
    };
    const chosen = revision.selectInvitationForRequest({
        invitations: [oldInvitation, newInvitation],
        requestId: 'annonce-nouvelle',
        userA: 'helper',
        userB: 'ludivine'
    });
    assert.equal(chosen.ok, true);
    assert.equal(chosen.invitation.id, 'inv-new');
    assert.notEqual(chosen.invitation.request_id, oldInvitation.request_id);
    const missing = revision.selectInvitationForRequest({
        invitations: [oldInvitation],
        requestId: 'annonce-nouvelle',
        userA: 'helper',
        userB: 'ludivine'
    });
    assert.equal(missing.code, 'missing');
    const stranger = revision.selectInvitationForRequest({
        invitations: [{ ...newInvitation, recipient_id: 'quelquun' }],
        requestId: 'annonce-nouvelle',
        userA: 'helper',
        userB: 'ludivine'
    });
    assert.equal(stranger.code, 'missing');
    const demandeur = revision.selectInvitationForRequest({
        invitations: [newInvitation],
        requestId: 'annonce-nouvelle',
        userA: 'ludivine',
        userB: 'helper'
    });
    assert.equal(demandeur.code, 'not_recipient');
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const creator = chat.slice(chat.indexOf('async function createProductionQuoteForContact'), chat.indexOf('function invalidateActiveQuoteContext'));
    assert.match(creator, /getAcceptedInvitationForRequest\(requestId, myId, contactId\)/);
    assert.doesNotMatch(creator, /getActiveInvitationBetween|getActiveMissionBetween/);
    const sql = fs.readFileSync(path.join(__dirname, '..', '04_quotes_and_milestones_migration.sql'), 'utf8');
    const quoteFn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_request_quote'), sql.indexOf('CREATE OR REPLACE FUNCTION public.accept_request_quote'));
    assert.match(quoteFn, /request_id/);
    assert.match(quoteFn, /v_inv_record\.request_id/);
});

test('an unchanged quote is not presented as modified', () => {
    assert.equal(revision.describeRevision({ version: 1, milestones: [], previousRevision: null }).changed, false);
});

test('the local migration protects accepted quotes, payments and new conversations', () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '51_quote_modifications_and_safety.sql'), 'utf8');
    assert.match(sql, /status IS DISTINCT FROM 'SENT'/);
    assert.match(sql, /p_expected_version IS DISTINCT FROM v_current_version/);
    assert.match(sql, /FUNDED', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'RELEASED', 'DISPUTED'/);
    assert.match(sql, /Un paiement est déjà engagé/);
    assert.match(sql, /INSERT INTO public\.quote_revisions/);
    assert.match(sql, /refuse_blocked_new_participant/);
    assert.match(sql, /auth\.uid\(\) IS NULL/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.get_or_create_conversation/);
    assert.doesNotMatch(sql, /CREATE OR REPLACE FUNCTION public\.is_blocked_between/);
    assert.match(sql, /v_recent >= 10/);
    assert.match(sql, /idx_user_reports_one_open/);
    assert.doesNotMatch(sql, /INSERT INTO public\.payments/);
    assert.doesNotMatch(sql, /stripe/i);
    const followUp = fs.readFileSync(path.join(__dirname, '..', '52_quote_acceptance_blocks_and_report_evidence.sql'), 'utf8');
    const block = fs.readFileSync(path.join(__dirname, '..', '46_user_block_enforcement.sql'), 'utf8');
    assert.match(block, /BEFORE INSERT ON public\.messages/);
    assert.match(block, /current_user <> 'authenticated'/);
    assert.doesNotMatch(followUp, /DROP FUNCTION IF EXISTS public\.accept_request_quote\(uuid\)/);
    assert.match(followUp, /FUNCTION public\.accept_request_quote\(p_quote_id uuid\)/);
    assert.match(followUp, /FUNCTION public\.accept_request_quote\(\s*p_quote_id uuid,\s*p_expected_version int/);
    assert.match(followUp, /v_version > 1/);
    assert.match(followUp, /Mettez à jour LYANN pour accepter la nouvelle version/);
    assert.match(followUp, /AND status = 'SENT'/);
    assert.match(followUp, /COALESCE\(version, 1\) = v_version/);
    assert.match(followUp, /p_expected_version IS DISTINCT FROM v_version/);
    assert.match(followUp, /is_blocked_between\(v_quote_record\.provider_id, v_quote_record\.requester_id\)/);
    assert.match(followUp, /OLD\.status = 'SENT' AND NEW\.status = 'ACCEPTED'/);
    assert.match(followUp, /Ce devis ne peut plus être accepté/);
    assert.doesNotMatch(followUp, /UPDATE public\.missions[\s\S]{0,80}status = 'CANCELLED'/);
    assert.doesNotMatch(followUp, /CREATE OR REPLACE FUNCTION public\.cancel_mission_secure/);
    assert.match(followUp, /trg_refuse_blocked_quote_write/);
    assert.match(followUp, /trg_refuse_blocked_invitation/);
    assert.match(followUp, /report-evidence/);
    assert.match(followUp, /public = false/);
    assert.match(followUp, /reporter_id = auth\.uid\(\) OR public\.is_current_user_admin\(\)/);
    assert.doesNotMatch(followUp, /UPDATE public\.payments/);
    assert.doesNotMatch(followUp, /UPDATE public\.milestones/);
    const client = fs.readFileSync(path.join(__dirname, '..', 'api-client.js'), 'utf8');
    assert.match(client, /p_expected_version: version/);
    const audit = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'architecture-audit.js'), 'utf8');
    assert.match(audit, /scriptTagIndex/);
});

test('profile and conversation reports go through the safety repository, not local storage', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    const handler = script.slice(script.indexOf("reportForm.addEventListener('submit'"), script.indexOf('window.getRequestStatusBadge'));
    assert.match(handler, /LYANN_SAFETY_REPOSITORY\.report/);
    assert.doesNotMatch(handler, /LYANN_REPORTS/);
    const safety = fs.readFileSync(path.join(__dirname, '..', 'safety-repository.js'), 'utf8');
    assert.match(safety, /submit_user_report/);
    assert.match(safety, /listBlockedProfiles/);
    const admin = fs.readFileSync(path.join(__dirname, '..', 'admin-script.js'), 'utf8');
    assert.match(admin, /fetchAdminOps\('reports'\)/);
    assert.match(admin, /IN_REVIEW/);
});

test('a direct quote accepts 80, 200, 500 and 2000 euros without a payment', () => {
    for (const amount of [80, 200, 500, 2000, 80.5]) {
        const result = revision.validateQuoteAmount(amount);
        assert.equal(result.ok, true);
        assert.equal(result.amount, amount);
        assert.equal(result.payment, false);
        const milestone = revision.validateMilestones([{ title: 'Prestation', amount }]);
        assert.equal(milestone.ok, true);
        assert.equal(milestone.totalAmount, amount);
    }
    assert.equal(revision.validateQuoteAmount(0).ok, false);
    assert.equal(revision.validateQuoteAmount(-20).ok, false);
    assert.equal(revision.validateQuoteAmount('abc').ok, false);
    assert.equal(revision.validateQuoteAmount(10.005).amount, 10.01);
});

test('quote screens and the quote contract no longer cap amounts at 200 euros', () => {
    const root = path.join(__dirname, '..');
    const pages = ['feed.html', 'results.html', 'index.html', 'about.html', 'legal.html', 'pricing.html', 'how-it-works.html', 'confidentialite.html', 'payment-portal.html'];
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        const choiceStart = html.indexOf('id="chatActionChoicesOverlay"');
        const directStart = html.indexOf('id="chatDirectPriceForm"');
        const milestoneStart = html.indexOf('id="chatMilestoneDevisForm"');
        assert.ok(choiceStart > 0 && directStart > choiceStart && milestoneStart > directStart, page);
        const choice = html.slice(choiceStart, directStart);
        const direct = html.slice(directStart, milestoneStart);
        assert.match(choice, /Un montant unique pour votre prestation\./);
        assert.match(choice, /Plusieurs étapes avec paiements progressifs\./);
        assert.doesNotMatch(choice + direct, /200\s*€|petits montants|petit montant|petit service|-200/);
        const amount = direct.match(/id="dpAmount"[^>]*>/);
        assert.ok(amount, page);
        assert.match(amount[0], /min="0\.01"/);
        assert.match(amount[0], /step="0\.01"/);
        assert.doesNotMatch(amount[0], /\smax=/);
        const total = html.slice(milestoneStart, milestoneStart + 2500).match(/id="mdTotalAmount"[^>]*>/);
        assert.ok(total, page);
        assert.match(total[0], /min="0\.01"/);
        assert.doesNotMatch(total[0], /min="200"|min="5"/);
    }
    const chat = fs.readFileSync(path.join(root, 'chat-logic.js'), 'utf8');
    const submit = chat.slice(chat.indexOf('async function handleDirectPriceFormSubmit'), chat.indexOf('window.handleDirectPriceFormSubmit'));
    assert.match(submit, /validateQuoteAmount\(amount\)/);
    assert.match(submit, /createProductionQuoteForContact\(contact\.id, desc, amountCheck\.amount\)/);
    assert.doesNotMatch(submit, /199|200/);
    const sql = fs.readFileSync(path.join(root, '04_quotes_and_milestones_migration.sql'), 'utf8');
    const creator = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.create_request_quote'), sql.indexOf('CREATE OR REPLACE FUNCTION public.accept_request_quote'));
    assert.match(creator, /strictement supérieur à 0/);
    assert.doesNotMatch(creator, /> 200|>= 200|< 200|max="199"/);
});

test('the disconnected payment portal no longer states a 200 euro ceiling', () => {
    const root = path.join(__dirname, '..');
    const portal = fs.readFileSync(path.join(root, 'payment-portal.html'), 'utf8');
    assert.doesNotMatch(portal, />200\s*€|<200\s*€|exceeds €200/);
    assert.match(portal, /Plan de travail par jalons/);
    assert.match(portal, /Prestation unique</);
    assert.match(portal, /Plan de travail par parties/);
    const payments = fs.readFileSync(path.join(root, 'payment-script.js'), 'utf8');
    const reader = payments.slice(payments.indexOf('getTransactions: function'), payments.indexOf('saveTransactions: function'));
    assert.match(reader, /return \[\];/);
    const quote = payments.slice(payments.indexOf('submitQuotation: function'), payments.indexOf('PAYMENT_MODE'));
    assert.doesNotMatch(quote, /amount > 200|>= 200|< 200/);
    assert.match(quote, /decideQuoteMilestones\(quoteData\)/);
    assert.match(quote, /quoteType === 'milestones'/);
    assert.match(quote, /quoteType === 'direct'/);
    const stripe = fs.readFileSync(path.join(root, 'lyann-stripe.js'), 'utf8');
    assert.doesNotMatch(stripe, /amount > 200|requiresMilestones/);
});
