'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storage = new Map();
global.window = {
    localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value))
    },
    LYANN_API_CLIENT: null,
    dispatchEvent() {}
};
global.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options?.detail; }
};

const engine = require('../notification-engine.js');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function notification(id, userId, read = false) {
    return {
        id: String(id), user_id: userId, type: 'BOKANTAJ',
        title: 'QA', body: '', read, created_at: '2026-10-22T10:00:00Z'
    };
}

test('opening the bell can clear 99+ unread notifications immediately without clearing history or another account', async () => {
    storage.clear();
    const rows = Array.from({ length: 105 }, (_, i) => notification(i, USER_A));
    rows.push(notification('other', USER_B));
    engine.saveAllNotifications(rows);
    let acknowledgedFor = null;
    window.LYANN_API_CLIENT = {
        markAllNotificationsRead: async (userId) => {
            acknowledgedFor = userId;
            return { error: null };
        }
    };

    assert.equal(engine.getUnreadCount(USER_A, USER_A), 105);
    const result = engine.markAllAsRead(USER_A);
    assert.equal(result.updated_count, 105);
    assert.equal(engine.getUnreadCount(USER_A, USER_A), 0);
    assert.equal(engine.getUserNotifications(USER_A, USER_A).length, 105);
    assert.equal(engine.getUnreadCount(USER_B, USER_B), 1);
    assert.deepEqual(await result.persistence, { error: null });
    assert.equal(acknowledgedFor, USER_A);
});

test('successful server acknowledgement prevents unread notifications returning after hydration', async () => {
    storage.clear();
    engine.saveAllNotifications([notification('remote-1', USER_A)]);
    const serverRows = [notification('remote-1', USER_A)];
    window.LYANN_API_CLIENT = {
        markAllNotificationsRead: async (userId) => {
            assert.equal(userId, USER_A);
            serverRows.forEach((item) => { item.read = true; });
            return { error: null };
        },
        getProfile: async () => ({ data: null }),
        listMyNotifications: async () => ({ data: serverRows })
    };
    const result = engine.markAllAsRead(USER_A);
    assert.equal(engine.getUnreadCount(USER_A, USER_A), 0);
    await result.persistence;
    await engine.hydrateFromServer(USER_A);
    assert.equal(engine.getUnreadCount(USER_A, USER_A), 0);
});

test('database acknowledgement failures remain observable rather than silently succeeding', async () => {
    storage.clear();
    engine.saveAllNotifications([notification('fail-1', USER_A)]);
    window.LYANN_API_CLIENT = {
        markAllNotificationsRead: async () => ({ error: { message: 'QA denied' } })
    };
    const result = engine.markAllAsRead(USER_A);
    const response = await result.persistence;
    assert.match(response.error.message, /QA denied/);
});

test('UI marks read before first render and waits for persistence before re-hydration', () => {
    const ui = fs.readFileSync(path.join(__dirname, '../notifications-ui.js'), 'utf8');
    const start = ui.indexOf('function openNotificationsModal()');
    const end = ui.indexOf('function renderNotificationsModal()', start);
    assert.ok(start >= 0 && end > start, 'bell open function must exist');
    const open = ui.slice(start, end);
    const mark = open.indexOf('engine?.markAllAsRead?.(currentUserId)');
    const paint = open.indexOf('renderNotificationsModal()');
    const ack = open.indexOf('readResult?.persistence');
    const hydrate = open.indexOf('await engine.hydrateFromServer(currentUserId)');
    assert.ok(mark >= 0 && paint > mark, 'open must acknowledge before rendering');
    assert.ok(ack >= 0 && hydrate > ack, 'server hydration must follow acknowledgement');
});
