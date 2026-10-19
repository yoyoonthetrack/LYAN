'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sync = require('../deal-context-sync.js');
const payment = require('../quote-payment-eligibility.js');

const {
    createDealContextRefreshController,
    scopeKey,
    isDealWakeMessage,
    serverPaymentPhase,
    FALLBACK_INTERVAL_MS
} = sync;

test('scopeKey isolates multi-request pairs (E1)', () => {
    const a = scopeKey({
        contactId: 'c1',
        requestId: 'req-a',
        invitationId: 'inv-a',
        missionId: null
    });
    const b = scopeKey({
        contactId: 'c1',
        requestId: 'req-b',
        invitationId: 'inv-b',
        missionId: null
    });
    assert.notEqual(a, b);
});

test('stale generation is discarded after a newer refresh starts', async () => {
    const ctrl = createDealContextRefreshController({ debounceMs: 0 });
    const paints = [];
    ctrl.setScope({ contactId: 'c1', requestId: 'r1' });

    let releaseSlow;
    const slowGate = new Promise((resolve) => { releaseSlow = resolve; });

    const slow = ctrl.request('slow', async ({ token, scope }) => {
        await slowGate;
        if (!ctrl.shouldAccept(token, scope)) return { skipped: true };
        paints.push('slow-' + scope);
        return { label: 'slow' };
    });

    // Different annonce / request for the same pair — must not paint under the old scope.
    ctrl.setScope({ contactId: 'c1', requestId: 'r2' });
    releaseSlow();
    const slowResult = await slow;
    assert.equal(slowResult.stale, true);
    assert.deepEqual(paints, []);

    const fastResult = await ctrl.request('fast', async ({ token, scope }) => {
        assert.equal(ctrl.shouldAccept(token, scope), true);
        paints.push('fast-' + scope);
        return { label: 'fast' };
    });
    assert.equal(fastResult.applied, true);
    assert.deepEqual(paints, ['fast-' + scopeKey({ contactId: 'c1', requestId: 'r2' })]);
});

test('conversation switch cancel ignores in-flight paint', async () => {
    const ctrl = createDealContextRefreshController({ debounceMs: 0 });
    ctrl.setScope({ contactId: 'alice', requestId: 'r1' });
    const paints = [];

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const first = ctrl.request('open-a', async ({ token, scope }) => {
        await gate;
        if (!ctrl.shouldAccept(token, scope)) return { skipped: true };
        paints.push('alice');
        return { painted: 'alice' };
    });

    ctrl.cancel();
    ctrl.setScope({ contactId: 'bob', requestId: 'r9' });
    release();
    const result = await first;
    assert.equal(result.stale, true);
    assert.equal(result.applied, false);
    assert.deepEqual(paints, []);

    await ctrl.request('open-b', async ({ token, scope }) => {
        assert.equal(ctrl.shouldAccept(token, scope), true);
        paints.push('bob');
        return { painted: 'bob' };
    });
    assert.deepEqual(paints, ['bob']);
});

test('concurrent requests coalesce into one flight + trailing refresh', async () => {
    const ctrl = createDealContextRefreshController({ debounceMs: 0 });
    ctrl.setScope({ contactId: 'c1', requestId: 'r1' });
    const runs = [];
    let release;
    const gate = new Promise((resolve) => { release = resolve; });

    const p1 = ctrl.request('a', async ({ reason }) => {
        runs.push(reason);
        await gate;
        return { n: runs.length };
    });
    const p2 = ctrl.request('b', async ({ reason }) => {
        runs.push(reason);
        return { n: runs.length };
    });
    const p3 = ctrl.request('c', async ({ reason }) => {
        runs.push(reason);
        return { n: runs.length };
    });

    assert.equal(ctrl.isBusy(), true);
    release();
    await Promise.all([p1, p2, p3]);
    assert.ok(runs.length >= 2);
    assert.equal(runs[0], 'a');
    assert.ok(runs.includes('c') || runs.includes('b'));
});

test('refresh after mock realtime wake re-reads via runner (no inferred payment)', async () => {
    const ctrl = createDealContextRefreshController({ debounceMs: 0 });
    ctrl.setScope({ contactId: 'c1', requestId: 'r1' });
    const fetches = [];
    const wake = { message_type: 'payment_secured', entity_type: 'payment' };
    assert.equal(isDealWakeMessage(wake, payment.isDealTimeline), true);

    await ctrl.request('realtime', async () => {
        // Simulate server re-read — payment phase only from returned quote fields.
        const serverQuote = {
            status: 'ACCEPTED',
            milestones: [{ id: 'm1', status: 'FUNDED', amount: 50 }],
            payments: [{ milestone_id: 'm1', payment_status: 'SUCCEEDED' }]
        };
        fetches.push(serverPaymentPhase(serverQuote, payment.missionPhase));
        return { phase: fetches[0] };
    });
    assert.deepEqual(fetches, ['prestation']);
});

test('deal wake uses existing timeline/entity messages only', () => {
    assert.equal(isDealWakeMessage({ message_type: 'quote_accepted' }, payment.isDealTimeline), true);
    assert.equal(isDealWakeMessage({ message_type: 'payment_secured' }, payment.isDealTimeline), true);
    assert.equal(isDealWakeMessage({ message_type: 'text', content: 'salut' }, payment.isDealTimeline), false);
    assert.equal(isDealWakeMessage({ message_type: 'text', entity_type: 'quote' }, payment.isDealTimeline), true);
    assert.equal(isDealWakeMessage({ message_type: 'text', entity_type: 'payment' }, payment.isDealTimeline), true);
});

