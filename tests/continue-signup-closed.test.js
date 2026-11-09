const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Phase 3.0B. No route, script or page may confirm an e-mail address without proof of possession.
// Behaviour against real Staging: scripts/continue-signup-check.js (QA user, before/after).
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const server = read('api/server.js');

// 1. The old route is closed: 410, no Auth admin access, no user id read, no confirmation.
const start = server.indexOf("app.post('/v1/auth/continue-signup'");
assert.ok(start > 0, 'the route stays answerable for already-installed builds');
const block = server.slice(start, server.indexOf('\n});', start) + 4);
assert.match(block, /status\(410\)/);
assert.ok(!/supabaseAdmin|email_confirm|updateUserById|getUserById|req\.body|req\.params|req\.query/.test(block), 'closed route must not read input or touch Auth: ' + block);

// 2. Nothing served to users writes email_confirm / email_confirmed_at through Auth admin.
const served = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).map((f) => ['api/' + f, read('api/' + f)]);
served.forEach(([name, src]) => {
    assert.ok(!/email_confirm\s*:\s*true/.test(src), name + ' must not confirm e-mail addresses');
    assert.ok(!/email_confirmed_at\s*[:=]/.test(src.replace(/\.email_confirmed_at/g, '')), name + ' must not set email_confirmed_at');
});

// 3. No client script calls the route any more.
['onboarding.js', 'api-client.js', 'script.js', 'app-shell.js', 'dialog.js', 'confirm-signup.html', 'bienvenue.html', 'discover.html'].forEach((f) => {
    assert.ok(!/continue-signup|continueSignup/.test(read(f)), f + ' must not use continue-signup');
});

// 4. Sign-up never opens a session by itself: without a session from Supabase the member is asked to check the mailbox,
//    on Web and in the app, and an "already registered" answer shows the same screen.
const onboarding = read('onboarding.js');
assert.match(onboarding, /if \(!data\?\.session\) \{\s*showEmailPending\(/);
assert.match(onboarding, /already registered\|already exists\|already in use\|user_already_exists[\s\S]{0,200}showEmailPending/);
assert.ok(!/signInWithPassword|\.login\(onboardingData/.test(onboarding.slice(onboarding.indexOf('window.LYANN_API_CLIENT.signUp('), onboarding.indexOf('const userProfile'))), 'no automatic login after sign-up');

// 5. The confirmation page opens LYANN only with a real session.
const confirm = read('confirm-signup.html');
assert.match(confirm, /auth\.getSession\(\)/);
assert.match(confirm, /\(signedIn \|\| inApp\) \? 'discover\.html' : 'index\.html\?action=email_confirmed'/);

console.log('continue-signup closed contract ok');
