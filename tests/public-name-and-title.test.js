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

test('wizard proposes three whole titles from the finished need', () => {
    assert.match(script, /function titleFromNeed/);
    assert.match(script, /function threeTitlesFromNeed/);
    assert.match(script, /placeWizardTitleOnNextStep/);
    assert.doesNotMatch(script, /Titre repris de votre texte/);
    const fn = sliceBetween(script, 'function titleFromNeed(text, max) {', 'window.threeTitlesFromNeed');
    const api = new Function(`const TITLE_MAX = 60;\n${fn}\nreturn { titleFromNeed, threeTitlesFromNeed };`)();
    assert.equal(api.titleFromNeed('fuite jardin maison'), 'Fuite jardin maison');
    const out = api.titleFromNeed("Bonjour, j'ai une fuite sous mon évier de cuisine, il me faudrait quelqu'un pour réparer ça ce week-end avec beaucoup de détails inutiles.");
    assert.match(out, /fuite/i);
    assert.doesNotMatch(out, /^bonjour/i);
    assert.ok(out.length <= 60);
    const titles = api.threeTitlesFromNeed("Besoin de quelqu'un pour réparer ma machine à laver.");
    assert.equal(titles.length, 3);
    assert.equal(titles[0], 'Réparer ma machine à laver');
    for (const title of titles) {
        assert.ok(title.length >= 3 && title.length <= 60);
        assert.doesNotMatch(title, /quelq$/i);
    }
});
