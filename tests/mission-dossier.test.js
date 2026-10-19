'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dossier = require('../mission-dossier.js');

const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

function inv(id, requestId, requester, recipient) {
    return { id, request_id: requestId, requester_id: requester, recipient_id: recipient, status: 'ACCEPTED', conversation_id: 'conv-ab' };
}

test('6.26 inverted roles produce two independent dossiers', () => {
    const dossiers = dossier.listDossiers({
        viewerId: A,
        conversationId: 'conv-ab',
        invitations: [
            inv('inv-1', 'R1', A, B),
            inv('inv-2', 'R2', B, A)
        ],
        requests: [
            { id: 'R1', title: 'Terrasse', requester_id: A },
            { id: 'R2', title: 'Site internet', requester_id: B }
        ],
        missions: [],
        quotes: [
            { id: 'q1', request_id: 'R1', request_invitation_id: 'inv-1', status: 'SENT', total_amount: 120 },
            { id: 'q2', request_id: 'R2', request_invitation_id: 'inv-2', status: 'SENT', total_amount: 800 }
        ]
    });
    assert.equal(dossiers.length, 2);
    const r1 = dossiers.find((row) => row.requestId === 'R1');
    const r2 = dossiers.find((row) => row.requestId === 'R2');
    assert.equal(r1.roleCode, 'requester');
    assert.equal(r1.roleLabel, 'Vous demandez');
    assert.equal(r2.roleCode, 'lyanneur');
    assert.equal(r2.roleLabel, 'Vous êtes Lyanneur');
    assert.equal(r1.quotes[0].total_amount, 120);
    assert.equal(r2.quotes[0].total_amount, 800);
    assert.equal(dossier.quoteBelongsToDossier(r1.quotes[0], r2), false);
    assert.equal(dossier.quoteBelongsToDossier(r2.quotes[0], r1), false);
});

test('6.26 refused quote on R1 never appears on R2', () => {
    const dossiers = dossier.listDossiers({
        viewerId: B,
        invitations: [inv('inv-1', 'R1', A, B), inv('inv-2', 'R2', B, A)],
        requests: [{ id: 'R1', title: 'Terrasse', requester_id: A }, { id: 'R2', title: 'Site', requester_id: B }],
        quotes: [
            { id: 'q-old', request_id: 'R1', request_invitation_id: 'inv-1', status: 'REJECTED', total_amount: 50 },
            { id: 'q-new', request_id: 'R1', request_invitation_id: 'inv-1', status: 'SENT', total_amount: 70 },
            { id: 'q-r2', request_id: 'R2', request_invitation_id: 'inv-2', status: 'SENT', total_amount: 900 }
        ],
        missions: []
    });
    const r1 = dossiers.find((row) => row.requestId === 'R1');
    const r2 = dossiers.find((row) => row.requestId === 'R2');
    assert.equal(r1.statusCode, 'quote_pending');
    assert.equal(r2.statusCode, 'quote_pending');
    assert.ok(r1.quotes.every((quote) => quote.request_id === 'R1'));
    assert.ok(r2.quotes.every((quote) => quote.request_id === 'R2'));
    assert.equal(r2.quotes.some((quote) => quote.id === 'q-old' || quote.id === 'q-new'), false);
});

test('6.26 selectActiveDossier never auto-picks among several dossiers', () => {
    const dossiers = dossier.listDossiers({
        viewerId: A,
        invitations: [inv('inv-1', 'R1', A, B), inv('inv-2', 'R2', B, A)],
        requests: [{ id: 'R1', requester_id: A }, { id: 'R2', requester_id: B }],
        missions: [],
        quotes: []
    });
    const none = dossier.selectActiveDossier(dossiers, {});
    assert.equal(none.ok, false);
    assert.equal(none.ambiguous, true);
    assert.equal(none.dossier, null);

    const picked = dossier.selectActiveDossier(dossiers, { requestId: 'R2' });
    assert.equal(picked.ok, true);
    assert.equal(picked.dossier.requestId, 'R2');
    assert.equal(picked.dossier.invitationId, 'inv-2');
});

test('6.26 unique dossier may be selected without a hint', () => {
    const dossiers = dossier.listDossiers({
        viewerId: A,
        invitations: [inv('inv-1', 'R1', A, B)],
        requests: [{ id: 'R1', requester_id: A }],
        missions: [],
        quotes: []
    });
    const picked = dossier.selectActiveDossier(dossiers, {});
    assert.equal(picked.ok, true);
    assert.equal(picked.dossier.requestId, 'R1');
});

test('6.26 session generation isolates a late response', () => {
    const session = dossier.createDossierSession();
    const first = session.begin(dossier.dossierKey({ requestId: 'R1', invitationId: 'inv-1' }));
    session.begin(dossier.dossierKey({ requestId: 'R2', invitationId: 'inv-2' }));
    assert.equal(session.isCurrent(first), false);
    assert.equal(session.isCurrent(session.generation()), true);
});

