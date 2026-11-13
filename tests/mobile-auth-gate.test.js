const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Phase 3.0A contract. Behaviour in a real WebKit: scripts/mobile-auth-gate-scenarios.js.
const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const gate = require('../mobile-auth-gate.js');
const build = require('../shared-html-build.js');
const { STATES } = gate;

// 1. Which pages are gated.
['discover.html', '/discover', 'results.html', '/results.html?mode=annonces', 'about.html', 'how-it-works.html', 'pricing.html']
    .forEach((p) => assert.strictEqual(gate.classifyPath(p), 'public', p + ' must stay readable without a session'));
['feed.html', 'professional.html', 'payment-portal.html']
    .forEach((p) => assert.strictEqual(gate.classifyPath(p), 'member', p + ' must need a session'));
['bienvenue.html', '/bienvenue'].forEach((p) => assert.strictEqual(gate.classifyPath(p), 'guest-entry', p));
['auth-callback.html', '/auth/callback', 'confirm-signup.html', '/confirm-signup', 'legal.html', 'confidentialite.html', 'index.html', '/', 'admin.html', 'admin-login.html', 'business-admin.html']
    .forEach((p) => assert.strictEqual(gate.classifyPath(p), 'open', p + ' must stay reachable without a session'));

// 2. State derivation: only a ready session with a user is AUTHENTICATED; a failure is never a logout.
assert.strictEqual(gate.stateFromAuth(null), STATES.CHECKING);
assert.strictEqual(gate.stateFromAuth({ status: 'resolving', authenticated: false }), STATES.CHECKING);
assert.strictEqual(gate.stateFromAuth({ status: 'loading', authenticated: false }), STATES.CHECKING);
assert.strictEqual(gate.stateFromAuth({ status: 'error', authenticated: false }), STATES.CHECKING);
assert.strictEqual(gate.stateFromAuth({ status: 'ready', authenticated: false }), STATES.GUEST);
assert.strictEqual(gate.stateFromAuth({ status: 'ready', authenticated: true }), STATES.AUTHENTICATED);
assert.deepStrictEqual(Object.values(STATES).sort(), ['AUTHENTICATED', 'CHECKING_SESSION', 'GUEST']);

// 3. Post-authentication target: same-origin member pages only.
assert.ok(gate.isSafeTarget('results.html?mode=annonces&view=list'));
assert.ok(gate.isSafeTarget('feed.html#post-1'));
['https://evil.example/x.html', '//evil.example', 'javascript:alert(1)', 'bienvenue.html', 'admin.html', '../x.html', 'discover', null, undefined, 'a'.repeat(700) + '.html']
    .forEach((t) => assert.ok(!gate.isSafeTarget(t), String(t).slice(0, 40) + ' must be refused'));

// 4. Only authentication actions travel to the welcome page.
assert.strictEqual(gate.authPassthrough('?action=open_login', ''), '?action=open_login');
assert.strictEqual(gate.authPassthrough('?action=resend_confirmation&x=1', ''), '?action=resend_confirmation');
assert.strictEqual(gate.authPassthrough('?mode=annonces&view=list', ''), '');
assert.strictEqual(gate.authPassthrough('?action=finances', ''), '');
assert.strictEqual(gate.authPassthrough('', '#error=access_denied&error_description=expired'), '#error=access_denied&error_description=expired');

// 5. The gate never trusts the legacy localStorage flag and never navigates on a failure.
const src = read('mobile-auth-gate.js');
assert.ok(!/lyan_user_logged_in/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'lyan_user_logged_in must not be used as proof');
assert.match(src, /LYANN_AUTH_STATE/);
assert.match(src, /function onSessionError\(\)[\s\S]*setState\(STATES\.CHECKING\)/);
assert.ok(!/function onSessionError\(\)[\s\S]{0,400}location\.replace/.test(src), 'a failure must not redirect');
assert.match(src, /hasStoredToken\(\)/);
assert.match(src, /lyann:mobile-auth-state/);

// 6. The gate is injected by the mobile build only, first in <head>, after the charset.
const page = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>x</title></head><body></body></html>';
const built = build.injectMobileAuthGate(page);
assert.ok(built.indexOf('mobile-auth-gate.js') > built.indexOf('charset'));
assert.ok(built.indexOf('mobile-auth-gate.js') < built.indexOf('<title>'));
assert.strictEqual(build.injectMobileAuthGate(built), built, 'idempotent');
assert.ok(!build.buildHtml(page).includes('mobile-auth-gate.js'), 'the website build must not receive the gate');
assert.ok(!build.injectMobileAuthGate('<html><head><meta charset="UTF-8"></head><body data-lyann-auth-callback></body></html>'.replace('<html>', '<html data-lyann-auth-callback="1">')).includes('mobile-auth-gate.js'));
assert.match(read('build_mobile.js'), /injectMobileAuthGate\(/);
assert.ok(!/mobile-auth-gate/.test(read('api/render.js')), 'api/render.js (website) must not inject the gate');

// 7. Native sign-up keeps the e-mail confirmation: no server-side auto-confirm, resend with anti-abuse limits.
const onboarding = read('onboarding.js');
assert.match(onboarding, /if \(!data\?\.session\) \{\s*showEmailPending\(onboardingData\.email\);\s*return;/);
assert.ok(!/continueSignup|continue-signup/.test(onboarding), 'sign-up must not call continue-signup (Phase 3.0B)');
const api = read('api-client.js');
assert.match(api, /resendSignupConfirmation[\s\S]*COOLDOWN_MS = 60 \* 1000[\s\S]*MAX_PER_HOUR = 6/);
assert.match(api, /code: 'email_not_confirmed'/);
assert.match(onboarding, /verifyOtp\(\{\s*token_hash: tokenHash/);
assert.match(onboarding, /__lyannRecoveryPending = true/);

// 8. Android must be able to receive the OAuth / confirmation return.
assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:scheme="app\.lyann\.dom"/);

console.log('mobile-auth-gate contract ok');
