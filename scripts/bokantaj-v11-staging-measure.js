'use strict';

require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('playwright');
const { STAGING_REF } = require('./admin-staging-real-session-lib');

const API = process.env.LYANN_OPS_API || 'http://127.0.0.1:8098';
const MARKER = `QA-BOK-V11-${Date.now()}`;

(async () => {
    const url = process.env.SUPABASE_URL || '';
    if (!url.includes(STAGING_REF)) throw new Error('Staging only.');
    const identity = await fetch(`${API}/v1/runtime/identity`).then((res) => res.json());
    if (identity.supabase_ref !== STAGING_REF || identity.production) throw new Error('API not staging.');
    const timings = { identity: identity.isolation, marker: MARKER };

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err.message || err)));
    await page.goto(`${API}/feed`, { waitUntil: 'domcontentloaded' });

    const mapStart = Date.now();
    await page.locator('#bokantajViewMap').click();
    await page.waitForFunction(() => document.getElementById('bokantajMapCanvas')?.dataset.basemap === 'ready' || document.getElementById('bokantajMapCanvas')?.dataset.basemap === 'error', { timeout: 20000 });
    timings.map_open_ms = Date.now() - mapStart;
    timings.map_basemap = await page.locator('#bokantajMapCanvas').getAttribute('data-basemap');
    await page.screenshot({ path: 'artifacts/e1-e5-validation/bokantaj-v11-map-guest-desktop.png', animations: 'disabled' });

    await page.locator('#bokantajMapTerritory').selectOption('martinique');
    const territoryStart = Date.now();
    await page.waitForFunction(() => /partage|Impossible|Aucun/i.test(document.getElementById('bokantajMapStatus')?.textContent || ''), { timeout: 15000 });
    timings.territory_change_ms = Date.now() - territoryStart;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#bokantajViewFeed').click();
    await page.locator('#bokantajViewMap').click();
    await page.waitForFunction(() => document.getElementById('bokantajMapCanvas')?.dataset.basemap === 'ready' || document.getElementById('bokantajMapCanvas')?.dataset.basemap === 'error', { timeout: 20000 });
    await page.screenshot({ path: 'artifacts/e1-e5-validation/bokantaj-v11-map-guest-mobile.png', animations: 'disabled' });

    const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const signed = await anon.auth.signInWithPassword({
        email: process.env.LYANN_E2E_QA_A_EMAIL,
        password: process.env.LYANN_E2E_QA_A_PASSWORD
    });
    if (signed.error) throw new Error(signed.error.message);
    const session = signed.data.session;
    await page.evaluate(async (sess) => {
        const client = window.LYANN_API_CLIENT?.supabase;
        if (!client) throw new Error('no supabase');
        await client.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token });
        document.body.classList.add('user-is-logged-in');
        window.LYANN_CURRENT_USER = { id: sess.user.id };
    }, { access_token: session.access_token, refresh_token: session.refresh_token, user: { id: session.user.id } });

    await page.locator('#bokantajViewFeed').click();
    await page.locator('#bokantajComposerOpen').click();
    await page.locator('#flashContentInput').fill(`${MARKER} publication texte`);
    const publishStart = Date.now();
    let firstPaint = null;
    const paintWait = page.waitForFunction((marker) => {
        const card = [...document.querySelectorAll('.flash-card')].find((node) => (node.innerText || '').includes(marker));
        return card ? card.id : '';
    }, MARKER, { timeout: 20000 }).then((handle) => {
        firstPaint = Date.now();
        return handle.jsonValue();
    });
    await page.locator('#bokantajPublish').click();
    const postId = await paintWait;
    timings.publish_click_to_card_ms = firstPaint - publishStart;
    timings.publish_click_to_feedback_ms = await page.evaluate(() => 0);
    const toastVisible = await page.locator('.lyann-toast, [class*="toast"], .notification').first().isVisible().catch(() => false);
    timings.toast_seen = toastVisible;
    timings.post_id = postId;
    await page.screenshot({ path: 'artifacts/e1-e5-validation/bokantaj-v11-author-pending.png', animations: 'disabled' });

    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const row = await admin.from('bokantaj_posts').select('id, public_moderation_status').eq('id', postId).maybeSingle();
    timings.db_status = row.data && row.data.public_moderation_status;
    timings.page_errors = errors.slice(0, 8);
    console.log(JSON.stringify(timings, null, 2));
    await browser.close();
})().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
