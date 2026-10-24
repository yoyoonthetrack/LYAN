'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('welcome screen offers forgot-password without looping on itself', () => {
    const shell = read('app-shell.js');
    const script = read('script.js');
    assert.match(shell, /id="btnWelcomeForgot"/);
    assert.match(shell, /forgot-link:not\(#btnWelcomeForgot\)/);
    assert.match(script, /link\.id === 'btnWelcomeForgot'/);
});

test('email quota and native reset stay on the client', () => {
    const client = read('api-client.js');
    const emailLimit = client.indexOf("msg.includes('email rate limit')");
    const genericLimit = client.indexOf("msg.includes('rate limit')");
    assert.ok(emailLimit > 0 && emailLimit < genericLimit);
    assert.match(client, /L’envoi des emails est momentanément saturé/);
    assert.match(client, /app\.lyann\.dom:\/\/confirm-signup\?action=reset_password/);
});

test('native Google does not open a provider error page and recovery deep-links', () => {
    const onboarding = read('onboarding.js');
    assert.match(onboarding, /fetch\(data\.url, \{ method: 'GET', redirect: 'manual' \}\)/);
    assert.match(onboarding, /providerPage\.status >= 400/);
    assert.match(onboarding, /reset_password\|type=recovery/);
    assert.match(onboarding, /openLyannPasswordRecovery/);
});

test('Fil/Carte switch and Bokantaj cards stay white', () => {
    const css = read('bokantaj-map.css');
    assert.match(css, /\.bokantaj-view-tabs button\.is-selected\{color:#fff;background:#35583F/);
    assert.match(css, /body\.feed-page \.flash-card\{background:#fff !important/);
});
