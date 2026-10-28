'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');
const policy = require('../deal-notification-policy');

const CONTACT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VIEWER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const POST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REQ = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const QUOTE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

test('a Bokantaj notification keeps the publication id and never the feed alone', () => {
    const parsed = policy.parseNotificationTarget({
        type: 'BOKANTAJ',
        entity_type: 'post',
        entity_id: POST
    }, { viewerId: VIEWER });
    assert.equal(parsed.route, 'bokantaj');
    assert.equal(parsed.postId, POST);
    assert.equal(parsed.contactId, null);
    assert.equal(parsed.navigate, true);
    const plan = policy.planNotificationNavigation(parsed, { viewerId: VIEWER });
    assert.equal(plan.open, true);
    assert.equal(plan.payload.postId, POST);
    assert.equal(plan.payload.contactId, undefined);
    assert.equal(plan.target.access.checks.includes('post_visible'), true);
    assert.equal(plan.target.access.authorized, false);
});

test('a Bokantaj notification without a publication id still opens the feed', () => {
    const plan = policy.planNotificationNavigation({ type: 'BOKANTAJ' }, { viewerId: VIEWER });
    assert.equal(plan.open, true);
    assert.equal(plan.route, 'bokantaj');
    assert.equal(plan.payload.postId, undefined);
});

test('pending push keeps the publication id across a cold start', () => {
    const raw = policy.serializePendingPushTarget({
        type: 'BOKANTAJ',
        route: 'bokantaj',
        postId: POST
    });
    const restored = policy.parsePendingPushTarget(raw);
    assert.equal(restored.postId, POST);
    assert.equal(restored.contactId, null);
    const replay = policy.planNotificationNavigation(restored, { viewerId: VIEWER });
    assert.equal(replay.payload.postId, POST);
});

test('a message notification opens the conversation and a quote keeps its pair', () => {
    const message = policy.planNotificationNavigation({
        type: 'NEW_MESSAGE',
        entity_id: CONTACT
    }, { viewerId: VIEWER });
    assert.equal(message.open, true);
    assert.equal(message.route, 'messages');
    assert.equal(message.payload.contactId, CONTACT);
    assert.equal(message.payload.requestId, undefined);

    const quote = policy.planNotificationNavigation({
        type: 'QUOTE_RECEIVED',
        entity_id: CONTACT + ':' + QUOTE
    }, { viewerId: VIEWER });
    assert.equal(quote.open, true);
    assert.equal(quote.payload.contactId, CONTACT);
    assert.equal(quote.target.quoteId, QUOTE);
    assert.equal(quote.payload.requestId, undefined);
});

test('payment navigation stays on the conversation or Finances and carries no amount', () => {
    const conversation = policy.planNotificationNavigation({
        type: 'PAYMENT_FAILED',
        entity_id: [CONTACT, QUOTE, REQ, REQ + ':a1'].join(':')
    }, { viewerId: VIEWER });
    assert.equal(conversation.route, 'messages');
    assert.equal(conversation.payload.contactId, CONTACT);
    assert.equal(conversation.payload.requestId, REQ);
    assert.equal(JSON.stringify(conversation.payload).includes('amount'), false);

    const finances = policy.planNotificationNavigation({
        type: 'PAYMENT_FAILED',
        entity_id: 'finances:none:' + QUOTE
    }, { viewerId: VIEWER });
    assert.equal(finances.route, 'finances');
    assert.equal(finances.payload.contactId, undefined);
    assert.equal(finances.payload.requestId, undefined);

    const payout = policy.planNotificationNavigation({ type: 'PAYOUT_READY' }, { viewerId: VIEWER });
    assert.equal(payout.route, 'finances');
    assert.equal(payout.payload.contactId, undefined);
});

test('an announcement opens its request and a closed one explains itself', () => {
    const open = policy.planNotificationNavigation({
        type: 'OPPORTUNITY',
        entity_type: 'request',
        entity_id: REQ
    }, { viewerId: VIEWER });
    assert.equal(open.route, 'mission');
    assert.equal(open.payload.requestId, REQ);

    const closed = policy.planNotificationNavigation({
        type: 'OPPORTUNITY',
        entity_id: REQ
    }, { viewerId: VIEWER, requestStatus: 'CLOSED' });
    assert.equal(closed.open, false);
    assert.equal(policy.notificationUnavailableMessage(closed.target), 'Cette annonce n’est plus disponible.');
    assert.equal(policy.notificationUnavailableMessage({ route: 'messages' }), 'Cette conversation n’est plus accessible.');
    assert.equal(policy.notificationUnavailableMessage({ route: 'bokantaj' }), 'Cette publication n’est plus disponible.');
    assert.equal(policy.notificationUnavailableMessage({ code: 'session_mismatch' }), 'Cette notification ne correspond plus à votre session.');
});

test('navigation waits for the session, checks access, and does not reopen after logout', () => {
    const root = path.join(__dirname, '..');
    const core = fs.readFileSync(path.join(root, 'platform-core.js'), 'utf8');
    const router = fs.readFileSync(path.join(root, 'app-router.js'), 'utf8');
    const ui = fs.readFileSync(path.join(root, 'notifications-ui.js'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
    assert.match(core, /LYANN_AUTH_STATE\.ready/);
    assert.match(core, /go\('messages', plan\.payload\)/);
    assert.match(core, /go\('bokantaj', plan\.payload\)/);
    assert.match(core, /go\('mission', plan\.payload\)/);
    assert.match(core, /go\('finances'\)/);
    assert.match(core, /select\('request_id'\)/);
    assert.doesNotMatch(core, /select\('request_id, total_amount'\)/);
    assert.match(core, /notificationNavigationFlights/);
    assert.match(core, /audienceUserId/);
    assert.match(router, /feed\.html\?post=/);
    assert.match(router, /revealPost/);
    assert.match(ui, /openLyannNotification/);
    assert.match(script, /INITIAL_SESSION[\s\S]{0,700}openPending/);
    assert.match(script, /SIGNED_OUT[\s\S]{0,500}LYANN_PUSH\.discard/);
    assert.match(script, /removeItem\('lyann_last_active_contact'\)/);
});

test('the feed route reveals the publication and keeps a feed without an id', async () => {
    const calls = [];
    const revealed = [];
    const document = {
        readyState: 'complete',
        documentElement: { classList: { remove() {} } },
        head: { appendChild() {} },
        body: { style: {}, classList: { add() {}, remove() {}, contains() { return false; } }, appendChild() {} },
        createElement() { return { classList: { add() {} }, setAttribute() {} }; },
        addEventListener() {},
        getElementById() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
    const window = {
        location: {
            pathname: '/feed',
            search: '',
            assign(url) { calls.push(url); }
        },
        setTimeout(fn) { fn(); return 1; },
        clearTimeout() {},
        addEventListener() {},
        dispatchEvent() {},
        LYANN_BOKANTAJ_FEED: {
            revealPost(id) {
                revealed.push(id);
                return Promise.resolve({ ok: true });
            }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app-router.js'), 'utf8'), {
        window, document, URL, URLSearchParams, console, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout
    });
    assert.equal(await window.LYANN_ROUTER.go('bokantaj', { postId: POST }), true);
    assert.deepEqual(revealed, [POST]);
    assert.deepEqual(calls, []);

    window.location.pathname = '/';
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await window.LYANN_ROUTER.go('bokantaj', { postId: POST }), true);
    assert.equal(calls.at(-1), 'feed.html?post=' + encodeURIComponent(POST));

    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await window.LYANN_ROUTER.go('bokantaj', {}), true);
    assert.equal(calls.at(-1), 'feed.html');
});
