#!/usr/bin/env node
/*
 * Phase 3.2A — vérification navigateur réelle (Playwright) des trois correctifs, contre Staging (tdktfbtqceldlaeqjtow uniquement).
 * Le bundle est le dossier www (build précédent) avec, par-dessus, les fichiers JS de l'arbre de travail
 * (--baseline = bundle www inchangé, pour reproduire les bugs sur l'ancien code). Compte QA_A (jamais affiché).
 *
 *   node scripts/v32a-browser-staging.js [--only=fav,map,portfolio] [--engine=chromium|webkit] [--baseline]
 *        [--width=390 --height=844] [--out=artifacts/phase-3-2a/<dir>]
 *
 * Données QA : un favori PROFILE (QA_A -> QA_B), une réalisation « QA 3.2A » avec sa photo. Tout est supprimé en fin d'exécution.
 */
require('./force-staging-v2-env');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium, webkit, devices } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { mustStaging } = require('./admin-staging-real-session-lib');

const root = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (name, def) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.split('=')[1] : def; };
const baseline = argv.includes('--baseline');
const engine = opt('engine', 'chromium');
const W = Number(opt('width', 390));
const H = Number(opt('height', 844));
const only = opt('only', 'fav,map,portfolio').split(',');
const outDir = path.resolve(opt('out', path.join(root, 'artifacts', 'phase-3-2a', `${baseline ? 'baseline' : 'fixed'}-${engine}`)));
const OVERLAY = ['api-client.js', 'script.js', 'explorer-ui.js', 'needs-map-category-families.js', 'needs-map.js'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
const QA = { email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD };
const BIG = process.env.V32A_BIG || '/tmp/v32a/big.jpg';
const SMALL = process.env.V32A_SMALL || '/tmp/v32a/small.jpg';

const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ->  ' + JSON.stringify(detail)}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeBundle() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyann-v32a-'));
    fs.cpSync(path.join(root, 'www'), dir, { recursive: true });
    if (!baseline) for (const f of OVERLAY) fs.copyFileSync(path.join(root, f), path.join(dir, f));
    return dir;
}

function serve(bundle) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://x');
            let file = path.join(bundle, decodeURIComponent(url.pathname));
            if (!file.startsWith(bundle)) { res.writeHead(403); return res.end(); }
            if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
            if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

