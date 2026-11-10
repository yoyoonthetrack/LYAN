#!/usr/bin/env node
/*
 * Phase 3.1A. Real capture of the back-office section « À la une (Découvrir) » against Staging (local API, read-only here:
 * nothing is created or modified; the form is only filled in to show the live preview).
 *   node scripts/capture-admin-highlights.js [--out=dir]
 */
require('./force-staging-v2-env');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { webkit } = require('playwright');
const { resolveAdminAndJwt } = require('./admin-staging-real-session-lib');

const root = path.join(__dirname, '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const outDir = path.resolve(outArg ? outArg.split('=')[1] : path.join(root, 'artifacts', 'phase-3-1a', 'back-office'));
fs.mkdirSync(outDir, { recursive: true });

function startServer() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-r', './scripts/force-staging-v2-env.js', '-r', './scripts/disable-local-workers.js', 'api/server.js'], {
            cwd: root, env: { ...process.env, LYANN_DOTENV_PATH: path.join(root, '.env.staging-v2') }, stdio: ['ignore', 'pipe', 'pipe']
        });
        let done = false;
        const onData = (buf) => {
            const m = /écoute sur http:\/\/[^:]+:(\d+)/.exec(String(buf));
            if (m && !done) { done = true; setTimeout(() => resolve({ child, base: `http://127.0.0.1:${m[1]}` }), 300); }
        };
        child.stdout.on('data', onData); child.stderr.on('data', onData);
        child.on('exit', (code) => { if (!done) reject(new Error(`API arrêtée (${code})`)); });
        setTimeout(() => { if (!done) { child.kill(); reject(new Error('API locale injoignable')); } }, 40000);
    });
}

(async () => {
    const { jwt, refresh } = await resolveAdminAndJwt();
    const { child, base } = await startServer();
    const browser = await webkit.launch();
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        await page.goto(`${base}/admin.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.supabase);
        await page.evaluate(async ({ a, r }) => {
            await window.LYANN_API_CLIENT.supabase.auth.setSession({ access_token: a, refresh_token: r });
            await window.runAdminAuthCheck('STAGING_UI');
        }, { a: jwt, r: refresh });
        await page.waitForTimeout(1500);
        const auth = await page.evaluate(() => window.AUTH_STATE);
        if (auth !== 'AUTHORIZED') throw new Error(`Auth admin: ${auth}`);
        // The signed-in account is the Staging owner: its address is masked in every capture.
        const mask = () => page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = n.nodeValue.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, 'owner@staging');
        });
        const shot = async (name) => {
            await mask();
            await page.evaluate(() => document.getElementById('sec-highlights').scrollIntoView({ block: 'start' }));
            await page.waitForTimeout(300);
            await page.screenshot({ path: path.join(outDir, name) });
        };
        await page.evaluate(() => document.querySelector('.admin-nav-item[data-section="sec-highlights"]')?.click());
        await page.waitForSelector('#hlList .hl-row, #hlList .hl-empty, #hlList *', { timeout: 15000 });
        await page.waitForTimeout(1200);
        await shot('admin-liste.png');

        await page.locator('#hlNew').click();
        await page.fill('#hlTitle', 'Exemple de brouillon');
        await page.fill('#hlTeaser', 'Aperçu de la carte avant publication');
        await page.fill('#hlLabel', 'Aperçu');
        await page.selectOption('#hlTarget', 'lyanneurs');
        await page.waitForTimeout(400);
        await shot('admin-formulaire-apercu.png');

        // A markup attempt is refused by the server (nothing is written).
        await page.fill('#hlTitle', '<b>Titre</b>');
        await page.locator('#hlSave').click();
        await page.waitForTimeout(1200);
        const notice = await page.locator('#hlNotice').textContent();
        await shot('admin-refus-html.png');
        fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify({ auth, refusalNotice: notice, pageErrors: errors }, null, 2));
        console.log(JSON.stringify({ auth, refusalNotice: notice, pageErrors: errors }));
    } finally {
        await browser.close();
        child.kill('SIGTERM');
    }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
