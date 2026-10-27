'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
const header = fs.readFileSync(path.join(__dirname, '../universe-header.css'), 'utf8');

test('a shared star control paints the chosen note and leaves the stored value alone', () => {
    assert.match(chat, /window\.mountLyannStars = function/);
    assert.match(chat, /role', 'radiogroup'/);
    assert.match(chat, /aria-label', note \+ ' sur 5'/);
    assert.match(chat, /value\.textContent = shown \+ '\/5'/);
    assert.match(chat, /select\.value = String\(note\)/);
    assert.match(chat, /ArrowRight/);
    assert.match(chat, /upgradeLyannStarSelects/);
    assert.match(chat, /publishPeerReview\(picker\.value/);
    assert.match(css, /lyann-stars button\.is-on/);
    assert.match(css, /color: #E5B345/);
    assert.match(css, /color: #B7AFA3/);
});

test('the Bokantaj title is one Fraunces word', () => {
    assert.doesNotMatch(header, /banner-title-j/);
    assert.doesNotMatch(header, /"WONK"/);
    const feed = fs.readFileSync(path.join(__dirname, '../feed.html'), 'utf8');
    assert.match(feed, /<h1 class="banner-title">Bokantaj<\/h1>/);
    assert.doesNotMatch(feed, /banner-title-j/);
    assert.match(feed, /family=Fraunces/);
});
