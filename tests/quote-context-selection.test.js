'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const revision = require('../quote-revision.js');

const demandeur = 'user-demandeur';
const lyanneur = 'user-lyanneur';

function invitation(id, requestId, overrides = {}) {
    return {
        id,
        request_id: requestId,
        status: 'ACCEPTED',
        requester_id: demandeur,
        recipient_id: lyanneur,
        ...overrides
    };
}

function mission(id, requestId, status, overrides = {}) {
    return {
        id,
        status,
        related_request_id: requestId,
        requester_id: demandeur,
        helper_id: lyanneur,
        ...overrides
    };
}

test('explicit requestId keeps quotes on the matching annonce for both roles', () => {
    const invitations = [
        invitation('inv-a', 'annonce-a'),
        invitation('inv-b', 'annonce-b')
    ];
    const missions = [
        mission('m-a-done', 'annonce-a', 'COMPLETED'),
        mission('m-b-live', 'annonce-b', 'IN_PROGRESS')
    ];

    const asLyanneur = revision.resolveQuoteContextSelection({
        invitations,
        missions,
        requestId: 'annonce-b'
    });
    assert.equal(asLyanneur.ok, true);
    assert.equal(asLyanneur.ambiguous, false);
    assert.equal(asLyanneur.requestId, 'annonce-b');
    assert.equal(asLyanneur.invitationId, 'inv-b');
    assert.equal(asLyanneur.missionId, 'm-b-live');

    const asDemandeur = revision.resolveQuoteContextSelection({
        invitations: invitations.map((row) => ({
            ...row,
            // same ACCEPTED rows are visible to both participants
            requester_id: demandeur,
            recipient_id: lyanneur
        })),
        missions,
        requestId: 'annonce-a'
    });
    assert.equal(asDemandeur.ok, true);
    assert.equal(asDemandeur.requestId, 'annonce-a');
    assert.equal(asDemandeur.invitationId, 'inv-a');
    assert.equal(asDemandeur.missionId, null, 'finished mission on annonce-a is not promoted as active');
});

test('pair-only fallback uses the single open deal and ignores another finished annonce', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [
            invitation('inv-old', 'annonce-ancienne'),
            invitation('inv-new', 'annonce-nouvelle')
        ],
        missions: [
            mission('m-old', 'annonce-ancienne', 'COMPLETED'),
            mission('m-new', 'annonce-nouvelle', 'AGREED')
        ]
    });
    assert.equal(selection.ok, true);
    assert.equal(selection.ambiguous, false);
    assert.equal(selection.requestId, 'annonce-nouvelle');
    assert.equal(selection.missionId, 'm-new');
    assert.equal(selection.invitationId, 'inv-new');
    assert.notEqual(selection.requestId, 'annonce-ancienne');
});

test('multiple open deals between the same users stay ambiguous and neutral', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [
            invitation('inv-1', 'annonce-1'),
            invitation('inv-2', 'annonce-2')
        ],
        missions: [
            mission('m-1', 'annonce-1', 'IN_PROGRESS'),
            mission('m-2', 'annonce-2', 'AGREED')
        ]
    });
    assert.equal(selection.ok, false);
    assert.equal(selection.ambiguous, true);
    assert.equal(selection.requestId, null);
    assert.equal(selection.missionId, null);
    assert.deepEqual(selection.invitationIds, []);
});

test('multiple finished missions without requestId stay ambiguous (never pick the last one)', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [
            invitation('inv-1', 'annonce-1'),
            invitation('inv-2', 'annonce-2')
        ],
        missions: [
            mission('m-1', 'annonce-1', 'COMPLETED'),
            mission('m-2', 'annonce-2', 'COMPLETED')
        ]
    });
    assert.equal(selection.ok, false);
    assert.equal(selection.ambiguous, true);
    assert.match(selection.code, /ambiguous/);
});

test('unique finished context is verifiable and allowed as fallback', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-only', 'annonce-unique')],
        missions: [mission('m-only', 'annonce-unique', 'COMPLETED')]
    });
    assert.equal(selection.ok, true);
    assert.equal(selection.ambiguous, false);
    assert.equal(selection.requestId, 'annonce-unique');
    assert.equal(selection.missionId, null, 'finished mission is not the active mission id');
});