async function login(page, origin) {
    await page.goto(`${origin}/bienvenue.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.LYANN_API_CLIENT && window.LYANN_API_CLIENT.login, null, { timeout: 30000 });
    await page.evaluate(async (c) => {
        const p = window.LYANN_API_CLIENT.login(c.email, c.password);
        await Promise.race([p, new Promise((r) => setTimeout(r, 6000))]);
    }, QA).catch(() => {});
    await page.waitForTimeout(3500);
}

async function gotoReady(page, origin, url, ready) {
    await page.goto(`${origin}/${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (ready) await page.waitForFunction(ready, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
}
const explorerReady = () => document.querySelector('#explorerResults') && document.querySelector('#explorerResults').getAttribute('aria-busy') !== 'true';

/* ---------- Bug 1 : favoris Lyanneur ---------- */
async function testFavorites(page, origin, svc, ids) {
    console.log('\n== Bug 1 — Favoris Lyanneurs ==');
    await gotoReady(page, origin, 'results.html?mode=lyanneurs', explorerReady);
    // Premier Lyanneur réellement affiché (autre que QA_A) : la preuve porte sur une vraie carte de la liste.
    const target = await page.evaluate((me) => {
        const el = [...document.querySelectorAll('.lyann-favorite-btn[data-favorite-type="PROFILE"]')].find((b) => b.dataset.favoriteId && b.dataset.favoriteId !== me && !b.classList.contains('is-favorite'));
        return el ? el.dataset.favoriteId : null;
    }, ids.a);
    if (target) { ids.b = target; ids.favTarget = target; }
    const btn = page.locator(`.lyann-favorite-btn[data-favorite-type="PROFILE"][data-favorite-id="${ids.b}"]`).first();
    const present = await btn.count();
    check('une carte Lyanneur réelle est affichée avec son cœur', present > 0, { present });
    if (!present) return;
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(2500);
    const row = await svc.from('user_favorites').select('id').eq('user_id', ids.a).eq('entity_type', 'PROFILE').eq('entity_id', ids.b);
    check('le favori est enregistré en base pour QA_A', (row.data || []).length === 1, row.error || row.data);
    check('le cœur passe à « enregistré »', (await btn.getAttribute('class')).includes('is-favorite'));
    await page.screenshot({ path: path.join(outDir, 'fav-1-coeur.png') });

    const openFavorites = async () => {
        await page.evaluate(() => window.openAccountModalSubView('favorites'));
        await page.waitForSelector('#favSubViewContainer', { timeout: 15000 });
        await page.waitForFunction(() => !/Chargement de vos favoris/.test(document.querySelector('#favSubViewContainer')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(800);
    };
    await openFavorites();
    const listed = async () => page.evaluate((id) => !!document.querySelector(`#favSubViewContainer .fav-item-card[data-fav-entity-type="PROFILE"][data-fav-entity-id="${id}"]`), ids.b);
    check('« Mes favoris » affiche le Lyanneur ajouté', await listed(), await page.locator('#favSubViewContainer').innerText().catch(() => ''));
    await page.screenshot({ path: path.join(outDir, 'fav-2-liste.png') });
    const countText = await page.locator('#favCountBadge').innerText().catch(() => '');
    check('le compteur n\'est pas à zéro', countText && countText !== '(0)', countText);

    // Rechargement complet + nouvelle navigation
    await gotoReady(page, origin, 'results.html?mode=lyanneurs', explorerReady);
    await page.waitForTimeout(2000);
    const btn2 = page.locator(`.lyann-favorite-btn[data-favorite-type="PROFILE"][data-favorite-id="${ids.b}"]`).first();
    if (await btn2.count()) check('après rechargement, le cœur reste « enregistré »', (await btn2.getAttribute('class')).includes('is-favorite'));
    await openFavorites();
    check('après rechargement, « Mes favoris » affiche toujours le Lyanneur', await listed());

    // Reconnexion : déconnexion complète puis nouvelle connexion
    await page.evaluate(async () => { await window.LYANN_API_CLIENT.supabase.auth.signOut(); localStorage.clear(); sessionStorage.clear(); });
    await login(page, origin);
    await gotoReady(page, origin, 'results.html?mode=lyanneurs', explorerReady);
    await openFavorites();
    check('après reconnexion, « Mes favoris » affiche toujours le Lyanneur', await listed());

    // Retrait depuis la liste
    const removeBtn = page.locator(`#favSubViewContainer .fav-item-card[data-fav-entity-id="${ids.b}"] .lyann-favorite-btn`).first();
    if (await removeBtn.count()) {
        await removeBtn.click();
        await page.waitForTimeout(2500);
        const after = await svc.from('user_favorites').select('id').eq('user_id', ids.a).eq('entity_id', ids.b);
        check('le retrait depuis la liste supprime le favori en base', (after.data || []).length === 0, after.data);
        check('la liste ne contient plus le Lyanneur', !(await listed()));
    } else {
        check('bouton de retrait présent dans la liste', false);
    }
}

/* ---------- Bug 2 : filtres de catégories de la carte ---------- */
async function testMapCategories(page, origin) {
    console.log('\n== Bug 2 — Filtres de catégories (carte Annonces) ==');
    await gotoReady(page, origin, 'results.html?mode=annonces&view=map', explorerReady);
    await page.waitForTimeout(2500);
    const btn = page.locator('[data-needs-map-categories]').first();
    const hasBtn = await btn.count();
    check('le bouton « Catégories » de la carte est présent', hasBtn > 0);
    if (!hasBtn) { await page.screenshot({ path: path.join(outDir, 'map-0-absent.png') }); return; }
    const chips = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#explorerMapCategoryGrid [data-family]')].map((b) => [b.dataset.family, b.getAttribute('aria-pressed') === 'true'])));
    const pressedIds = async () => Object.entries(await chips()).filter(([id, on]) => on && id !== '__all__').map(([id]) => id).sort();
    const open = async () => { await btn.click(); await page.waitForSelector('#explorerMapCategorySheet[open]', { timeout: 8000 }); await page.waitForTimeout(300); };
    const clickChip = async (id) => { await page.locator(`#explorerMapCategoryGrid [data-family="${id}"]`).click(); await page.waitForTimeout(120); };

    await open();
    let state = await chips();
    check('ouverture : seule « Toutes » est active', state.__all__ === true && (await pressedIds()).length === 0, state);
    await page.screenshot({ path: path.join(outDir, 'map-1-ouverture.png') });

    await clickChip('plomberie');
    state = await chips();
    check('un clic sur « Plomberie » sélectionne uniquement « Plomberie »', JSON.stringify(await pressedIds()) === JSON.stringify(['plomberie']) && state.__all__ === false, state);
    await page.screenshot({ path: path.join(outDir, 'map-2-plomberie.png') });

    await clickChip('menage');
    check('un second clic ajoute uniquement « Ménage »', JSON.stringify(await pressedIds()) === JSON.stringify(['menage', 'plomberie']), await chips());
    await clickChip('plomberie');
    check('retirer « Plomberie » ne touche pas « Ménage »', JSON.stringify(await pressedIds()) === JSON.stringify(['menage']), await chips());
    await clickChip('menage');
    state = await chips();
    check('retirer la dernière famille revient à « Toutes »', state.__all__ === true && (await pressedIds()).length === 0, state);

    // Clics rapides : séquence déterministe comparée à un modèle indépendant
    const order = ['plomberie', 'electricite', 'bricolage', 'jardinage', 'menage', 'beaute', 'numerique', 'quotidien'];
    const model = new Set();
    for (let i = 0; i < 24; i += 1) {
        const id = order[(i * 5) % order.length];
        await page.locator(`#explorerMapCategoryGrid [data-family="${id}"]`).click({ delay: 0 });
        if (model.has(id)) model.delete(id); else model.add(id);
    }
    await page.waitForTimeout(300);
    check('24 clics rapides : état identique au modèle attendu', JSON.stringify(await pressedIds()) === JSON.stringify([...model].sort()), { got: await pressedIds(), want: [...model].sort() });

    // Application, badge, réouverture, Liste/Carte
    await page.locator('#explorerMapCategoryClear').click();
    await page.waitForTimeout(200);
    check('« Effacer » remet « Toutes » sans sélection résiduelle', (await chips()).__all__ === true && (await pressedIds()).length === 0, await chips());
    await clickChip('plomberie'); await clickChip('menage');
    await page.locator('#explorerMapCategoryApply').click();
    await page.waitForTimeout(800);
    const badge = await page.locator('.needs-map-categories-badge').first().innerText().catch(() => '');
    check('après « Appliquer », le badge indique 2 familles', badge.trim() === '2', badge);
    await page.screenshot({ path: path.join(outDir, 'map-3-appliquee.png') });
    await open();
    check('la réouverture restitue exactement la sélection appliquée', JSON.stringify(await pressedIds()) === JSON.stringify(['menage', 'plomberie']), await chips());
    await clickChip('beaute');
    await page.locator('#explorerMapCategoryClose').click();
    await page.waitForTimeout(400);
    await open();
    check('fermer sans appliquer abandonne le brouillon', JSON.stringify(await pressedIds()) === JSON.stringify(['menage', 'plomberie']), await chips());
    await page.locator('#explorerMapCategoryClose').click();
    await page.waitForTimeout(300);
    await page.locator('#explorerViewToggle [data-view="list"]').click().catch(() => {});
    await page.waitForTimeout(700);
    await page.locator('#explorerViewToggle [data-view="map"]').click().catch(() => {});
    await page.waitForTimeout(1500);
    await open();
    check('après Liste puis Carte, la sélection est conservée à l\'identique', JSON.stringify(await pressedIds()) === JSON.stringify(['menage', 'plomberie']), await chips());
    await clickChip('__all__');
    check('« Toutes » ne coche jamais d\'autres familles', (await pressedIds()).length === 0 && (await chips()).__all__ === true, await chips());
    await page.locator('#explorerMapCategoryApply').click();
    await page.waitForTimeout(600);
    const badge2 = await page.locator('.needs-map-categories-badge').first().evaluate((el) => el.hidden).catch(() => true);
    check('« Toutes » appliqué : plus de filtre actif', badge2 === true);
}

/* ---------- Bug 3 : photo de réalisation ---------- */
async function testPortfolio(page, origin, svc, ids, file, label, expectPrepared) {
    console.log(`\n== Bug 3 — Photo de réalisation (${label}) ==`);
    await gotoReady(page, origin, 'results.html?mode=lyanneurs', explorerReady);
    await page.evaluate((uid) => window.openPublicMemberProfile(uid), ids.a);
    await page.waitForSelector('#publicMemberProfileModal.active, #publicMemberProfileModal', { timeout: 15000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.lyannOpenAddPortfolioModal());
    await page.waitForSelector('#lyannPortFileInput', { timeout: 8000 });
    const title = `QA 3.2A ${label}`;
    await page.fill('#lyannPortTitle', title);
    await page.setInputFiles('#lyannPortFileInput', file);
    const sizeIn = fs.statSync(file).size;
    const t0 = Date.now();
    await page.click('#lyannAddPortfolioForm button[type="submit"]');
    await page.waitForTimeout(6000);
    const item = await svc.from('user_portfolio_items').select('id, image_url').eq('user_id', ids.a).eq('title', title).maybeSingle();
    check(`${label}: la réalisation est enregistrée`, !!item.data, item.error);
    if (!item.data) { await page.screenshot({ path: path.join(outDir, `portfolio-${label}-0.png`) }); return null; }
    const objectPath = decodeURIComponent(item.data.image_url.split('/portfolio-images-hold/')[1]);
    const stored = await svc.storage.from('portfolio-images-hold').download(objectPath);
    const storedSize = stored.data ? (await stored.data.arrayBuffer()).byteLength : -1;
    console.log(`INFO  ${label}: fichier choisi ${(sizeIn / 1048576).toFixed(2)} Mio -> fichier déposé ${(storedSize / 1048576).toFixed(2)} Mio`);
    check(`${label}: le fichier déposé est lisible par la vérification (< 5 Mio)`, storedSize > 0 && storedSize < 5 * 1024 * 1024, { storedSize });
    if (expectPrepared) check(`${label}: la photo a été réduite avant dépôt`, storedSize < sizeIn, { sizeIn, storedSize });
    const card = page.locator(`.lyann-portfolio-card[data-portfolio-item="${item.data.id}"]`);
    check(`${label}: la carte affiche un statut explicite pendant la vérification ou déjà publiée`, (await card.count()) > 0, await page.locator('#publicMemberProfileModal').innerText().then((t) => t.slice(0, 300)).catch(() => ''));
    await page.screenshot({ path: path.join(outDir, `portfolio-${label}-1-envoi.png`) });
    // Attente de la transition réelle (moderation_jobs puis interface)
    let job = null;
    for (let i = 0; i < 24; i += 1) {
        const j = await svc.from('moderation_jobs').select('status, reason_code, attempts').eq('subject_type', 'portfolio').eq('subject_id', item.data.id).maybeSingle();
        job = j.data;
        if (job && ['done', 'held'].includes(job.status)) break;
        await sleep(5000);
    }
    check(`${label}: la modération réelle aboutit à « approved »`, job && job.status === 'done' && job.reason_code === 'approved', job);
    await page.waitForFunction((id) => {
        const c = document.querySelector(`.lyann-portfolio-card[data-portfolio-item="${id}"]`);
        return c && c.dataset.portfolioState === 'approved';
    }, item.data.id, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction((id) => {
        const img = document.querySelector(`.lyann-portfolio-card[data-portfolio-item="${id}"] img`);
        return img && img.complete && img.naturalWidth > 0 && img.naturalWidth !== 1200;
    }, item.data.id, { timeout: 30000 }).catch(() => {});
    const manual = await page.evaluate(async (id) => {
        const c = document.querySelector(`.lyann-portfolio-card[data-portfolio-item="${id}"]`);
        if (!c) return null;
        return window.lyannProbePortfolioMedia(c.dataset.portfolioSrc);
    }, item.data.id);
    console.log('INFO  sonde manuelle après approbation:', manual);
    const ui = await page.evaluate((id) => {
        const c = document.querySelector(`.lyann-portfolio-card[data-portfolio-item="${id}"]`);
        if (!c) return null;
        const img = c.querySelector('img');
        const badge = c.querySelector('[data-portfolio-status]');
        return { state: c.dataset.portfolioState || null, badgeHidden: badge ? badge.hidden : null, badgeText: badge ? badge.textContent : null, naturalWidth: img ? img.naturalWidth : 0, complete: img ? img.complete : false };
    }, item.data.id);
    console.log('INFO  interface:', JSON.stringify(ui), `(${Math.round((Date.now() - t0) / 1000)} s depuis l'envoi)`);
    check(`${label}: l'interface quitte « en cours de vérification » sans rechargement`, ui && ui.state === 'approved' && ui.badgeHidden === true, ui);
    check(`${label}: la vraie photo est affichée (plus le texte d'attente)`, ui && ui.naturalWidth > 0 && ui.naturalWidth !== 1200, ui);
    await page.screenshot({ path: path.join(outDir, `portfolio-${label}-2-publiee.png`) });
    return item.data;
}


/* ---------- Bug 3 : cas limites (sans écriture en base) ---------- */
async function testPortfolioEdges(page, origin, svc, ids) {
    console.log('\n== Bug 3 — Cas limites ==');
    const { PLACEHOLDER_PENDING, PLACEHOLDER_REJECTED } = require('../api/content-moderation');
    await gotoReady(page, origin, 'results.html?mode=lyanneurs', explorerReady);
    await page.evaluate((uid) => window.openPublicMemberProfile(uid), ids.a);
    await page.waitForTimeout(3000);
    // 1. HEIC : refusé avec un message explicite, rien n'est envoyé
    const before = await svc.from('user_portfolio_items').select('id', { count: 'exact', head: true }).eq('user_id', ids.a);
    await page.evaluate(() => window.lyannOpenAddPortfolioModal());
    await page.waitForSelector('#lyannPortFileInput');
    await page.fill('#lyannPortTitle', 'QA 3.2A heic');
    await page.setInputFiles('#lyannPortFileInput', { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.from('not-a-real-heic') });
    await page.click('#lyannAddPortfolioForm button[type="submit"]');
    await page.waitForTimeout(1500);
    const toastText = await page.evaluate(() => document.body.innerText);
    check('HEIC : message explicite affiché', /HEIC/.test(toastText), toastText.slice(0, 120));
    check('HEIC : la fenêtre d\'ajout reste ouverte pour choisir une autre photo', await page.evaluate(() => document.getElementById('lyannAddPortfolioModal').classList.contains('active')));
    const afterHeic = await svc.from('user_portfolio_items').select('id', { count: 'exact', head: true }).eq('user_id', ids.a);
    check('HEIC : aucune réalisation créée', before.count === afterHeic.count, { before: before.count, after: afterHeic.count });
    // 2. Fichier non image
    await page.setInputFiles('#lyannPortFileInput', { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.click('#lyannAddPortfolioForm button[type="submit"]');
    await page.waitForTimeout(1200);
    const afterPdf = await svc.from('user_portfolio_items').select('id', { count: 'exact', head: true }).eq('user_id', ids.a);
    check('fichier non image : refusé, aucune réalisation créée', before.count === afterPdf.count, afterPdf.count);
    await page.evaluate(() => document.getElementById('lyannAddPortfolioModal').classList.remove('active'));
    // 3. Classification de la sonde sur les vraies réponses de la passerelle (SVG réels du serveur)
    const probes = await page.evaluate(async ({ pending, rejected }) => {
        const real = window.fetch;
        const answer = (status, type, body) => () => Promise.resolve(new Response(body, { status, headers: { 'content-type': type } }));
        const out = {};
        window.fetch = answer(200, 'image/svg+xml; charset=utf-8', pending); out.pending = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = answer(200, 'image/svg+xml; charset=utf-8', rejected); out.rejected = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = answer(200, 'image/jpeg', 'binary'); out.approved = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = answer(404, 'text/plain', ''); out.missing = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = answer(503, 'text/plain', ''); out.error = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = () => Promise.reject(new TypeError('network')); out.network = await window.lyannProbePortfolioMedia('https://x/y.jpg');
        window.fetch = real;
        return out;
    }, { pending: PLACEHOLDER_PENDING, rejected: PLACEHOLDER_REJECTED });
    check('sonde : attente / refus / publiée / introuvable / erreurs classés correctement',
        probes.pending === 'pending' && probes.rejected === 'rejected' && probes.approved === 'approved' && probes.missing === 'missing' && probes.error === 'error' && probes.network === 'error', probes);
    // 4. États de la carte : refus explicite, puis vérification anormalement longue
    const states = await page.evaluate(async () => {
        document.getElementById('publicMemberProfileModal')?.classList.remove('active');
        const host = document.createElement('div');
        host.id = '__qa_host';
        host.style.cssText = 'position:fixed;left:12px;right:12px;top:80px;z-index:99999;display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#fff;padding:10px;border-radius:12px';
        host.innerHTML = '<div class="lyann-portfolio-card" style="position:relative;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;min-height:150px" data-portfolio-item="qa-1" data-portfolio-src="https://x/rejected.jpg"><img class="lyann-portfolio-img" alt=""><div data-portfolio-status role="status" style="position:absolute;left:6px;bottom:6px;right:6px;font-size:0.72rem;font-weight:700;padding:4px 8px;border-radius:8px;border:1px solid #ccc">Vérification en cours…</div></div>'
            + '<div class="lyann-portfolio-card" style="position:relative;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;min-height:150px" data-portfolio-item="qa-2" data-portfolio-src="https://x/slow.jpg"><img class="lyann-portfolio-img" alt=""><div data-portfolio-status role="status">Vérification en cours…</div></div>';
        document.body.appendChild(host);
        const realProbe = window.lyannProbePortfolioMedia;
        const realNow = Date.now;
        window.lyannProbePortfolioMedia = async (u) => (u.includes('rejected') ? 'rejected' : 'pending');
        window.lyannWatchPortfolioItems();
        await new Promise((r) => setTimeout(r, 400));
        const rejectedText = host.querySelector('[data-portfolio-item="qa-1"] [data-portfolio-status]').textContent;
        const rejectedState = host.querySelector('[data-portfolio-item="qa-1"]').dataset.portfolioState;
        // Simule 6 minutes écoulées pour la carte « lente » puis laisse tourner le prochain contrôle
        const slowCard = host.querySelector('[data-portfolio-item="qa-2"]');
        const firstText = slowCard.querySelector('[data-portfolio-status]').textContent;
        Date.now = () => realNow() + 6 * 60 * 1000;
        await new Promise((r) => setTimeout(r, 4600));
        const slowText = slowCard.querySelector('[data-portfolio-status]').textContent;
        Date.now = realNow;
        window.lyannProbePortfolioMedia = realProbe;
        return { rejectedText, rejectedState, firstText, slowText };
    });
    await page.locator('#__qa_host').screenshot({ path: path.join(outDir, 'portfolio-etats-refus-et-lenteur.png') });
    await page.evaluate(() => document.getElementById('__qa_host')?.remove());
    check('refus de modération : état explicite avec consigne', states.rejectedState === 'rejected' && /non publiée/.test(states.rejectedText), states);
    check('vérification trop longue : message explicite avec reprise possible', /plus longue que prévu/.test(states.slowText) && /réessayer/.test(states.slowText), states);
}

(async () => {
    mustStaging();
    fs.mkdirSync(outDir, { recursive: true });
    const url = process.env.SUPABASE_URL;
    const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const sa = await anon.auth.signInWithPassword({ email: QA.email, password: QA.password });
    const idA = sa.data.user.id;
    const lb = await anon.auth.signInWithPassword({ email: process.env.LYANN_E2E_QA_B_EMAIL, password: process.env.LYANN_E2E_QA_B_PASSWORD });
    const idB = lb.data.user.id;
    const pb = await svc.from('profiles').select('first_name, last_name').eq('id', idB).maybeSingle();
    const ids = { a: idA, b: idB, bName: (pb.data && pb.data.first_name) || '' };
    const bundle = makeBundle();
    const server = await serve(bundle);
    const origin = `http://127.0.0.1:${server.address().port}`;
    console.log(`bundle: ${baseline ? 'BASELINE (ancien code)' : 'CORRIGÉ (arbre de travail)'} · moteur ${engine} · ${W}x${H}`);
    const launcher = engine === 'webkit' ? webkit : chromium;
    const browser = await launcher.launch();
    const context = await browser.newContext(engine === 'webkit'
        ? { userAgent: devices['iPhone 15'].userAgent, viewport: { width: W, height: H }, deviceScaleFactor: 2 }
        : { ...devices['Pixel 7'], viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    await context.addInitScript((platform) => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform, Plugins: { App: { addListener: () => Promise.resolve({ remove() {} }) } } };
        try { sessionStorage.setItem('lyann_boot_splash_seen', '1'); } catch (_) {}
    }, engine === 'webkit' ? 'ios' : 'android');
    // L'origine locale du test n'est pas dans la liste CORS du serveur (les origines natives et staging.lyann.app le sont) :
    // on ajoute l'en-tête CORS à la réponse RÉELLE de la passerelle média, sans toucher au contenu.
    await context.route('https://staging.lyann.app/v1/media/**', async (route) => {
        const headers = { ...route.request().headers() };
        delete headers.origin; delete headers.referer;
        const response = await route.fetch({ headers });
        await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
    const createdItems = [];
    try {
        await login(page, origin);
        const who = await page.evaluate(async () => { const s = await window.LYANN_API_CLIENT.supabase.auth.getSession(); return s && s.data && s.data.session && s.data.session.user && s.data.session.user.id; });
        check('session QA_A active dans le navigateur', who === idA, who);
        if (only.includes('fav')) await testFavorites(page, origin, svc, ids);
        if (only.includes('map')) await testMapCategories(page, origin);
        if (only.includes('portfolio')) {
            const small = await testPortfolio(page, origin, svc, ids, SMALL, 'petite', false);
            if (small) createdItems.push(small);
            await testPortfolioEdges(page, origin, svc, ids);
            if (fs.existsSync(BIG)) {
                const big = await testPortfolio(page, origin, svc, ids, BIG, 'grosse', true);
                if (big) createdItems.push(big);
            }
        }
    } catch (error) {
        check('exécution sans exception', false, String(error && error.stack || error).slice(0, 400));
        await page.screenshot({ path: path.join(outDir, 'erreur.png') }).catch(() => {});
    } finally {
        // Nettoyage des données QA
        if (ids.favTarget) await svc.from('user_favorites').delete().eq('user_id', idA).eq('entity_type', 'PROFILE').eq('entity_id', ids.favTarget);
        const leftovers = await svc.from('user_portfolio_items').select('id, image_url').eq('user_id', idA).like('title', 'QA 3.2A%');
        for (const it of leftovers.data || []) {
            const objectPath = decodeURIComponent(String(it.image_url).split('/portfolio-images-hold/')[1] || '');
            await svc.from('moderation_jobs').delete().eq('subject_type', 'portfolio').eq('subject_id', it.id);
            await svc.from('user_portfolio_items').delete().eq('id', it.id);
            if (objectPath) {
                await svc.storage.from('portfolio-images-hold').remove([objectPath]);
                await svc.from('public_media_releases').delete().eq('bucket_id', 'portfolio-images-hold').eq('object_name', objectPath);
            }
        }
        console.log(`\nnettoyage: favoris QA retirés, ${(leftovers.data || []).length} réalisation(s) QA supprimée(s)`);
        await browser.close();
        server.close();
        fs.rmSync(bundle, { recursive: true, force: true });
    }
    if (pageErrors.length) console.log('INFO  erreurs JS de page:', JSON.stringify([...new Set(pageErrors)].slice(0, 6)));
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} checks passed (${baseline ? 'baseline' : 'corrigé'}, ${engine})`);
    fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify({ engine, baseline, results, pageErrors }, null, 2));
    process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
