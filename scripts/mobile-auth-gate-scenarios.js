#!/usr/bin/env node
/*
 * Phase 3.0A. Mandatory mobile authentication, exercised in real WebKit against the mobile bundle (www/).
 *
 *   LYANN_RUNTIME=staging LYANN_STAGING_PUBLIC_ORIGIN=https://staging.lyann.app node -r ./scripts/force-staging-v2-env.js build_mobile.js
 *   node scripts/mobile-auth-gate-scenarios.js [bundleDir] [--only=name1,name2]
 *
 * Capacitor is mocked (isNativePlatform, getPlatform, App.addListener, the Apple plugin). Sessions are real Supabase
 * Staging sessions (QA account from .env.staging-v2). Magic / recovery tokens come from the Auth admin API
 * (generateLink never sends an e-mail). Anything that would send an e-mail (sign-up, resend) is mocked at the network.
 * Staging only: scripts/force-staging-v2-env.js refuses any other project.
 */
require('./force-staging-v2-env');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { webkit, devices } = require('playwright');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const bundle = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'www'));
const only = ((args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.gif': 'image/gif', '.mp4': 'video/mp4' };
const QA = { email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD };
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const TABS = ['tab-discover', 'tab-lyanneurs', 'tab-annonces', 'tab-messages', 'tab-profile'];
const MEMBER_PAGES = ['discover.html', 'results.html?mode=lyanneurs', 'results.html?mode=annonces', 'feed.html', 'pricing.html', 'professional.html', 'about.html'];

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://x');
            let file = path.join(bundle, decodeURIComponent(url.pathname));
            if (!file.startsWith(bundle)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

const results = [];
function check(scenario, label, ok, detail) {
    results.push({ scenario, label, ok: !!ok, detail: ok ? undefined : detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${scenario}] ${label}${ok ? '' : '  ->  ' + JSON.stringify(detail)}`);
}

// Samples every animation frame, across navigations, whether any child of <body> is visible, per page.
const FRAME_SAMPLER = () => {
    const key = '__qa_frames';
    const sample = () => {
        try {
            const body = document.body;
            if (body) {
                const leaked = [...body.children].filter((el) => !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)
                    && el.id !== 'lyannBootSplash' && el.id !== 'lyannGatePanel'
                    && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().height > 0).length;
                const list = JSON.parse(sessionStorage.getItem(key) || '[]');
                list.push({ p: location.pathname.split('/').pop() + location.search, auth: document.documentElement.getAttribute('data-lyann-mobile-auth'), checking: document.documentElement.classList.contains('lyann-gate-checking'), leaked });
                sessionStorage.setItem(key, JSON.stringify(list.slice(-400)));
            }
        } catch (_) {}
        requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
};

async function newPhone(browser, opts = {}) {
    const context = await browser.newContext({ userAgent: devices['iPhone 15'].userAgent, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
    if (!opts.web) {
        await context.addInitScript((o) => {
            window.__appUrlHandlers = [];
            window.Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => o.platform,
                Plugins: {
                    App: { addListener: (name, fn) => { if (name === 'appUrlOpen') window.__appUrlHandlers.push(fn); return Promise.resolve({ remove() {} }); } },
                    LyannAppleSignIn: { authorize: async () => ({ identityToken: 'qa.apple.token', nonce: 'qa-nonce', givenName: 'Qa', familyName: 'Apple' }) }
                }
            };
        }, { platform: opts.platform || 'ios' });
    }
    await context.addInitScript(FRAME_SAMPLER);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
    return { context, page, errors };
}

const frames = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__qa_frames') || '[]')).catch(() => []);
const leakedOn = (list, test) => list.filter((f) => test(f.p) && f.leaked > 0 && f.auth !== 'AUTHENTICATED');
const isMember = (p) => !/^(bienvenue|confirm-signup|legal|auth-callback)\.html/.test(p);
const wait = (page, ms) => page.waitForTimeout(ms);
async function waitPath(page, re, timeout = 25000) {
    try { await page.waitForURL(re, { timeout }); return true; } catch (_) { return false; }
}
// Signing in on the welcome page makes the gate navigate at once: do not wait for the evaluation to return.
async function loginApi(page) {
    return page.evaluate(async (c) => {
        const p = window.LYANN_API_CLIENT.login(c.email, c.password);
        const r = await Promise.race([p, new Promise((resolve) => setTimeout(() => resolve({ data: { user: { id: 'pending' } } }), 4000))]);
        return { id: r.data?.user?.id || null, error: r.error?.message || null };
    }, QA).catch((e) => (/context was destroyed|navigation/i.test(String(e.message)) ? { id: 'navigated', error: null } : { id: null, error: String(e.message) }));
}
// The gate navigates away as soon as the session is gone, which destroys the evaluation context: expected.
async function logout(page) { await page.evaluate(() => LYANN_API_CLIENT.logout()).catch(() => {}); }
async function ready(page) {
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.login, null, { timeout: 25000 });
}
const navInfo = (page) => page.evaluate(() => {
    const navs = document.querySelectorAll('.mobile-bottom-nav');
    const nav = navs[0];
    const r = nav ? nav.getBoundingClientRect() : null;
    return {
        count: navs.length,
        tabs: nav ? [...nav.querySelectorAll('.nav-tab')].map((t) => t.id) : [],
        visible: !!nav && getComputedStyle(nav).display !== 'none' && getComputedStyle(nav).visibility !== 'hidden',
        inViewport: !!r && r.bottom <= innerHeight + 1 && r.top > 0
    };
});
async function mintToken(type, email) {
    const { data, error } = await admin.auth.admin.generateLink({ type, email });
    if (error) throw new Error('generateLink ' + type + ': ' + error.message);
    return data.properties.hashed_token;
}
async function appUrl(page, url) { await page.evaluate((u) => window.__appUrlHandlers.forEach((fn) => fn({ url: u })), url); }


// Follows the official Supabase verification link the way a mail client would, without opening any page: the answer
// is the redirect (303) that the browser would follow, carrying the session in its fragment or an error.
async function followOfficialLink(actionLink) {
    const res = await fetch(actionLink, { redirect: 'manual' });
    return res.headers.get('location') || '';
}
const userState = async (id) => { const u = await admin.auth.admin.getUserById(id); return { confirmed: !!u.data?.user?.email_confirmed_at, error: u.error && u.error.message }; };
const anonClient = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function newUnconfirmedUser(redirectTo) {
    const email = `qa-3b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@lyann-test.invalid`;
    const password = `Qa-${Math.random().toString(36).slice(2)}-Aa1`;
    const link = await admin.auth.admin.generateLink({ type: 'signup', email, password, options: redirectTo ? { redirectTo } : undefined });
    if (link.error) throw new Error('generateLink signup: ' + link.error.message);
    return { id: link.data.user.id, email, password, actionLink: link.data.properties.action_link, hashedToken: link.data.properties.hashed_token };
}

const scenarios = {
    // 1. Direct links to member pages without session -> welcome flow, nothing of the member UI is ever painted.
    async 'guest-direct-links'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        for (const url of MEMBER_PAGES.concat(['index.html'])) {
            await page.goto(`${origin}/${url}`, { waitUntil: 'domcontentloaded' });
            const went = await waitPath(page, /bienvenue\.html/);
            await wait(page, 700);
            const list = await frames(page);
            const leaked = leakedOn(list, isMember);
            const state = await page.evaluate(() => ({
                home: !!document.getElementById('nativeGuestHome') && !document.getElementById('nativeGuestHome').hidden,
                nav: document.querySelectorAll('.mobile-bottom-nav').length,
                state: window.LYANN_MOBILE_AUTH && window.LYANN_MOBILE_AUTH.getState()
            }));
            check('guest-direct-links', `${url} -> bienvenue, welcome slides, no bottom bar`, went && state.home && state.nav === 0 && state.state === 'GUEST', { went, ...state });
            check('guest-direct-links', `${url}: no member element painted before the redirect`, leaked.length === 0, leaked.slice(0, 3));
            await page.evaluate(() => sessionStorage.removeItem('__qa_frames'));
        }
        const slides = await page.evaluate(() => document.querySelectorAll('.native-guest-slide').length);
        check('guest-direct-links', 'welcome slides present', slides >= 5, slides);
        const buttons = await page.evaluate(() => ({
            apple: !!document.querySelector('#nativeGuestWelcome .btn-apple-auth'),
            google: !!document.querySelector('#btnGuestGoogle'),
            signup: !!document.querySelector('#btnGuestSignup'),
            login: !!document.querySelector('#nativeGuestLoginForm'),
            forgot: !!document.querySelector('#nativeGuestWelcome .forgot-link, #btnWelcomeForgot')
        }));
        check('guest-direct-links', 'Apple, Google, e-mail sign-up, e-mail login are offered', buttons.apple && buttons.google && buttons.signup && buttons.login, buttons);
        for (const open of ['confirm-signup.html', 'legal.html', 'auth-callback.html']) {
            await page.goto(`${origin}/${open}`, { waitUntil: 'domcontentloaded' });
            await wait(page, 1500);
            check('guest-direct-links', `${open} stays reachable without a session`, page.url().includes(open), page.url());
        }
        await context.close();
    },

    // 2. Guest signs in from the welcome page: lands on the deep-linked page / Découvrir with the 5 tabs, no reload.
    async 'late-login-and-tabs'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        await page.goto(`${origin}/results.html?mode=annonces`, { waitUntil: 'domcontentloaded' });
        await waitPath(page, /bienvenue\.html/);
        await page.click('#btnNativeLogin');
        await page.waitForFunction(() => !document.getElementById('nativeGuestAuthSheet')?.hidden, null, { timeout: 20000 });
        await wait(page, 300);
        await page.fill('#nativeGuestLoginEmail', QA.email);
        await page.fill('#nativeGuestLoginPassword', QA.password);
        await page.click('#nativeGuestLoginForm button[type="submit"]');
        const landed = await waitPath(page, /results\.html\?mode=annonces/);
        check('late-login-and-tabs', 'after sign-in: back on the page that was requested', landed, page.url());
        await wait(page, 4000);
        const nav = await navInfo(page);
        check('late-login-and-tabs', 'five tabs, exactly one bar, visible', nav.count === 1 && JSON.stringify(nav.tabs) === JSON.stringify(TABS) && nav.visible && nav.inViewport, nav);
        // second login from a plain launch lands on Découvrir
        await logout(page);
        await waitPath(page, /bienvenue\.html/);
        await ready(page);
        const login = await loginApi(page);
        const toDiscover = await waitPath(page, /discover\.html/);
        check('late-login-and-tabs', 'sign-in from the welcome page lands on Découvrir', login.id && toDiscover, { login, url: page.url() });
        await wait(page, 4000);
        const nav2 = await navInfo(page);
        check('late-login-and-tabs', 'Découvrir shows the five tabs', JSON.stringify(nav2.tabs) === JSON.stringify(TABS) && nav2.count === 1 && nav2.visible, nav2);
        const scroll = await page.evaluate(() => { const o = getComputedStyle(document.body).overflowY; return { overflow: o, locked: o === 'hidden' && !document.body.classList.contains('explorer-annonces-map-view') }; });
        check('late-login-and-tabs', 'member page scrolls normally (hotfix preserved)', !scroll.locked, scroll);
        await context.close();
    },

    // 3. Session restore, welcome page forwards members, logout, expiry.
    async 'restore-logout-expiry'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        const login = await loginApi(page);
        check('restore-logout-expiry', 'QA sign-in', !!login.id, login);
        await waitPath(page, /discover\.html/);
        await page.evaluate(() => sessionStorage.removeItem('__qa_frames'));
        await page.goto(`${origin}/results.html?mode=lyanneurs`, { waitUntil: 'domcontentloaded' });
        await wait(page, 5000);
        check('restore-logout-expiry', 'restore: member page stays open with the stored session', /results\.html/.test(page.url()), page.url());
        const nav = await navInfo(page);
        check('restore-logout-expiry', 'restore: five tabs', JSON.stringify(nav.tabs) === JSON.stringify(TABS) && nav.count === 1, nav);
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        const fwd = await waitPath(page, /discover\.html/);
        const welcomeFrames = (await frames(page)).filter((f) => /^bienvenue/.test(f.p) && f.leaked > 0 && f.auth !== 'GUEST');
        check('restore-logout-expiry', 'a member opening the welcome page is sent to Découvrir without seeing the slides', fwd && welcomeFrames.length === 0, { fwd, welcomeFrames: welcomeFrames.slice(0, 2) });
        // logout on a member page
        await ready(page);
        await logout(page);
        const out = await waitPath(page, /bienvenue\.html/);
        check('restore-logout-expiry', 'logout: UI returns to the welcome flow', out, page.url());
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        check('restore-logout-expiry', 'after logout, Découvrir is closed', await waitPath(page, /bienvenue\.html/), page.url());
        // definitive expiry: stored token expired and refresh token refused
        await ready(page);
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await loginApi(page);
        await waitPath(page, /discover\.html/);
        await page.evaluate(() => {
            Object.keys(localStorage).filter((k) => /auth-token/.test(k)).forEach((k) => { const v = JSON.parse(localStorage.getItem(k)); v.expires_at = 1; v.expires_in = 0; localStorage.setItem(k, JSON.stringify(v)); });
        });
        await context.route('**/auth/v1/token**', (route) => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }) }));
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        check('restore-logout-expiry', 'refused refresh token (definitive expiry): back to the welcome flow', await waitPath(page, /bienvenue\.html/), page.url());
        await context.close();
    },

    // 4. Temporary failures are never a logout.
    async 'network-failure'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await loginApi(page);
        await waitPath(page, /discover\.html/);
        await page.evaluate(() => {
            sessionStorage.removeItem('__qa_frames');
            Object.keys(localStorage).filter((k) => /auth-token/.test(k)).forEach((k) => { const v = JSON.parse(localStorage.getItem(k)); v.expires_at = 1; v.expires_in = 0; localStorage.setItem(k, JSON.stringify(v)); });
        });
        await context.route('**/auth/v1/token**', (route) => route.abort());
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await wait(page, 9000);
        const during = await page.evaluate(() => ({
            url: location.pathname.split('/').pop(),
            state: window.LYANN_MOBILE_AUTH.getState(),
            panel: !!document.getElementById('lyannGatePanel'),
            token: Object.keys(localStorage).some((k) => /auth-token/.test(k))
        }));
        check('network-failure', 'token endpoint unreachable: stays on the page, not logged out, session kept', during.url === 'discover.html' && during.token, during);
        check('network-failure', 'state stays CHECKING_SESSION and a retry panel is offered', during.state === 'CHECKING_SESSION' && during.panel, during);
        const leaked = leakedOn(await frames(page), isMember);
        check('network-failure', 'no member content shown while the session is unknown', leaked.length === 0, leaked.slice(0, 3));
        await context.unroute('**/auth/v1/token**');
        await page.click('#lyannGateRetry');
        await page.waitForFunction(() => window.LYANN_MOBILE_AUTH.getState() === 'AUTHENTICATED', null, { timeout: 20000 }).catch(() => {});
        await wait(page, 2500);
        const after = await page.evaluate(() => ({ url: location.pathname.split('/').pop(), state: window.LYANN_MOBILE_AUTH.getState(), panel: !!document.getElementById('lyannGatePanel'), nav: document.querySelectorAll('.mobile-bottom-nav').length }));
        check('network-failure', 'retry once the network is back: member page opens, no reload of the app, one bar', after.url === 'discover.html' && after.state === 'AUTHENTICATED' && !after.panel && after.nav === 1, after);
        await page.close();
        // SDK blocked (offline cold start): with a stored session -> held; without -> welcome flow
        const withToken = await context.newPage();
        await context.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
        await withToken.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await wait(withToken, 8000);
        const held = await withToken.evaluate(() => ({ url: location.pathname.split('/').pop(), panel: !!document.getElementById('lyannGatePanel'), token: Object.keys(localStorage).some((k) => /auth-token/.test(k)) }));
        check('network-failure', 'SDK unreachable with a stored session: held on the page with a retry panel (not logged out)', held.url === 'discover.html' && held.panel && held.token, held);
        await context.close();
        const guest = await newPhone(browser);
        await guest.context.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
        await guest.page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        check('network-failure', 'SDK unreachable without any stored session: welcome flow', await waitPath(guest.page, /bienvenue\.html/), guest.page.url());
        await guest.context.close();
    },

    // 5. Authentication returns: deep links, confirmation, recovery, expired link, OAuth plumbing.
    async 'auth-returns'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        const seen = { authorize: [], pkce: [], idToken: [], verify: [] };
        await context.route('**/auth/v1/authorize**', (route) => { seen.authorize.push(route.request().url()); route.fulfill({ status: 200, body: '' }); });
        await context.route('**/auth/v1/token?grant_type=pkce**', (route) => { seen.pkce.push(1); route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'QA fake code' }) }); });
        await context.route('**/auth/v1/token?grant_type=id_token**', (route) => { seen.idToken.push(JSON.parse(route.request().postData() || '{}')); route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant', error_description: 'QA fake token' }) }); });
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
        await page.click('#btnNativeLogin');
        await wait(page, 400);
        // Google
        await page.evaluate(() => { window.open = () => ({}); });
        await page.evaluate(() => document.getElementById('btnGuestGoogle').click());
        await wait(page, 2500);
        const g = seen.authorize[0] ? new URL(seen.authorize[0]) : null;
        check('auth-returns', 'Google: authorize call carries provider=google and the app.lyann.dom return URL', g && g.searchParams.get('provider') === 'google' && /app\.lyann\.dom:\/\/google-auth/.test(g.searchParams.get('redirect_to') || ''), seen.authorize);
        await appUrl(page, 'app.lyann.dom://google-auth?code=qa-fake-code');
        await wait(page, 1500);
        check('auth-returns', 'Google return: the app exchanges the PKCE code', seen.pkce.length === 1, seen.pkce);
        await page.evaluate(() => document.querySelectorAll('.lyann-dialog-overlay, .modal-overlay.active').forEach((e) => e.remove()));
        // Apple (iOS native plugin -> signInWithIdToken)
        await page.evaluate(() => document.querySelector('#nativeGuestWelcome .btn-apple-auth').click());
        await wait(page, 2500);
        check('auth-returns', 'Apple (iOS): identity token is sent to Supabase with provider=apple', seen.idToken.length === 1 && seen.idToken[0].provider === 'apple', seen.idToken);
        // expired / invalid confirmation link opened in the app
        await appUrl(page, 'https://staging.lyann.app/confirm-signup.html?token_hash=not-a-real-token&type=signup');
        await page.waitForFunction(() => /n’est plus valide/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        const expiredShown = await page.evaluate(() => /n’est plus valide/.test(document.body.innerText));
        check('auth-returns', 'expired / used confirmation link: explained, with a way to get a new one', expiredShown, null);
        await page.evaluate(() => document.querySelectorAll('.modal-overlay, .lyann-dialog-overlay').forEach((e) => e.classList.remove('active')));
        // confirmation link (valid) opened in the app -> real session -> Découvrir
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
        await page.evaluate(() => sessionStorage.removeItem('__qa_frames'));
        const magic = await mintToken('magiclink', QA.email);
        await appUrl(page, `https://staging.lyann.app/confirm-signup.html?token_hash=${magic}&type=magiclink`);
        const returned = await waitPath(page, /discover\.html/);
        check('auth-returns', 'valid link opened in the app: session opened, straight to Découvrir', returned, page.url());
        await wait(page, 3500);
        const nav = await navInfo(page);
        check('auth-returns', 'Découvrir after the link: five tabs', JSON.stringify(nav.tabs) === JSON.stringify(TABS) && nav.count === 1, nav);
        // recovery link
        await logout(page);
        await waitPath(page, /bienvenue\.html/);
        await ready(page);
        await page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
        const rec = await mintToken('recovery', QA.email);
        await appUrl(page, `app.lyann.dom://confirm-signup?action=reset_password&token_hash=${rec}&type=recovery`);
        await page.waitForSelector('#lyannPasswordRecoveryOverlay', { timeout: 20000 }).catch(() => {});
        await wait(page, 2500);
        const stay = await page.evaluate(() => ({ url: location.pathname.split('/').pop(), overlay: !!document.getElementById('lyannPasswordRecoveryOverlay') }));
        check('auth-returns', 'password recovery: password form stays open, no redirect underneath it', stay.url === 'bienvenue.html' && stay.overlay, stay);
        await page.click('#lyannRecoveryCancel');
        check('auth-returns', 'closing the password form continues to Découvrir (recovery session is a session)', await waitPath(page, /discover\.html/), page.url());
        await logout(page);
        await context.close();
    },

    // 6. E-mail sign-up keeps the confirmation, resend is rate limited. E-mails are mocked at the network.
    async 'email-signup'({ browser, origin }) {
        const { context, page } = await newPhone(browser);
        const calls = { signup: 0, resend: 0, continueSignup: 0 };
        await context.route('**/auth/v1/signup**', (route) => { calls.signup += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: '', email: 'qa-phase3a@lyann-test.invalid', identities: [{ id: 'x' }], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() }) }); });
        await context.route('**/auth/v1/resend**', (route) => { calls.resend += 1; route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
        await context.route('**/v1/auth/continue-signup**', (route) => { calls.continueSignup += 1; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
        await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await page.click('#btnNativeJoin');
        await wait(page, 400);
        await page.waitForSelector('#obFirstName', { state: 'visible', timeout: 10000 });
        await page.fill('#obFirstName', 'Qa');
        await page.fill('#obEmail', 'qa-phase3a@lyann-test.invalid');
        await page.fill('#obPassword', 'QaPhase3a-Pass1');
        await page.evaluate(() => { const c = document.getElementById('obAcceptCgu'); if (c) c.checked = true; });
        await page.click('#obNextBtn');
        await wait(page, 600);
        await page.click('#obNextBtn');
        await page.waitForSelector('#obEmailPending', { timeout: 15000 }).catch(() => {});
        const pending = await page.evaluate(() => {
            const el = document.getElementById('obEmailPending');
            return { shown: !!el, text: el ? el.innerText : '', resendDisabled: el ? el.querySelector('#obResendBtn').disabled : null };
        });
        check('email-signup', 'sign-up without session: "check your mailbox" state with the address', pending.shown && /qa-phase3a@lyann-test\.invalid/.test(pending.text), pending);
        check('email-signup', 'confirmation not bypassed: continue-signup (server auto-confirm) is never called in the app', calls.continueSignup === 0 && calls.signup === 1, calls);
        check('email-signup', 'resend is locked during the 60 s cooldown', pending.resendDisabled === true, pending);
        const stillGuest = await page.evaluate(() => window.LYANN_MOBILE_AUTH.getState());
        check('email-signup', 'member UI stays closed until the address is confirmed', stillGuest === 'GUEST' && /bienvenue/.test(page.url()), { stillGuest, url: page.url() });
        const r1 = await page.evaluate(() => LYANN_API_CLIENT.resendSignupConfirmation('a1@lyann-test.invalid'));
        const r2 = await page.evaluate(() => LYANN_API_CLIENT.resendSignupConfirmation('a1@lyann-test.invalid'));
        check('email-signup', 'resend: first accepted, immediate second refused (cooldown)', !r1.error && r2.error && r2.error.code === 'cooldown', { r1, r2 });
        let capped = null;
        for (let i = 2; i <= 7; i += 1) capped = await page.evaluate((n) => LYANN_API_CLIENT.resendSignupConfirmation(`a${n}@lyann-test.invalid`), i);
        check('email-signup', 'resend: hourly cap per device (changing the address does not bypass it)', capped.error && capped.error.code === 'too_many', capped);
        check('email-signup', 'resend: only the allowed requests reached Supabase', calls.resend === 6, calls);
        await context.close();
    },



    // 6a. Website: the old sign-up path (which called continue-signup and logged the member in) is gone.
    async 'email-signup-web'({ browser, origin }) {
        const { context, page } = await newPhone(browser, { web: true });
        const calls = { signup: 0, continueSignup: 0, token: 0 };
        await context.route('**/auth/v1/signup**', (route) => { calls.signup += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000003', aud: 'authenticated', email: 'qa-web@lyann-test.invalid', identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() }) }); });
        await context.route('**/v1/auth/continue-signup**', (route) => { calls.continueSignup += 1; route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
        await context.route('**/auth/v1/token?grant_type=password**', (route) => { calls.token += 1; route.continue(); });
        await page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await ready(page);
        await page.evaluate(() => window.openOnboarding());
        await page.fill('#obFirstName', 'Qa');
        await page.fill('#obEmail', 'qa-web@lyann-test.invalid');
        await page.fill('#obPassword', 'QaPhase3b-Pass1');
        await page.evaluate(() => { const c = document.getElementById('obAcceptCgu'); if (c) c.checked = true; });
        await page.click('#obNextBtn');
        await wait(page, 600);
        await page.click('#obNextBtn');
        await page.waitForSelector('#obEmailPending', { timeout: 15000 }).catch(() => {});
        await wait(page, 1500);
        const pending = await page.evaluate(() => ({ shown: !!document.getElementById('obEmailPending'), text: (document.getElementById('obEmailPending') || {}).innerText || '', session: null }));
        const session = await page.evaluate(async () => !!(await LYANN_API_CLIENT.supabase.auth.getSession()).data.session);
        check('email-signup-web', 'web sign-up: "check your mailbox", for an address that already has an account too (identities empty) - same screen', pending.shown && /qa-web@lyann-test\.invalid/.test(pending.text), pending);
        check('email-signup-web', 'web sign-up: continue-signup never called, no automatic password login, no session', calls.continueSignup === 0 && calls.token === 0 && !session && calls.signup === 1, { calls, session });
        await context.close();
    },

    // 6b. Real Staging HTTP: the official Supabase flow is the only way to confirm an address.
    async 'official-confirmation'({ browser, origin }) {
        const created = [];
        try {
            // -- redirect URLs used by the clients are accepted by the Staging allow-list (real GoTrue answer)
            const probe = await newPhone(browser);
            const sent = { recover: [], signup: [], resend: [] };
            await probe.context.route('**/auth/v1/recover**', (route) => { sent.recover.push(new URL(route.request().url()).searchParams.get('redirect_to')); route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
            await probe.context.route('**/auth/v1/signup**', (route) => { sent.signup.push(new URL(route.request().url()).searchParams.get('redirect_to')); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000002', aud: 'authenticated', email: 'x@lyann-test.invalid', identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() }) }); });
            await probe.context.route('**/auth/v1/resend**', (route) => { sent.resend.push(JSON.parse(route.request().postData() || '{}')); route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
            await probe.page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
            await ready(probe.page);
            await probe.page.evaluate(() => LYANN_API_CLIENT.resetPasswordForEmail('qa@lyann-test.invalid'));
            await probe.page.evaluate(() => LYANN_API_CLIENT.signUp('qa@lyann-test.invalid', 'Qa-Pass-12345', {}));
            await probe.page.evaluate(() => LYANN_API_CLIENT.resendSignupConfirmation('qa@lyann-test.invalid'));
            const urls = { recoveryNative: sent.recover[0], signupNative: sent.signup[0] };
            for (const [name, url] of Object.entries(urls)) {
                const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/verify?token=qa-invalid-token&type=signup&redirect_to=${encodeURIComponent(url)}`, { headers: { apikey: process.env.SUPABASE_ANON_KEY }, redirect: 'manual' });
                const loc = res.headers.get('location') || '';
                check('official-confirmation', `native ${name} return URL (${url}) is accepted by the Staging Auth allow-list`, loc.startsWith(url), { url, landsOn: loc.split('#')[0] });
            }
            await probe.context.close();

            // -- A. no proof, no confirmation (invalid token, web page)
            const a = await newUnconfirmedUser('https://staging.lyann.app/confirm-signup.html');
            created.push(a.id);
            const web = await newPhone(browser, { web: true });
            await web.page.goto(`${origin}/confirm-signup.html?token_hash=not-a-real-token&type=signup`, { waitUntil: 'domcontentloaded' });
            await web.page.waitForSelector('#btnConfirm', { timeout: 20000 });
            await web.page.click('#btnConfirm');
            await web.page.waitForFunction(() => /Lien expiré|déjà utilisé|n.est plus valide/i.test(document.body.innerText), null, { timeout: 20000 }).catch(() => {});
            const expiredUi = await web.page.evaluate(() => /Lien expiré|déjà utilisé/i.test(document.body.innerText));
            const stillUnconfirmed = await userState(a.id);
            check('official-confirmation', 'web: invalid link -> "expired" state, address stays unconfirmed', expiredUi && !stillUnconfirmed.confirmed, { expiredUi, stillUnconfirmed });
            const loginBefore = await anonClient().auth.signInWithPassword({ email: a.email, password: a.password });
            check('official-confirmation', 'unconfirmed account cannot sign in (email_not_confirmed)', loginBefore.error && /email_not_confirmed/.test(loginBefore.error.code || loginBefore.error.message), loginBefore.error && loginBefore.error.code);

            // -- B. web: valid official link (token_hash page) -> confirmed -> LYANN opens with the verified session
            await web.page.goto(`${origin}/confirm-signup.html?token_hash=${a.hashedToken}&type=signup`, { waitUntil: 'domcontentloaded' });
            await ready(web.page);
            await web.page.waitForSelector('#btnConfirm', { timeout: 20000 });
            await web.page.click('#btnConfirm');
            const webOpened = await waitPath(web.page, /discover\.html/, 30000);
            const confirmedNow = await userState(a.id);
            check('official-confirmation', 'web: valid link confirms the address and opens Découvrir with a session', webOpened && confirmedNow.confirmed, { url: web.page.url(), confirmedNow });
            await wait(web.page, 3000);
            const webSession = await web.page.evaluate(async () => !!(await LYANN_API_CLIENT.supabase.auth.getSession()).data.session);
            check('official-confirmation', 'web: the session is a real, verified one', webSession, null);
            await web.context.close();
            const loginAfter = await anonClient().auth.signInWithPassword({ email: a.email, password: a.password });
            check('official-confirmation', 'sign-in works after confirmation', !loginAfter.error, loginAfter.error && loginAfter.error.message);

            // -- C. mobile: official link, redirect to the app scheme, session in the fragment -> Découvrir, five tabs
            const m = await newUnconfirmedUser('app.lyann.dom://confirm-signup');
            created.push(m.id);
            const mobile = await newPhone(browser);
            await mobile.page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
            await ready(mobile.page);
            await mobile.page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
            const returnUrl = await followOfficialLink(m.actionLink);
            check('official-confirmation', 'official link answers with a redirect to the app scheme carrying a session', /^app\.lyann\.dom:\/\/confirm-signup#access_token=/.test(returnUrl), returnUrl.split('#')[0]);
            await appUrl(mobile.page, returnUrl);
            const inApp = await waitPath(mobile.page, /discover\.html/, 30000);
            await wait(mobile.page, 4000);
            const nav = await navInfo(mobile.page);
            const mState = await userState(m.id);
            check('official-confirmation', 'mobile: link confirms and opens Découvrir with five tabs', inApp && mState.confirmed && JSON.stringify(nav.tabs) === JSON.stringify(TABS) && nav.count === 1, { inApp, mState, nav });
            // reopen the app: a second page of the same context keeps the session
            const reopened = await mobile.context.newPage();
            await reopened.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
            await wait(reopened, 4500);
            check('official-confirmation', 'mobile: session kept after closing and reopening', /discover\.html/.test(reopened.url()), reopened.url());
            await reopened.close();
            // same link a second time: used -> explained, nothing changes
            await logout(mobile.page);
            await waitPath(mobile.page, /bienvenue\.html/);
            await ready(mobile.page);
            await mobile.page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
            const replay = await followOfficialLink(m.actionLink);
            check('official-confirmation', 'used link: Supabase answers with an error, no session', /error/.test(replay) && !/access_token/.test(replay), replay.split('#')[0] + '#' + (replay.split('#')[1] || '').slice(0, 80));
            await appUrl(mobile.page, replay);
            await mobile.page.waitForFunction(() => /n’est plus valide/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
            check('official-confirmation', 'used / expired link opened in the app: explained with a way to get a new one', await mobile.page.evaluate(() => /n’est plus valide/.test(document.body.innerText)), null);
            await mobile.context.close();

            // -- D. password recovery through the official flow, with the redirect the native client really uses
            const r = await newUnconfirmedUser('app.lyann.dom://confirm-signup');
            created.push(r.id);
            await admin.auth.admin.updateUserById(r.id, { email_confirm: true }); // QA fixture only (admin tooling), so that recovery can be tested
            const rec = await admin.auth.admin.generateLink({ type: 'recovery', email: r.email, options: { redirectTo: urls.recoveryNative } });
            const recReturn = await followOfficialLink(rec.data.properties.action_link);
            check('official-confirmation', 'recovery: official link answers with the app scheme and type=recovery', /^app\.lyann\.dom:\/\/confirm-signup#access_token=.*type=recovery/.test(recReturn), recReturn.split('#')[0]);
            const ph = await newPhone(browser);
            await ph.page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
            await ready(ph.page);
            await ph.page.waitForFunction(() => window.__appUrlHandlers.length > 0, null, { timeout: 15000 });
            await appUrl(ph.page, recReturn);
            await ph.page.waitForSelector('#lyannPasswordRecoveryOverlay', { timeout: 20000 }).catch(() => {});
            await wait(ph.page, 2000);
            const overlay = await ph.page.evaluate(() => ({ overlay: !!document.getElementById('lyannPasswordRecoveryOverlay'), url: location.pathname.split('/').pop() }));
            check('official-confirmation', 'recovery: the password form opens and stays on top of the welcome page', overlay.overlay && overlay.url === 'bienvenue.html', overlay);
            const newPassword = `New-${Math.random().toString(36).slice(2)}-Bb2`;
            await ph.page.fill('#lyannRecoveryPassword', newPassword);
            await ph.page.fill('#lyannRecoveryPasswordConfirm', newPassword);
            await ph.page.click('#lyannRecoverySubmit');
            const afterRecovery = await waitPath(ph.page, /discover\.html/, 30000);
            const relog = await anonClient().auth.signInWithPassword({ email: r.email, password: newPassword });
            check('official-confirmation', 'recovery: new password saved, Découvrir opens, sign-in works with it', afterRecovery && !relog.error, { afterRecovery, error: relog.error && relog.error.message });
            await ph.context.close();
        } finally {
            for (const id of created) await admin.auth.admin.deleteUser(id);
            check('official-confirmation', `QA users removed (${created.length})`, true, null);
        }
    },

    // 7. Website is not restricted; Android specifics.
    async 'web-and-android'({ browser, origin }) {
        const web = await newPhone(browser, { web: true });
        for (const url of ['discover.html', 'bienvenue.html', 'results.html?mode=annonces']) {
            await web.page.goto(`${origin}/${url}`, { waitUntil: 'domcontentloaded' });
            await wait(web.page, 3500);
            const s = await web.page.evaluate(() => ({ path: location.pathname.split('/').pop(), gated: window.LYANN_MOBILE_AUTH ? window.LYANN_MOBILE_AUTH.gated : null, checking: document.documentElement.classList.contains('lyann-gate-checking') }));
            check('web-and-android', `website (no Capacitor) ${url}: not gated, no redirect`, s.path === url.split('?')[0] && !s.gated && !s.checking, s);
        }
        await web.context.close();
        const android = await newPhone(browser, { platform: 'android' });
        await android.page.goto(`${origin}/discover.html`, { waitUntil: 'domcontentloaded' });
        await waitPath(android.page, /bienvenue\.html/);
        await wait(android.page, 1500);
        const apple = await android.page.evaluate(() => [...document.querySelectorAll('.btn-apple-auth')].map((b) => getComputedStyle(b).display));
        check('web-and-android', 'Android: guest also sent to the welcome flow, Apple button hidden', apple.length > 0 && apple.every((d) => d === 'none'), apple);
        await android.context.close();
    },

    // 8. A brand new account (nothing filled in) reaches the app immediately.
    async 'incomplete-profile'({ browser, origin }) {
        const email = `qa-phase3a-${Date.now()}@lyann-test.invalid`;
        const password = `Qa-${Math.random().toString(36).slice(2)}-Aa1`;
        const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
        check('incomplete-profile', 'Staging QA user created (confirmed, nothing else)', !!created.data?.user?.id, created.error);
        if (!created.data?.user?.id) return;
        try {
            const { context, page } = await newPhone(browser);
            await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded' });
            await ready(page);
            await page.evaluate((c) => { window.LYANN_API_CLIENT.login(c.email, c.password); }, { email, password });
            const ok = await waitPath(page, /discover\.html/);
            await wait(page, 5000);
            const nav = await navInfo(page);
            const blocking = await page.evaluate(() => ({
                modal: !!document.querySelector('.modal-overlay.active, #lyannPasswordRecoveryOverlay'),
                url: location.pathname.split('/').pop()
            }));
            check('incomplete-profile', 'empty profile: Découvrir opens with the five tabs, nothing blocks', ok && JSON.stringify(nav.tabs) === JSON.stringify(TABS) && nav.visible && !blocking.modal, { ok, nav, blocking });
            await context.close();
        } finally {
            const del = await admin.auth.admin.deleteUser(created.data.user.id);
            check('incomplete-profile', 'Staging QA user removed', !del.error, del.error && del.error.message);
        }
    }
};

(async () => {
    if (!QA.email || !QA.password) { console.error('QA credentials missing'); process.exit(2); }
    const server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await webkit.launch();
    const names = Object.keys(scenarios).filter((n) => !only.length || only.includes(n));
    for (const name of names) {
        console.log(`\n# ${name}`);
        try { await scenarios[name]({ browser, origin }); } catch (e) { check(name, 'scenario completed without exception', false, String(e.message).slice(0, 300)); }
    }
    await browser.close();
    server.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})();
