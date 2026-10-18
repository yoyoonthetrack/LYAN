'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const explorer = fs.readFileSync(path.join(__dirname, '..', 'explorer-ui.js'), 'utf8');

function sliceBetween(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + 1);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
}

test('public names are Prénom + initiale, first letter upper', () => {
    const capSrc = sliceBetween(script, 'window.capitalizeLyannName = function(str) {', 'window.formatPublicName = function');
    const fmtSrc = sliceBetween(script, 'window.formatPublicName = function(profileOrFirstName, lastName, fallback) {', 'window.formatProfileLocation = function');
    const window = {};
    const capitalizeLyannName = new Function('window', `${capSrc}\nreturn window.capitalizeLyannName;`)(window);
    window.capitalizeLyannName = capitalizeLyannName;
    const formatPublicName = new Function('window', `${fmtSrc}\nreturn window.formatPublicName;`)(window);
    assert.equal(capitalizeLyannName('yoann'), 'Yoann');
    assert.equal(capitalizeLyannName('JEAN-MARC'), 'Jean-Marc');
    assert.equal(formatPublicName({ first_name: 'yoann', last_name: 'dupont' }), 'Yoann D.');
    assert.equal(formatPublicName({ first_name: 'LUDIVINE', last_name: 'RIVIERE' }), 'Ludivine R.');
    assert.equal(formatPublicName({ first_name: 'yoann', last_name: 'd' }), 'Yoann D.');
    assert.match(explorer, /formatPublicName/);
});

test('wizard keeps a truncated title from the written need', () => {
    assert.match(script, /function titleFromNeed/);
    assert.match(script, /function ensureWizardTitleFromNeed/);
    assert.match(script, /Titre repris de votre texte/);
    assert.doesNotMatch(script, /Choisissez un des trois titres, puis corrigez-le si besoin/);
    const fn = sliceBetween(script, 'function titleFromNeed(text, max) {', 'function localTitleChoices');
    const titleFromNeed = new Function(`const TITLE_MAX = 60;\n${fn}\nreturn titleFromNeed;`)();
    assert.equal(titleFromNeed('fuite jardin maison'), 'Fuite jardin maison');
    const out = titleFromNeed("Bonjour, j'ai une fuite sous mon évier de cuisine, il me faudrait quelqu'un pour réparer ça ce week-end avec beaucoup de détails inutiles.");
    assert.match(out, /fuite/i);
    assert.doesNotMatch(out, /^bonjour/i);
    assert.ok(out.length <= 60);
});
