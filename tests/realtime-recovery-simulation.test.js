'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const session = require('../realtime-session');

const chatSource = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
const notifSource = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');

function createHarness() {
    const timers = [];
    const slot = session.createRealtimeSlot({
        setTimer(fn, ms) {
            const item = { fn, ms, cancelled: false };
            timers.push(item);
            return timers.length;
        },
        clearTimer(id) {
            if (timers[id - 1]) timers[id - 1].cancelled = true;
        }
    });
    const removed = [];
    const created = [];
    let userId = 'user-a';
    let dropped = false;
    let ever = false;
    let generation = 0;
    let catchups = [];
    let dealRefreshes = [];
    let visible = true;
    let lastCatchupAt = 0;
    let server = [];
    let thread = [];
    let senderPainted = [];

    function pull() {
        const known = new Set(thread.map((row) => row.id));
        server.filter((row) => !known.has(row.id)).forEach((row) => thread.push(row));
        catchups.push('pull');
    }

    function visibleCatchup(now) {
        if (!visible) return false;
        const gap = dropped ? session.DROPPED_CATCHUP_MS : session.HEALTHY_CATCHUP_MS;
        if (now - lastCatchupAt < gap) return false;
        lastCatchupAt = now;
        pull();
        return true;
    }

    function setup() {
        if (slot.current()) return slot.current();
        const channel = { id: created.length + 1, userId };
        created.push(channel);
        slot.hold(channel);
        const gen = ++generation;
        channel.emit = async (status) => {
            if (gen !== generation || slot.current() !== channel) return;
            if (status === 'SUBSCRIBED') {
                const recover = dropped;
                dropped = false;
                ever = true;
                slot.markHealthy();
                pull();
                catchups.push(recover ? 'reconnect' : 'subscribe');
                dealRefreshes.push(recover ? 'reconnect' : 'subscribe');
                return;
            }
            if (status === 'CLOSED' && !ever) return;
            if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
            dropped = true;
            slot.scheduleRetry(async () => {
                if (slot.current() !== channel) return;
                slot.hold(null);
                removed.push(channel);
                if (!userId) return;
                setup();
            });
        };
        return channel;
    }

    return {
        timers,
        removed,
        created,
        get dropped() { return dropped; },
        get thread() { return thread; },
        get catchups() { return catchups; },
        get dealRefreshes() { return dealRefreshes; },
        get senderPainted() { return senderPainted; },
        get userId() { return userId; },
        server,
        visibleCatchup,
        setup,
        foreground() {
            pull();
            catchups.push('foreground');
            dealRefreshes.push('foreground');
            if (!userId || !dropped) return;
            if (slot.current() || slot.hasRetry()) return;
            setup();
        },
        async switchAccount(nextId) {
            const previous = slot.current();
            userId = nextId;
            generation += 1;
            slot.cancelRetry();
            slot.hold(null);
            if (previous) removed.push(previous);
            if (!nextId) {
                dropped = false;
                return;
            }
            setup();
        },
        sendFromMe(row) {
            senderPainted.push(row);
            server.push(row);
        },
        async fireNext() {
            const item = timers.find((entry) => entry && !entry.cancelled && !entry.ran);
            assert.ok(item, 'expected a pending retry');
            item.ran = true;
            await item.fn();
            return item.ms;
        },
        liveChannels() {
            return slot.current() ? [slot.current()] : [];
        }
    };
}

test('sender paint does not wait for Realtime, and a silent drop is caught on the healthy interval', () => {
    assert.match(chatSource, /renderOptimisticChatMessage\(normalizedMsg\)/);
    assert.match(chatSource, /await deliverTextMessage\(contactId, normalizedMsg, optimisticNode\)/);
    const optimisticAt = chatSource.indexOf('renderOptimisticChatMessage(normalizedMsg)');
    const deliverAt = chatSource.indexOf('await deliverTextMessage(contactId, normalizedMsg, optimisticNode)');
    assert.ok(optimisticAt > 0 && optimisticAt < deliverAt);

    const chat = createHarness();
    const channel = chat.setup();
    channel.emit('SUBSCRIBED');
    chat.sendFromMe({ id: 'm1', from: 'me' });
    assert.deepEqual(chat.senderPainted.map((row) => row.id), ['m1']);

    chat.server.push({ id: 'm2', from: 'peer' });
    assert.equal(chat.visibleCatchup(29999), false);
    assert.equal(chat.thread.some((row) => row.id === 'm2'), false);
    assert.equal(chat.visibleCatchup(30000), true);
    assert.equal(chat.thread.some((row) => row.id === 'm2'), true);
});