test('payment phase comes only from server quote fields', () => {
    const unpaid = {
        status: 'ACCEPTED',
        milestones: [{ id: 'm1', status: 'PENDING', amount: 40 }],
        payments: []
    };
    const paid = {
        status: 'ACCEPTED',
        milestones: [{ id: 'm1', status: 'FUNDED', amount: 40 }],
        payments: [{ milestone_id: 'm1', payment_status: 'SUCCEEDED' }]
    };
    assert.equal(serverPaymentPhase(unpaid, payment.missionPhase), 'paiement');
    assert.equal(serverPaymentPhase(paid, payment.missionPhase), 'prestation');
    assert.equal(serverPaymentPhase(null, payment.missionPhase), null);
    assert.equal(payment.missionPhase(unpaid), 'paiement');
    assert.notEqual(payment.missionPhase(unpaid), 'prestation');
});

test('chat-logic wires E4 refreshDealContext; E5 mutex coexists; no E6–E8 / push / design churn', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(chat, /function refreshDealContext/);
    assert.match(chat, /paintDealContextFromServer/);
    assert.match(chat, /cancelDealContextRefresh/);
    assert.match(chat, /noteDealContextConversation/);
    assert.match(chat, /refreshDealContext\('realtime/);
    assert.match(chat, /refreshDealContext\('foreground'\)/);
    assert.match(chat, /refreshDealContext\('fallback'\)/);
    assert.match(chat, /recover \? 'reconnect' : 'subscribe'/);
    assert.match(chat, /refreshDealContext\('payment-confirm'\)/);
    assert.match(chat, /function syncLiveDealActions/);
    assert.match(chat, /syncLiveDealActions\(quotes\)/);
    assert.match(chat, /refreshDealContext\('thread-open'\)/);
    assert.match(chat, /dealContextScopeFromContact\(contact\)/);
    assert.match(chat, /invalidateQuoteContext\(userId, contactId\)/);
    assert.match(chat, /realtimeDropped/);
    assert.match(chat, /FALLBACK_INTERVAL_MS|dealFallbackMs/);
    assert.match(chat, /appStateChange/);
    // Still E1 / E3 homes; E5 mutation guard present
    assert.match(chat, /function threadQuoteContextOptions/);
    assert.match(chat, /function renderActionPanelShell/);
    assert.match(chat, /createDealMutationGuard/);
    assert.match(chat, /function runDealMutation/);
    // No new push for deal sync; E6–E8 not started
    assert.doesNotMatch(chat, /refreshDealContext[\s\S]{0,120}NotificationService\.show/);
    assert.doesNotMatch(chat, /insertTimeline.*sync|system message.*sync/i);
    assert.doesNotMatch(chat, /E6\s*—|E7\s*—|E8\s*—/);
});

test('E5.1: messaging-ui forwards top-level requestId into chat hydrator', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../messaging-ui.js'), 'utf8');
    assert.match(ui, /top-level requestId\/invitationId\/missionId must reach chat-logic/);
    assert.match(ui, /const threadNeed = supportThread/);
    assert.match(ui, /legacyOpenConversation\(name, avatar, contactId, threadNeed\)/);
    assert.match(ui, /Object\.assign\(\{\}, enriched/);
});

test('pages load deal-context-sync before chat-logic', () => {
    const pages = [
        'index.html',
        'feed.html',
        'results.html',
        'about.html',
        'pricing.html',
        'legal.html',
        'how-it-works.html',
        'confidentialite.html',
        'payment-portal.html'
    ];
    for (const page of pages) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        const syncAt = html.indexOf('deal-context-sync.js');
        const chatAt = html.indexOf('chat-logic.js');
        assert.ok(syncAt >= 0, page + ' missing deal-context-sync.js');
        assert.ok(chatAt > syncAt, page + ' must load deal-context-sync before chat-logic');
    }
    assert.ok(FALLBACK_INTERVAL_MS >= 8000);
});

test('mutation paths still refresh actor context after success', () => {
    const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
    assert.match(chat, /function refreshOpenBusinessCards/);
    assert.match(chat, /return refreshDealContext\('legacy'\)/);
    assert.match(chat, /await refreshOpenBusinessCards\(\)/);
    assert.ok(chat.includes("actionId === 'MARK_DONE'") && chat.includes('refreshOpenBusinessCards()'));
    assert.ok(chat.includes("actionId === 'CONFIRM_DONE'") && chat.includes('refreshOpenBusinessCards()'));
    assert.ok(chat.includes('handleAcceptQuote') && /await refreshOpenBusinessCards\(\)/.test(chat));
});

test('E5.1: coalesced re-run after annonce switch uses the latest runner (no stale scope paint)', async () => {
    const ctl = createDealContextRefreshController({ debounceMs: 0 });
    const calls = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    ctl.setScope({ contactId: 'c1', requestId: 'req-a' });
    const first = ctl.request('open-a', async () => { calls.push('a'); await gate; return { painted: 'a' }; });
    // Switch annonce while A is in flight.
    ctl.setScope({ contactId: 'c1', requestId: 'req-b' });
    ctl.request('open-b', async () => { calls.push('b'); return { painted: 'b' }; });
    release();
    const outcome = await first;
    assert.deepEqual(calls, ['a', 'b']);
    assert.equal(outcome.applied, true);
    assert.equal(outcome.painted, 'b');
});

test('E5.1: renderMessages has a single ActionPanel owner (no parallel getQuoteContext painters)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const start = src.indexOf('async function renderMessages(');
    const body = src.slice(start, src.indexOf('// Dynamic Blocked User UI Check', start));
    assert.equal(/getQuoteContext\(/.test(body), false);
    assert.ok((body.match(/scheduleActionPanelRebuild\(/g) || []).length >= 2);
});
