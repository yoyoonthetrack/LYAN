'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const session = require('../realtime-session');

function manualSlot() {
    const queued = [];
    const removed = [];
    const slot = session.createRealtimeSlot({
        setTimer: (fn) => {
            queued.push(fn);
            return queued.length;
        },
        clearTimer: (id) => {
            queued[id - 1] = null;
        }
    });
    return {
        slot,
        queued,
        removed,
        async fire() {
            const fn = queued.shift();
            queued.push(null);
            if (fn) await fn();
        },
        remove: async (channel) => { removed.push(channel); }
    };
}

test('backoff climbs and then stays capped', () => {
    assert.deepEqual(
        [0, 1, 2, 3, 4, 5].map((attempt) => session.nextRetryDelay(attempt)),
        [2000, 4000, 8000, 16000, 30000, 30000]
    );
    assert.equal(session.HEALTHY_CATCHUP_MS, 30000);
    assert.equal(session.DROPPED_CATCHUP_MS, 8000);
});

test('a second retry is ignored until the first fires', () => {
    const ctx = manualSlot();
    assert.equal(ctx.slot.scheduleRetry(() => {}), 2000);
    assert.equal(ctx.slot.scheduleRetry(() => {}), 0);
    assert.equal(ctx.slot.hasRetry(), true);
});

test('release waits for removal and blocks a stale retry', async () => {
    const ctx = manualSlot();
    const channel = { name: 'lyann-messages' };
    ctx.slot.hold(channel);
    let ran = false;
    ctx.slot.scheduleRetry(() => { ran = true; });
    const generation = await ctx.slot.release(ctx.remove);
    assert.equal(generation > 0, true);
    assert.deepEqual(ctx.removed, [channel]);
    assert.equal(ctx.slot.current(), null);
    assert.equal(ctx.slot.hasRetry(), false);
    await ctx.fire();
    assert.equal(ran, false);
});

test('sign-out leaves no channel and a new account gets one channel', async () => {
    const ctx = manualSlot();
    const first = { name: 'lyann-messages', account: 'A' };
    const second = { name: 'lyann-messages', account: 'B' };
    ctx.slot.hold(first);
    await ctx.slot.release(ctx.remove);
    assert.equal(ctx.slot.current(), null);
    ctx.slot.hold(second);
    assert.equal(ctx.slot.current(), second);
    assert.equal(ctx.removed.length, 1);
});

test('successful subscribe resets the backoff ladder', () => {
    const ctx = manualSlot();
    ctx.slot.scheduleRetry(() => {});
    assert.equal(ctx.slot.attempt(), 1);
    ctx.slot.markHealthy();
    ctx.slot.cancelRetry();
    assert.equal(ctx.slot.scheduleRetry(() => {}), 2000);
});

test('chat and notifications use one slot, awaited removal, and keep E4', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const notes = fs.readFileSync(path.join(__dirname, '..', 'notifications-ui.js'), 'utf8');
    assert.match(chat, /createRealtimeSlot\(\)/);
    assert.match(chat, /await supabase\.removeChannel\(channel\)/);
    assert.match(chat, /if \(!getMyId\(\)\) return;/);
    assert.match(chat, /reconnectRealtimeSocket/);
    assert.match(chat, /forceChatRealtimeResubscribe\('online'\)/);
    assert.match(chat, /rt\.disconnect/);
    assert.match(chat, /resumeChatRealtime\('foreground'\)/);
    assert.match(chat, /appStateChange/);
    assert.match(chat, /refreshDealContext\('foreground'\)/);
    assert.match(chat, /refreshDealContext\('fallback'\)/);
    assert.match(chat, /FALLBACK_INTERVAL_MS/);
    assert.match(chat, /HEALTHY_CATCHUP_MS \|\| 30000/);
    assert.match(chat, /DROPPED_CATCHUP_MS \|\| 8000/);
    assert.match(notes, /createRealtimeSlot\(\)/);
    assert.match(notes, /keepAttempt: true/);
    assert.match(notes, /lyann-user-notifications/);
    assert.match(notes, /refreshDealContext\?\.\('notif-deal'\)/);
    for (const page of ['index.html', 'feed.html', 'results.html']) {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        const sessionAt = html.indexOf('realtime-session.js');
        const chatAt = html.indexOf('chat-logic.js');
        assert.ok(sessionAt > 0 && sessionAt < chatAt, page);
    }
});
