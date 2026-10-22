'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../admin-script.js'), 'utf8');

test('seal helper refuses fake success onclick', () => {
  assert.match(source, /adminSealDeadControls/);
  assert.match(source, /adminMarkUnavailable/);
  assert.doesNotMatch(source, /onclick="alert\('🎁/);
});

test('admin html no longer advertises a fake Pro gift', () => {
  const html = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  assert.doesNotMatch(html, /Abonnement Pro offert à cet utilisateur avec succès/);
  assert.match(html, /btn-grant-subscription[\s\S]{0,180}disabled/);
});
