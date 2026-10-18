'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const chat = fs.readFileSync(path.join(__dirname, '../chat-logic.js'), 'utf8');
const router = fs.readFileSync(path.join(__dirname, '../app-router.js'), 'utf8');
const script = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

test('profile share uses a stable member deep link', () => {
    assert.match(chat, /function buildProfileShareUrl\(memberId\)/);
    assert.match(chat, /action=member&id=/);
    assert.match(router, /register\('member'/);
    assert.match(router, /action === 'member'/);
});

test('profile share offers OS apps and in-app LYANN chat', () => {
    assert.match(chat, /data-share-dest="external"/);
    assert.match(chat, /WhatsApp, Messages/);
    assert.match(chat, /data-share-dest="lyann"/);
    assert.match(chat, /Un Lyanneur/);
    assert.match(chat, /sendSharedProfileToChat/);
    assert.match(chat, /entityType: 'profile'/);
    assert.doesNotMatch(chat, /Lien du profil de \$\{currentChatContact \? currentChatContact\.name : 'ce membre'\} copié !/);
});

test('public profile CTA keeps a share button after render', () => {
    assert.match(script, /btn-share-profile/);
    assert.match(script, /window\.currentVisitingMember = currentVisitingMember/);
    assert.doesNotMatch(script, /shareNative\("Profil LYANN"/);
});