test('explicit invitationId verifies request correspondence', () => {
    const ok = revision.resolveQuoteContextSelection({
        invitations: [
            invitation('inv-a', 'annonce-a'),
            invitation('inv-b', 'annonce-b')
        ],
        missions: [],
        invitationId: 'inv-b',
        requestId: 'annonce-b'
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.invitationId, 'inv-b');

    const mismatch = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-b', 'annonce-b')],
        missions: [],
        invitationId: 'inv-b',
        requestId: 'annonce-a'
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'invitation_request_mismatch');
});

test('explicit missionId rejects a mission linked to another annonce', () => {
    const mismatch = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-a', 'annonce-a')],
        missions: [mission('m-a', 'annonce-a', 'IN_PROGRESS', { request_invitation_id: 'inv-a' })],
        missionId: 'm-a',
        requestId: 'annonce-autre'
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, 'mission_request_mismatch');

    const matched = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-a', 'annonce-a')],
        missions: [mission('m-a', 'annonce-a', 'IN_PROGRESS', { request_invitation_id: 'inv-a' })],
        missionId: 'm-a',
        requestId: 'annonce-a'
    });
    assert.equal(matched.ok, true);
    assert.equal(matched.missionId, 'm-a');
    assert.equal(matched.invitationId, 'inv-a');
});

test('open invitation without mission is preferred over a finished mission on another annonce', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [
            invitation('inv-done', 'annonce-done'),
            invitation('inv-open', 'annonce-open')
        ],
        missions: [
            mission('m-done', 'annonce-done', 'COMPLETED')
        ]
    });
    assert.equal(selection.ok, true);
    assert.equal(selection.requestId, 'annonce-open');
    assert.equal(selection.invitationId, 'inv-open');
    assert.equal(selection.missionId, null);
});

test('selectThreadContext still hides finished mission chrome for the selected annonce', () => {
    const finished = revision.selectThreadContext({
        missions: [mission('m-done', 'annonce-a', 'COMPLETED')],
        requestId: 'annonce-a'
    });
    assert.equal(finished.mission, null);
    assert.equal(finished.requestId, 'annonce-a');
});

test('two open requests on the same pair stay ambiguous without an explicit requestId', () => {
    const selection = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-a', 'annonce-a'), invitation('inv-b', 'annonce-b')],
        missions: []
    });
    assert.equal(selection.ok, false);
    assert.equal(selection.ambiguous, true);
    const matched = revision.resolveQuoteContextSelection({
        invitations: [invitation('inv-a', 'annonce-a'), invitation('inv-b', 'annonce-b')],
        missions: [],
        requestId: 'annonce-b'
    });
    assert.equal(matched.ok, true);
    assert.equal(matched.requestId, 'annonce-b');
    assert.equal(matched.invitationId, 'inv-b');
});

test('messaging repository and chat propagate request-scoped quote context', () => {
    const repo = fs.readFileSync(path.join(__dirname, '..', 'messaging-repository.js'), 'utf8');
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '..', 'api-client.js'), 'utf8');

    assert.match(repo, /resolveQuoteContextSelection/);
    assert.match(repo, /listAcceptedInvitationsBetween/);
    assert.match(repo, /options\.requestId/);
    assert.match(repo, /tagQuoteContext/);
    assert.match(repo, /Plusieurs demandes/);
    assert.match(repo, /multiRequest/);
    assert.doesNotMatch(repo, /getActiveInvitationBetween\(userId, contactId\)\s*;/);

    assert.match(chat, /threadQuoteContextOptions/);
    assert.match(chat, /getQuoteContext\(getMyId\(\), contact\.id, threadQuoteContextOptions/);
    assert.match(chat, /quotes\.ambiguous/);
    assert.match(chat, /applyQuoteContextMeta/);
    assert.match(chat, /multiRequestThread/);
    assert.match(chat, /Ouvrez l’annonce concernée/);

    assert.match(client, /async listAcceptedInvitationsBetween/);
    assert.match(client, /limit\(limit\)/);
});