test('6.26 compact events keep the request title', () => {
    assert.equal(dossier.compactEventLabel('quote_created', 'Réparation de terrasse'), 'Nouveau devis — Réparation de terrasse');
    assert.equal(dossier.compactEventLabel('quote_declined', 'Création de site internet'), 'Devis refusé — Création de site internet');
    assert.equal(dossier.compactEventLabel('mission_completed', 'Jardin'), 'Mission terminée — Jardin');
});

test('6.26 outsider C has no dossier for the A/B pair from empty RLS rows', () => {
    const dossiers = dossier.listDossiers({
        viewerId: C,
        invitations: [],
        missions: [],
        quotes: [],
        requests: []
    });
    assert.deepEqual(dossiers, []);
});

test('6.26 chat and messaging isolate dossier caches and fanout requestId', () => {
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const repo = fs.readFileSync(path.join(__dirname, '..', 'messaging-repository.js'), 'utf8');
    const client = fs.readFileSync(path.join(__dirname, '..', 'api-client.js'), 'utf8');
    assert.match(chat, /function resetDossierCaches/);
    assert.match(chat, /timelineQuotes\.clear\(\)/);
    assert.match(chat, /function selectChatDossier/);
    assert.match(chat, /function paintDossierStrip/);
    assert.match(chat, /payload\.requestId/);
    assert.match(chat, /function chatFanoutWake/);
    assert.match(chat, /function dealEventBelongsToActiveDossier/);
    assert.match(chat, /openMissionDossier/);
    assert.match(chat, /compactEventLabel/);
    assert.match(repo, /dossiers:/);
    assert.match(repo, /multiRequest/);
    assert.match(client, /mismatchedHint/);
    assert.match(chat, /allowThreadPanel/);
    assert.match(chat, /LYANN_MISSION_SURFACES/);
});

test('6.27 filter/search/sort stay deterministic for 27 dossiers', () => {
    const invitations = [];
    const requests = [];
    for (let i = 1; i <= 27; i += 1) {
        const id = 'R' + String(i).padStart(2, '0');
        invitations.push(inv('inv-' + id, id, i % 2 ? A : B, i % 2 ? B : A));
        requests.push({
            id,
            title: i === 6 ? 'Réparation de terrasse' : ('Mission ' + id),
            requester_id: i % 2 ? A : B,
            updated_at: '2026-01-01T00:00:' + String(i).padStart(2, '0') + 'Z'
        });
    }
    const dossiers = dossier.listDossiers({ viewerId: A, invitations, requests, quotes: [], missions: [] });
    assert.equal(dossiers.length, 27);
    const sorted = dossier.sortDossiers(dossiers);
    assert.equal(sorted[0].requestId, 'R27');
    assert.equal(sorted[26].requestId, 'R01');
    const terrasse = dossier.filterDossiers(dossiers, { query: 'terrasse', bucket: 'open' });
    assert.equal(terrasse.length, 1);
    assert.equal(terrasse[0].title, 'Réparation de terrasse');
    const done = dossier.filterDossiers(dossiers.map((row, index) => Object.assign({}, row, { statusCode: index < 3 ? 'done' : row.statusCode })), { bucket: 'done' });
    assert.equal(done.length, 3);
    const none = dossier.selectActiveDossier(dossiers, {});
    assert.equal(none.ok, false);
    assert.equal(none.ambiguous, true);
});

test('6.27C Mes missions search R2 never keeps R3 and uniqueDossiers drops copies', () => {
    const invitations = [
        inv('inv-r1', 'r1', A, B),
        inv('inv-r2', 'r2', B, A),
        inv('inv-r3', 'r3', A, B),
        inv('inv-r2', 'r2', B, A)
    ];
    const requests = [
        { id: 'r1', title: 'QA-627B-R1-terrasse', requester_id: A },
        { id: 'r2', title: 'QA-627B-R2-site', requester_id: B },
        { id: 'r3', title: 'QA-627B-R3-jardin', requester_id: A }
    ];
    const listed = dossier.listDossiers({ viewerId: A, invitations, requests, quotes: [], missions: [] });
    assert.equal(listed.length, 3);
    const duplicated = listed.concat(listed);
    assert.equal(dossier.uniqueDossiers(duplicated).length, 3);
    const r2 = dossier.filterDossiers(duplicated, { query: 'QA-627B-R2', bucket: 'open' });
    assert.equal(r2.length, 1);
    assert.equal(r2[0].title, 'QA-627B-R2-site');
    assert.equal(r2.some((row) => /R3/.test(row.title)), false);
    const cleared = dossier.filterDossiers(duplicated, { query: '', bucket: 'open' });
    assert.equal(cleared.length, 3);
    const withMissionTwin = listed.concat([{
        requestId: 'r2',
        invitationId: '',
        missionId: 'mis-r2',
        title: 'QA-627B-R2-site'
    }]);
    assert.equal(dossier.uniqueDossiers(withMissionTwin).length, 3);
});
