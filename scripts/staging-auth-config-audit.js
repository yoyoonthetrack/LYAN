#!/usr/bin/env node
/*
 * Phase 3.0B. Read-only audit of what Supabase Auth Staging exposes publicly. Sends no e-mail and touches no account.
 *
 *  - GET /auth/v1/settings: confirmation mode, sign-up, providers.
 *  - GET /auth/v1/verify with an invalid token and a candidate redirect_to: GoTrue answers with a redirect to
 *    redirect_to when the URL is in the allow-list, and to the Site URL otherwise, so the answer tells which return
 *    URLs are accepted and what the Site URL is.
 *
 * The e-mail template itself is not readable without the Management API; it is reported as such.
 * Staging only: force-staging-v2-env refuses any other Supabase project.
 */
require('./force-staging-v2-env');

const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_ANON_KEY;
const candidates = [
    'app.lyann.dom://confirm-signup',
    'app.lyann.dom://confirm-signup?action=reset_password',
    'app.lyann.dom://google-auth',
    'https://staging.lyann.app/confirm-signup.html',
    'https://staging.lyann.app/index.html?action=reset_password',
    'https://staging.lyann.app/auth/callback',
    'https://lyann.app/confirm-signup.html',
    'https://evil.example/confirm-signup.html'
];

(async () => {
    const out = { project: base.replace(/^https:\/\/|\.supabase\.co$/g, '') };
    const settings = await (await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key } })).json();
    out.settings = {
        mailer_autoconfirm: settings.mailer_autoconfirm,
        disable_signup: settings.disable_signup,
        phone_autoconfirm: settings.phone_autoconfirm,
        external: Object.fromEntries(Object.entries(settings.external || {}).filter(([, on]) => on))
    };
    out.redirects = {};
    for (const url of candidates) {
        const res = await fetch(`${base}/auth/v1/verify?token=qa-invalid-token&type=signup&redirect_to=${encodeURIComponent(url)}`, { headers: { apikey: key }, redirect: 'manual' });
        const location = res.headers.get('location') || '';
        out.redirects[url] = { status: res.status, landsOn: location.split(/[#?]/)[0] + (location.includes('?') && !location.startsWith('http') ? '?…' : ''), allowed: location.startsWith(url.split('?')[0]) };
    }
    const fallback = Object.values(out.redirects).find((r) => !r.allowed);
    out.siteUrlFallback = fallback ? fallback.landsOn : null;
    console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
