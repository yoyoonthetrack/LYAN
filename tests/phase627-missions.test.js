'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('6.27 surfaces keep picker and dossier out of the thread', () => {
    const surfaces = fs.readFileSync(path.join(__dirname, '..', 'mission-surfaces.js'), 'utf8');
    const chat = fs.readFileSync(path.join(__dirname, '..', 'chat-logic.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'messaging-ui.js'), 'utf8');
    assert.match(surfaces, /Missions ensemble/);
    assert.match(surfaces, /chatMissionPickerOverlay/);
    assert.match(surfaces, /openDossier/);
    assert.match(surfaces, /filterDossiers/);
    assert.match(surfaces, /__lyannChatContact/);
    assert.match(surfaces, /cachedContact/);
    assert.match(chat, /allowThreadPanel !== true/);
    const open = surfaces.slice(surfaces.indexOf('async function openDossier'), surfaces.indexOf('function syncOpenDossier'));
    assert.ok(open.indexOf('revealDossier(cached)') < open.indexOf('reloadPairDossiers'), 'dossier paints before the pair reload');
    assert.match(chat, /getPublicProfileWithReputation\(contactId\)/);
    assert.match(css, /chat-missions-together/);
    assert.match(css, /chat-mission-picker/);
    assert.match(ui, /chat-mission-picker/);
});

test('6.27 Mes missions keeps dossierApi in render scope', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    const fn = script.split('window.renderMonActiviteSubView')[1] || '';
    const head = fn.slice(0, 2500);
    assert.match(head, /const dossierApi = window\.LYANN_MISSION_DOSSIER/);
    assert.doesNotMatch(head, /if \(client && client\.supabase && currentUserId\) \{[\s\S]*const dossierApi/);
});

test('6.27C Mes missions filters in place and removes non-matching rows', () => {
    const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
    assert.match(script, /window\.applyMyMissionsSearch/);
    assert.match(script, /window\.paintMyMissionsList/);
    assert.match(script, /id="myMissionsResults"/);
    assert.match(script, /oninput="window\.applyMyMissionsSearch/);
    assert.match(script, /list\.replaceChildren\(\)/);
    assert.doesNotMatch(script, /profileList\.innerHTML = rowsHTML/);
    assert.doesNotMatch(script, /__lyannMissionQuery=this\.value; window\.switchActivityTab\('missions'/);
});

test('6.27 pages load mission-surfaces after mission-dossier', () => {
    ['feed.html', 'index.html', 'results.html'].forEach((page) => {
        const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
        const dossier = html.indexOf('mission-dossier.js');
        const surfaces = html.indexOf('mission-surfaces.js');
        assert.ok(dossier > 0, page + ' mission-dossier');
        assert.ok(surfaces > dossier, page + ' mission-surfaces after dossier');
    });
});
