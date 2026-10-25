'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(file) {
    return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
}

function loadSkeleton() {
    const source = read('lyann-skeleton.js');
    const timeouts = [];
    const sandbox = {
        setTimeout: (fn) => { timeouts.push(fn); return timeouts.length; },
        clearTimeout: (id) => { timeouts[id - 1] = null; }
    };
    global.window = sandbox;
    eval(source);
    return { api: sandbox.LYANN_SKELETON, flush: () => timeouts.forEach((fn) => fn && fn()) };
}

function fakeContainer() {
    const node = {
        dataset: {},
        innerHTML: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
    };
    return node;
}

test('the skeleton waits before showing so a fast load never flashes', () => {
    const { api, flush } = loadSkeleton();
    assert.equal(api.SHOW_AFTER_MS, 200);

    const quick = fakeContainer();
    api.show(quick, 'bokantaj', 3);
    api.clear(quick);
    flush();
    assert.equal(quick.innerHTML, '');
    assert.equal(quick.attributes['aria-busy'], undefined);
});

test('each list gets cards shaped like its own content', () => {
    const { api, flush } = loadSkeleton();

    const feed = fakeContainer();
    api.show(feed, 'bokantaj', 3);
    flush();
    assert.equal(feed.attributes['aria-busy'], 'true');
    assert.equal(feed.innerHTML.match(/lyann-skel lyann-skel-bokantaj/g).length, 3);
    assert.match(feed.innerHTML, /role="status">Chargement…/);
    assert.match(feed.innerHTML, /lyann-skel-avatar/);

    const talents = fakeContainer();
    api.show(talents, 'profile', 4);
    flush();
    assert.equal(talents.innerHTML.match(/lyann-skel lyann-skel-profile/g).length, 4);
    assert.match(talents.innerHTML, /lyann-skel-avatar is-large/);

    const annonces = fakeContainer();
    api.show(annonces, 'annonce', 4);
    flush();
    assert.equal(annonces.innerHTML.match(/lyann-skel lyann-skel-annonce/g).length, 4);
    assert.match(annonces.innerHTML, /lyann-skel-line is-title/);
    assert.doesNotMatch(annonces.innerHTML, /lyann-skel-avatar/);

    api.clear(annonces);
    assert.equal(annonces.innerHTML, '');
    assert.equal(annonces.dataset.skeleton, undefined);
});

test('an unknown kind renders nothing rather than an empty box', () => {
    const { api, flush } = loadSkeleton();
    const node = fakeContainer();
    api.show(node, 'mission', 3);
    flush();
    assert.equal(node.innerHTML, '');
});

test('the Bokantaj feed shows the skeleton instead of a spinner', () => {
    const source = read('script.js');
    assert.match(source, /LYANN_SKELETON\?\.show\(feedContainer, 'bokantaj', 3\)/);
    assert.match(source, /LYANN_SKELETON\?\.clear\(feedContainer\)/);
    assert.doesNotMatch(source, /Les nouvelles du quartier arrivent/);
});

test('Lyanneurs and Annonces share the helper with their own card shape', () => {
    const source = read('explorer-ui.js');
    assert.match(source, /LYANN_SKELETON\?\.show\(\$\('explorerResults'\), mode === 'annonces' \? 'annonce' : 'profile', 4\)/);
    assert.match(source, /LYANN_SKELETON\?\.clear\(container\)/);
    assert.match(source, /LYANN_SKELETON\?\.clear\(\$\('explorerResults'\)\)/);
    assert.doesNotMatch(source, /explorer-state" role="status">Chargement…/);
});

test('both pages load the helper and the shimmer respects reduced motion', () => {
    assert.match(read('feed.html'), /lyann-skeleton\.js\?v=/);
    assert.match(read('results.html'), /lyann-skeleton\.js\?v=/);
    const css = read('style.css');
    assert.match(css, /\.lyann-skel \{/);
    assert.match(css, /@keyframes lyann-skel-shimmer/);
    const reduced = css.slice(css.indexOf('@keyframes lyann-skel-shimmer'));
    assert.match(reduced.slice(0, 600), /prefers-reduced-motion: reduce/);
    assert.match(css, /\.lyann-skel-status \{/);
});
