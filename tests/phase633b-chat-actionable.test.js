'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dossier = require('../mission-dossier.js');

const ROOT = path.join(__dirname, '..');

function src(name) {
    return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

const haie = {
    requestId: '4a25d5b4-fb93-4f76-b3f2-e9b3e7328dc0',
    invitationId: 'inv-haie',
    title: '[PHASE4-QA] Taille de haie'
};
const fixture = {
    requestId: '7c0e10ee-4bbf-44e8-8e93-0c3c7f6fc83d',
    invitationId: 'inv-fix',
    title: 'QA-616A-PRE-TRANSFER-FIXTURE'
};

test('6.33B resolveEventDossier matches only the owning dossier', () => {
    const quote = { id: 'q1', request_id: haie.requestId, request_invitation_id: haie.invitationId, request_title: 'wrong last opened' };
    const matched = dossier.resolveEventDossier(quote, [haie, fixture]);
    assert.equal(matched.ok, true);
    assert.equal(matched.title, haie.title);
    assert.equal(matched.requestId, haie.requestId);

    const other = dossier.resolveEventDossier({ id: 'q2', request_id: fixture.requestId }, [haie, fixture]);
    assert.equal(other.title, fixture.title);
    assert.notEqual(other.requestId, haie.requestId);

    const orphan = dossier.resolveEventDossier({ id: 'q3', request_title: haie.title }, [haie, fixture]);
    assert.equal(orphan.ok, false);
    assert.equal(orphan.title, '');
    assert.equal(orphan.reason, 'no_id');

    const missing = dossier.resolveEventDossier({ id: 'q4', request_id: 'unknown-req' }, [haie, fixture]);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'inaccessible');
});

test('6.33B compact labels stay event-first and include replaced', () => {
    assert.equal(dossier.compactEventLabel('quote_accepted', ''), 'Devis accepté');
    assert.equal(dossier.compactEventLabel('quote_declined', ''), 'Devis refusé');
    assert.equal(dossier.compactEventLabel('quote_replaced', ''), 'Devis remplacé');
    assert.equal(dossier.compactEventLabel('quote_accepted', haie.title), 'Devis accepté — ' + haie.title);
});

test('6.33B chat only links a dossier when resolveEventDossier is ok', () => {
    const chat = src('chat-logic.js');
    const cta = chat.slice(chat.indexOf('function attachDossierEventCta'), chat.indexOf('function attachGuidedEventBody'));
    assert.match(cta, /resolved\.ok/);
    assert.match(cta, /chat-dossier-event-open/);
    assert.doesNotMatch(cta, /quote\.request_title/);
    const banner = chat.slice(chat.indexOf('function paintPendingActionBanner'), chat.indexOf('window.paintPendingActionBanner'));
    assert.match(banner, /data-dossier-invitation/);
    assert.match(banner, /void openMissionDossier/);
    assert.doesNotMatch(banner, /bindMissionAction|checkout|stripe/i);
    assert.match(chat, /return window\.LYANN_MISSION_SURFACES\.openDossier/);
});

test('web and iOS hide the old mission banner in favor of Missions (n)', () => {
    const css = src('style.css');
    const chat = src('chat-logic.js');
    const surfaces = src('mission-surfaces.js');
    assert.match(css, /#chatModal #chatMissionContextBar/);
    assert.match(css, /#chatModal #chatFinanceStrip/);
    assert.match(chat, /paintTogetherButton/);
    assert.doesNotMatch(chat.slice(chat.indexOf('function paintThreadBusinessBanner'), chat.indexOf('window.isUserBlocked')), /paintCompactThreadBanner/);
    assert.match(surfaces, /Missions \(' \+ count \+ '\)/);
    const feed = src('feed.html');
    assert.match(feed, /id="chatHeaderActions"/);
    assert.match(feed, /id="chatToggleFavoriteBtn"/);
    assert.match(feed, /chat-contextual-actions" style="display: none;/);
});

test('6.33B header CSS no longer overflows the name', () => {
    const css = src('style.css');
    assert.match(css, /overflow-x:\s*hidden/);
    assert.match(css, /#chatHeaderActions/);
    assert.doesNotMatch(css, /max-width:\s*calc\(100vw - 120px\)/);
    const together = css.slice(css.indexOf('.chat-missions-together {'), css.indexOf('.chat-missions-together i'));
    assert.match(css, /max-width:\s*6\.6rem/);
    assert.match(together, /max-width:\s*9\.5rem/);
    assert.match(together, /}/);
});
