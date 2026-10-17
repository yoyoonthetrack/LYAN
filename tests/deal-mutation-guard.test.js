'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sync = require('../deal-context-sync.js');

const {
    createDealMutationGuard,
    createDealContextRefreshController,
    scopeKey,
    mutationKey
} = sync;

test('mutationKey isolates action + entity', () => {
    assert.equal(mutationKey('accept', 'q1'), 'accept:q1');
    assert.notEqual(mutationKey('accept', 'q1'), mutationKey('decline', 'q1'));
    assert.notEqual(mutationKey('pay', 'm1'), mutationKey('pay', 'm2'));
});

test('double begin on same action is rejected (mutex)', async () => {
    const guard = createDealMutationGuard();
    guard.setScope({ contactId: 'c1', requestId: 'r1', conversationId: 'conv1' });
    const first = guard.begin('accept', 'quote-a', { contactId: 'c1', requestId: 'r1', conversationId: 'conv1' });
    assert.ok(first);
    assert.equal(guard.isBusy('accept', 'quote-a'), true);
    const second = guard.begin('accept', 'quote-a', { contactId: 'c1', requestId: 'r1', conversationId: 'conv1' });
    assert.equal(second, null);
    guard.end(first);
    assert.equal(guard.isBusy('accept', 'quote-a'), false);
    const third = guard.begin('accept', 'quote-a', { contactId: 'c1', requestId: 'r1', conversationId: 'conv1' });
    assert.ok(third);
    guard.end(third);
});

test('run() ignores second concurrent call', async () => {
    const guard = createDealMutationGuard();
    const scope = { contactId: 'c1', requestId: 'r1' };
    guard.setScope(scope);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const calls = [];

    const a = guard.run('pay', 'ms-1', scope, async () => {
        calls.push('a');
        await gate;
        return { intent: 1 };
    });
    const b = await guard.run('pay', 'ms-1', scope, async () => {
        calls.push('b');
        return { intent: 2 };
    });
    assert.equal(b.started, false);
    assert.equal(b.busy, true);
    release();
    const aResult = await a;
    assert.equal(aResult.started, true);
    assert.equal(aResult.apply, true);
    assert.deepEqual(calls, ['a']);
});

test('conversation switch makes in-flight mutation stale', async () => {
    const guard = createDealMutationGuard();
    const scopeA = { contactId: 'alice', requestId: 'req-a', conversationId: 'conv-a' };
    const scopeB = { contactId: 'bob', requestId: 'req-b', conversationId: 'conv-b' };
    guard.setScope(scopeA);

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const paints = [];

    const flight = guard.run('accept', 'q1', scopeA, async (handle) => {
        await gate;
        if (!guard.shouldApply(handle)) return { skipped: true };
        paints.push('accept-a');
        return { mission_id: 'm1' };
    });

    guard.setScope(scopeB);
    release();
    const result = await flight;
    assert.equal(result.stale, true);
    assert.equal(result.apply, false);
    assert.deepEqual(paints, []);
});

test('cancel() aborts apply for open mutation', async () => {
    const guard = createDealMutationGuard();
    guard.setScope({ contactId: 'c1', requestId: 'r1' });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const flight = guard.run('done', 'ms', { contactId: 'c1', requestId: 'r1' }, async (handle) => {
        await gate;
        return { ok: guard.shouldApply(handle) };
    });
    guard.cancel();
    release();
    const result = await flight;
    assert.equal(result.apply, false);
    assert.equal(result.stale, true);
});

test('multi-request same pair: different requestId scopes do not cross-apply', async () => {
    const guard = createDealMutationGuard();
    const a = { contactId: 'pair', requestId: 'annonce-1', invitationId: 'inv-1' };
    const b = { contactId: 'pair', requestId: 'annonce-2', invitationId: 'inv-2' };
    assert.notEqual(scopeKey(a), scopeKey(b));

    guard.setScope(a);
    const handle = guard.begin('confirm', 'ms-a', a);
    assert.ok(handle);
    assert.equal(guard.shouldApply(handle), true);

    guard.setScope(b);
    assert.equal(guard.shouldApply(handle), false);
    guard.end(handle);
});

test('refresh controller and mutation guard share scopeKey contract', () => {
    const refresh = createDealContextRefreshController({ debounceMs: 0 });
    const guard = createDealMutationGuard();
    const scope = { contactId: 'c', requestId: 'r', conversationId: 'x' };
    refresh.setScope(scope);
    guard.setScope(scope);
    assert.equal(refresh.getActiveScope(), guard.getActiveScope());
    assert.equal(refresh.getActiveScope(), scopeKey(scope));
});

