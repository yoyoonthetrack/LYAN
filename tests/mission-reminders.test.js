const test = require('node:test');
const assert = require('node:assert/strict');
const { missionActions, reminderCandidates, visibleReminders } = require('../mission-reminders.js');

const me = 'user-a';
const other = 'user-b';
const now = Date.parse('2026-10-17T12:00:00Z');

test('a payout reminder appears without treating the quote as lost', () => {
    const items = reminderCandidates({
        userId: me,
        now,
        readiness: { [me]: 'incomplete' },
        quotes: [{
            id: 'q1',
            status: 'ACCEPTED',
            provider_id: me,
            requester_id: other,
            request_id: 'req-1',
            updated_at: '2026-10-17T11:50:00Z'
        }]
    });
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, 'payout_setup');
    assert.match(items[0].body, /devis est conservé/i);
});

test('reminders respect the missions preference and do not duplicate', () => {
    const quote = {
        id: 'q2',
        status: 'SENT',
        provider_id: other,
        requester_id: me,
        updated_at: '2026-10-16T08:00:00Z'
    };
    assert.equal(reminderCandidates({ userId: me, now, prefs: { missions: { in_app: false } }, quotes: [quote] }).length, 0);
    const candidates = reminderCandidates({ userId: me, now, quotes: [quote, quote] });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].kind, 'quote_reply');
});

test('a reminder disappears when the state no longer needs it', () => {
    const existing = [
        { id: 'n1', type: 'REMINDER_QUOTE_REPLY', entity_id: 'q2', title: 'ancien' },
        { id: 'n2', type: 'QUOTE_RECEIVED', entity_id: 'q2', title: 'reste' }
    ];
    const view = visibleReminders(existing, []);
    assert.equal(view.persisted.length, 1);
    assert.equal(view.persisted[0].id, 'n2');
    assert.equal(view.extra.length, 0);
});

test('payment and validation reminders follow the role on that mission', () => {
    const paid = reminderCandidates({
        userId: me,
        now,
        readiness: { [other]: 'active' },
        quotes: [{
            id: 'q3',
            status: 'ACCEPTED',
            requester_id: me,
            provider_id: other,
            updated_at: '2026-10-16T08:00:00Z',
            milestones: [{ id: 'm1', status: 'PENDING' }]
        }]
    });
    assert.equal(paid[0].kind, 'payment_due');
    const validate = reminderCandidates({
        userId: me,
        now,
        quotes: [{
            id: 'q4',
            status: 'ACCEPTED',
            requester_id: me,
            provider_id: other,
            updated_at: '2026-10-17T11:00:00Z',
            milestones: [{ id: 'm2', status: 'COMPLETED' }]
        }]
    });
    assert.equal(validate.some((item) => item.kind === 'client_validation'), true);
    const fresh = reminderCandidates({
        userId: me,
        now,
        readiness: { [other]: 'active' },
        quotes: [{
            id: 'q5',
            status: 'SENT',
            requester_id: me,
            provider_id: other,
            updated_at: '2026-10-17T11:50:00Z'
        }]
    });
    assert.equal(fresh.length, 0);
});

test('the payout reminder stays ahead of older quote replies', () => {
    const quotes = [];
    for (let i = 0; i < 8; i++) {
        quotes.push({ id: 'sent-' + i, status: 'SENT', requester_id: me, provider_id: other, updated_at: '2026-10-01T08:00:00Z' });
    }
    quotes.push({ id: 'gain', status: 'ACCEPTED', provider_id: me, requester_id: other, updated_at: '2026-10-17T11:00:00Z' });
    const actions = missionActions({ userId: me, now, readiness: { [me]: 'incomplete' }, quotes });
    assert.equal(actions.filter((item) => item.kind === 'quote_reply').length, 8);
    assert.equal(actions.filter((item) => item.kind === 'payout_setup').length, 1);
    const items = reminderCandidates({ userId: me, now, readiness: { [me]: 'incomplete' }, quotes });
    assert.equal(items[0].kind, 'payout_setup');
    const group = items.find((item) => item.kind === 'quote_reply');
    assert.equal(group.grouped, true);
    assert.equal(group.count, 8);
    assert.match(group.body, /Toutes restent dans Missions/);
});

test('two missions between the same people stay distinct and point at the other person', () => {
    const items = reminderCandidates({
        userId: me,
        now,
        readiness: { [me]: 'incomplete', [other]: 'active' },
        quotes: [
            { id: 'q-gain', status: 'ACCEPTED', provider_id: me, requester_id: other, description: 'Aide inversée', request_id: 'req-gain', request_invitation_id: 'inv-gain', updated_at: '2026-10-17T11:00:00Z' },
            { id: 'q-pay', status: 'ACCEPTED', provider_id: other, requester_id: me, description: 'Tarif direct', request_id: 'req-pay', request_invitation_id: 'inv-pay', updated_at: '2026-10-16T08:00:00Z', milestones: [{ id: 'm', status: 'PENDING' }] }
        ]
    });
    assert.equal(items[0].kind, 'payout_setup');
    assert.equal(items[0].contactId, other);
    assert.equal(items[0].invitationId, 'inv-gain');
    assert.match(items[0].body, /Aide inversée/);
    assert.equal(items[1].kind, 'payment_due');
    assert.equal(items[1].contactId, other);
    assert.match(items[1].body, /Tarif direct/);
    assert.notEqual(items[0].requestId, items[1].requestId);
});