test('repeated channel failures back off, then a subscribe catches the missed messages', async () => {
    const chat = createHarness();
    let channel = chat.setup();
    await channel.emit('SUBSCRIBED');
    const delays = [];
    for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
        chat.server.push({ id: status, from: 'peer' });
        await channel.emit(status);
        delays.push(await chat.fireNext());
        channel = chat.liveChannels()[0];
    }
    assert.deepEqual(delays, [2000, 4000, 8000]);
    assert.equal(chat.liveChannels().length, 1);
    assert.equal(chat.removed.length, 3);
    assert.equal(chat.thread.filter((row) => row.from === 'peer').length, 0);
    await channel.emit('SUBSCRIBED');
    assert.equal(chat.thread.filter((row) => row.from === 'peer').length, 3);
    assert.ok(chat.catchups.includes('reconnect'));
    assert.ok(chat.dealRefreshes.includes('reconnect'));
});

test('CLOSED before the first subscribe does not open another channel', async () => {
    const chat = createHarness();
    const channel = chat.setup();
    await channel.emit('CLOSED');
    assert.equal(chat.timers.filter((entry) => !entry.cancelled).length, 0);
    assert.equal(chat.liveChannels().length, 1);
    assert.equal(chat.removed.length, 0);
});

test('account switch removes the previous channel and sign-out leaves none', async () => {
    const chat = createHarness();
    const first = chat.setup();
    await first.emit('SUBSCRIBED');
    await chat.switchAccount('user-b');
    assert.equal(chat.removed.some((channel) => channel.userId === 'user-a'), true);
    assert.equal(chat.liveChannels().length, 1);
    assert.equal(chat.liveChannels()[0].userId, 'user-b');
    await first.emit('CHANNEL_ERROR');
    assert.equal(chat.liveChannels().length, 1);
    assert.equal(chat.liveChannels()[0].userId, 'user-b');
    await chat.switchAccount(null);
    assert.equal(chat.liveChannels().length, 0);
});

test('iOS foreground catch-up refreshes the deal context without a second channel', async () => {
    assert.match(chatSource, /appStateChange/);
    assert.match(chatSource, /resumeChatRealtime\('foreground'\)/);
    assert.match(chatSource, /forceChatRealtimeResubscribe/);
    assert.match(chatSource, /reconnectRealtimeSocket/);
    assert.match(chatSource, /refreshDealContext\('foreground'\)/);
    const chat = createHarness();
    chat.server.push({ id: 'missed', from: 'peer' });
    chat.foreground();
    assert.equal(chat.thread.some((row) => row.id === 'missed'), true);
    assert.ok(chat.dealRefreshes.includes('foreground'));

    const channel = chat.setup();
    await channel.emit('SUBSCRIBED');
    await channel.emit('CHANNEL_ERROR');
    const createdBefore = chat.created.length;
    chat.foreground();
    assert.equal(chat.created.length, createdBefore);
    assert.equal(chat.liveChannels().length, 1);
    assert.equal(chat.liveChannels()[0], channel);
});

test('notification feed keeps one poll and still wakes E4 for a deal insert', () => {
    assert.match(notifSource, /lyannNotificationPoll = setInterval/);
    assert.match(notifSource, /clearInterval\(lyannNotificationPoll\)/);
    assert.match(notifSource, /refreshDealContext\?\.\('notif-deal'\)/);
    assert.match(notifSource, /isKeptDealType/);
    const tail = chatSource.slice(chatSource.indexOf('function watchChatAuthForRealtime'));
    assert.equal(tail.split('setInterval(').length - 1, 2);
    assert.equal(tail.split('addEventListener(').length - 1, 7);
    assert.equal(tail.split('addListener(').length - 1, 1);
    assert.equal(notifSource.split('setInterval(').length - 1, 1);
});