test('chat-logic wires E5 mutation guard on deal CTAs', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(chat, /createDealMutationGuard/);
    assert.match(chat, /function runDealMutation/);
    assert.match(chat, /dealMutationGuard\.isBusy\('accept'/);
    assert.match(chat, /dealMutationGuard\.isBusy\('decline'/);
    assert.match(chat, /runDealMutation\('revise'/);
    assert.match(chat, /runDealMutation\('pay'/);
    assert.match(chat, /runDealMutation\('done'/);
    assert.match(chat, /runDealMutation\('confirm'/);
    assert.match(chat, /runDealMutation\('setup'/);
    assert.match(chat, /mutation-error:/);
    assert.match(chat, /keepLockedOnSuccess:\s*true/);
    assert.match(chat, /serverValidated/);
    // E1–E4 preserved
    assert.match(chat, /function threadQuoteContextOptions/);
    assert.match(chat, /function refreshDealContext/);
    assert.match(chat, /function renderActionPanelShell/);
    // E6–E8 not started here
    assert.doesNotMatch(chat, /E6\s*—|E7\s*—|E8\s*—/);
});

test('accept path keeps version check + locks; reject uses mutex', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    const accept = chat.slice(chat.indexOf('window.handleAcceptQuote'), chat.indexOf('window.handleRejectQuote'));
    assert.match(accept, /quoteActionLocks/);
    assert.match(accept, /planQuoteAcceptance/);
    assert.match(accept, /acceptRequestQuote\(quoteId, acceptance\.version\)/);
    assert.match(accept, /runDealMutation\('accept'/);
    const reject = chat.slice(chat.indexOf('window.handleRejectQuote'), chat.indexOf('window.openPreviousQuoteVersion'));
    assert.match(reject, /runDealMutation\('decline'/);
    assert.match(reject, /rejectRequestQuote/);
});

test('REJECT_QUOTE routes through handleRejectQuote (no bypass)', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    const block = chat.slice(chat.indexOf("actionId === 'REJECT_QUOTE'"), chat.indexOf("actionId === 'PAY_MISSION'"));
    assert.match(block, /handleRejectQuote/);
    assert.doesNotMatch(block, /rejectRequestQuote\(/);
});

test('payment client sends Idempotency-Key; confirm awaits server validation', () => {
    const client = fs.readFileSync(path.join(__dirname, '../api-client.js'), 'utf8');
    const intent = client.slice(client.indexOf('createMilestonePaymentIntent'), client.indexOf('async startMilestoneWork'));
    assert.match(intent, /Idempotency-Key/);
    assert.match(intent, /create-milestone-intent:/);
    const stripe = fs.readFileSync(path.join(__dirname, '../lyann-stripe.js'), 'utf8');
    assert.match(stripe, /lyannAwaitPaidQuote/);
    assert.match(stripe, /serverValidated/);
    assert.match(stripe, /if \(preparing\) return preparing/);
    assert.doesNotMatch(stripe, /FUNDED\s*=/);
    assert.doesNotMatch(stripe, /status\s*=\s*['"]FUNDED['"]/);
});

test('double accept does not invent a second mission client-side', () => {
    // Client: mutex + keepLockedOnSuccess. Server: unique active invitation + RPC FOR UPDATE (migrations 04/52).
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(chat, /keepLockedOnSuccess:\s*true/);
    assert.match(chat, /runDealMutation\('accept'/);
    const sql = fs.readFileSync(path.join(__dirname, '../52_quote_acceptance_blocks_and_report_evidence.sql'), 'utf8');
    assert.match(sql, /unique_violation/);
    assert.match(sql, /Une mission active a déjà été créée/);
    assert.match(sql, /p_expected_version/);
    const idx = fs.readFileSync(path.join(__dirname, '../04_quotes_and_milestones_migration.sql'), 'utf8');
    assert.match(idx, /idx_missions_unique_active_invitation/);
});

test('document: live A↔B Lyann-test accept/pay not run in this unit suite', () => {
    // ENVIRONMENT REQUIRED — unit/mocked coverage only; no Stripe Live, no Supabase Production.
    assert.equal(typeof createDealMutationGuard, 'function');
});
