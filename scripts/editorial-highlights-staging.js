#!/usr/bin/env node
/*
 * Phase 3.1A — real Staging verification of the « À la une » back-office routes and RLS.
 * Runs api/server.js locally against Staging V2 (tdktfbtqceldlaeqjtow ONLY: force-staging-v2-env refuses anything else), mints an
 * administrator JWT and a plain member JWT, then checks permissions, validation, image control, visibility windows and audit.
 * Every row and Storage object it creates is deleted at the end. Tokens and passwords are never printed.
 *
 *   node scripts/editorial-highlights-staging.js                  -> checks, then cleanup
 *   node scripts/editorial-highlights-staging.js --seed-captures  -> creates three LIVE preview cards for the screenshots
 *   node scripts/editorial-highlights-staging.js --cleanup        -> removes the preview cards created by --seed-captures
 */
require('./force-staging-v2-env');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { resolveAdminAndJwt, mustStaging } = require('./admin-staging-real-session-lib');

let BASE = '';
const STATE_FILE = '/tmp/lyann-highlight-captures.json';
const PACK = '/tmp/lyann-31a-pack/LYANN_V3_1A_Compact_Resultats_Cursor/02_Photos';
const argv = process.argv.slice(2);
const results = [];
const check = (label, ok, detail) => { results.push({ label, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ->  ' + JSON.stringify(detail)}`); };

function startServer() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-r', './scripts/force-staging-v2-env.js', '-r', './scripts/disable-local-workers.js', 'api/server.js'], {
            cwd: path.join(__dirname, '..'),
            env: { ...process.env, LYANN_DOTENV_PATH: path.join(__dirname, '..', '.env.staging-v2') },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let done = false;
        child.on('exit', (code) => { if (!done) reject(new Error(`API arrêtée (${code})`)); });
        const onData = (buf) => {
            const m = /écoute sur http:\/\/[^:]+:(\d+)/.exec(String(buf));
            if (m && !done) { done = true; BASE = `http://127.0.0.1:${m[1]}`; setTimeout(() => resolve(child), 300); }
        };
        child.stdout.on('data', onData); child.stderr.on('data', onData);
        setTimeout(() => { if (!done) { done = true; child.kill(); reject(new Error('API Staging locale injoignable')); } }, 40000);
    });
}

async function call(token, method, route, body) {
    const res = await fetch(`${BASE}/v1/admin/editorial/highlights${route}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (_) { json = null; }
    return { status: res.status, json };
}

const dataUrl = (file, mime) => `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;

(async () => {
    mustStaging();
    const url = process.env.SUPABASE_URL;
    const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(url, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const BUCKET = 'editorial-highlights';

    if (argv.includes('--cleanup')) {
        const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : { ids: [], paths: [] };
        if (state.ids.length) await svc.from('editorial_highlights').delete().in('id', state.ids);
        if (state.paths.length) await svc.storage.from(BUCKET).remove(state.paths);
        fs.rmSync(STATE_FILE, { force: true });
        console.log('cleanup done', state.ids.length, 'cards', state.paths.length, 'images');
        return;
    }

    const admin = await resolveAdminAndJwt();
    const member = await anon.auth.signInWithPassword({ email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD });
    const memberToken = member.data && member.data.session && member.data.session.access_token;
    const server = await startServer();
    const created = { ids: [], paths: [] };
    const track = (res) => { if (res.json && res.json.highlight) created.ids.push(res.json.highlight.id); return res; };
    try {
        // Seed mode: three real, live cards for the captures (removed with --cleanup).
        const upload = async (file, mime) => {
            const r = await call(admin.jwt, 'POST', '/image', { data: dataUrl(file, mime) });
            if (r.status !== 201) throw new Error(`upload ${file}: ${r.status} ${JSON.stringify(r.json)}`);
            created.paths.push(r.json.url.split(`/${BUCKET}/`)[1]);
            return r.json.url;
        };
        const tmpWebp = (name) => {
            const out = `/tmp/lyann-hl-${name}.webp`;
            require('child_process').execFileSync('python3', ['-c', `from PIL import Image; Image.open('${PACK}/${name}.jpg').convert('RGB').resize((480,210)).save('${out}','WEBP',quality=78)`]);
            return out;
        };

        if (argv.includes('--seed-captures')) {
            const cards = [
                ['edito_rentree_coiffure_enfant', { title: 'Rentrée sereine', teaser: 'Coiffure, rangement, transport…', label: 'Rentrée', cta_target: 'lyanneurs_category', cta_value: 'Coiffure & Esthétique', priority: 10 }],
                ['edito_noel_cuisine_festive', { title: 'Préparez Noël', teaser: 'Cuisine, déco, chants de Noël…', label: 'Noël', cta_target: 'lyanneurs', priority: 20 }],
                ['edito_careme_jardinage', { title: 'Jardin en saison sèche', teaser: 'Nos conseils et solutions locales', label: 'Carême', cta_target: 'lyanneurs_category', cta_value: 'Entretien Jardin', priority: 30 }]
            ];
            for (const [photo, card] of cards) {
                const image_url = await upload(tmpWebp(photo), 'image/webp');
                const r = track(await call(admin.jwt, 'POST', '', { ...card, image_url, image_alt: card.title, territory: 'all', status: 'published', theme: 'saison' }));
                if (r.status !== 201) throw new Error(`seed ${card.title}: ${r.status} ${JSON.stringify(r.json)}`);
            }
            fs.writeFileSync(STATE_FILE, JSON.stringify(created));
            console.log('seeded 3 live preview cards; remove with --cleanup');
            return;
        }

        // 1. Access control (server-verified)
        check('no token -> 401', (await call(null, 'GET', '')).status === 401);
        check('member without admin rights -> 403', memberToken && (await call(memberToken, 'GET', '')).status === 403);
        check('member cannot create -> 403', (await call(memberToken, 'POST', '', { title: 'Test card', teaser: 'Test teaser', cta_target: 'lyanneurs' })).status === 403);
        check('administrator can list', (await call(admin.jwt, 'GET', '')).status === 200);

        // 2. Validation and sanitisation
        const good = { title: 'QA carte 3.1A', teaser: 'Carte de test, supprimée après vérification', cta_target: 'lyanneurs' };
        let r = await call(admin.jwt, 'POST', '', { ...good, title: '<script>alert(1)</script>' });
        check('HTML in title rejected (400)', r.status === 400 && r.json.field === 'title', r);
        r = await call(admin.jwt, 'POST', '', { ...good, teaser: 'a <img src=x onerror=1> b' });
        check('HTML in teaser rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, image_url: 'javascript:alert(1)' });
        check('javascript: image URL rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, image_url: 'https://evil.example/storage/v1/object/public/other/a.png' });
        check('foreign image URL rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, cta_target: 'https://evil.example' });
        check('free URL as call to action rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, cta_target: 'annonces_category' });
        check('category target without category rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, territory: 'paris' });
        check('unknown territory rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, status: 'published' });
        check('published without image rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '', { ...good, starts_at: '2026-12-02T10:00:00Z', ends_at: '2026-12-01T10:00:00Z' });
        check('end before start rejected (400)', r.status === 400, r);

        // 3. Image control
        r = await call(admin.jwt, 'POST', '/image', { data: Buffer.from('not an image, just text content here').toString('base64') });
        check('text file as image rejected (400)', r.status === 400, r);
        const oversize = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1024 * 1024 + 10, 1)]);
        r = await call(admin.jwt, 'POST', '/image', { data: oversize.toString('base64') });
        check('image over 1 MiB rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'POST', '/image', { data: dataUrl(`${PACK}/header_annonces_voisine_fuite_eau.jpg`, 'image/jpeg') });
        check('JPEG accepted (201)', r.status === 201, r);
        if (r.json && r.json.url) created.paths.push(r.json.url.split(`/${BUCKET}/`)[1]);
        const webp = tmpWebp('edito_noel_cuisine_festive');
        r = await call(admin.jwt, 'POST', '/image', { data: dataUrl(webp, 'image/webp') });
        check('WebP accepted (201) with detected MIME', r.status === 201 && r.json.mime === 'image/webp', r);
        const imageUrl = r.json && r.json.url;
        if (imageUrl) created.paths.push(imageUrl.split(`/${BUCKET}/`)[1]);
        const pub = imageUrl ? await fetch(imageUrl) : { status: 0, headers: new Map() };
        check('public image URL served as image/webp', pub.status === 200 && /image\/webp/.test(pub.headers.get('content-type') || ''), pub.status);

        // 4. Visibility windows (RLS, read as anonymous)
        const now = Date.now();
        const iso = (ms) => new Date(now + ms).toISOString();
        const H = 3600e3;
        const mk = async (extra) => track(await call(admin.jwt, 'POST', '', { ...good, image_url: imageUrl, ...extra }));
        const live = await mk({ title: 'QA en ligne', status: 'published', starts_at: iso(-H), ends_at: iso(24 * H) });
        const scheduled = await mk({ title: 'QA planifiée', status: 'published', starts_at: iso(24 * H) });
        const expired = await mk({ title: 'QA terminée', status: 'published', starts_at: iso(-48 * H), ends_at: iso(-H) });
        const draft = await mk({ title: 'QA brouillon', status: 'draft' });
        const archived = await mk({ title: 'QA archivée', status: 'archived' });
        check('five cards created (201)', [live, scheduled, expired, draft, archived].every((x) => x.status === 201), [live, scheduled, expired, draft, archived].map((x) => x.status));
        const COLS = 'id,title,teaser,label,image_url,image_alt,territory,theme,cta_target,cta_value,starts_at,ends_at,priority,published_at';
        const visible = async (client = anon) => ((await client.from('editorial_highlights').select(COLS)).data || []).map((x) => x.title);
        let seen = await visible();
        check('anonymous sees only the live card', seen.includes('QA en ligne') && !seen.some((t) => ['QA planifiée', 'QA terminée', 'QA brouillon', 'QA archivée'].includes(t)), seen);
        const memberClient = createClient(url, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${memberToken}` } }, auth: { persistSession: false, autoRefreshToken: false } });
        seen = await visible(memberClient);
        check('signed-in member sees only the live card', seen.includes('QA en ligne') && seen.length === 1, seen);
        check('administrator columns are not readable by clients', !!(await anon.from('editorial_highlights').select('created_by')).error);
        const ins = await anon.from('editorial_highlights').insert({ title: 'hack', teaser: 'hack', cta_target: 'lyanneurs' });
        check('anonymous insert refused', !!ins.error, ins);
        const upd = await memberClient.from('editorial_highlights').update({ title: 'hack' }).eq('id', live.json.highlight.id).select();
        check('member update refused', !!upd.error || !(upd.data || []).length, upd);
        const del = await memberClient.from('editorial_highlights').delete().eq('id', live.json.highlight.id).select();
        check('member delete refused', !!del.error || !(del.data || []).length, del);
        const bucketWrite = await memberClient.storage.from(BUCKET).upload(`qa/${Date.now()}.webp`, fs.readFileSync(webp), { contentType: 'image/webp' });
        check('member cannot upload to the bucket', !!bucketWrite.error, bucketWrite.error && bucketWrite.error.message);

        // 5. Lifecycle + audit
        const id = draft.json.highlight.id;
        r = await call(admin.jwt, 'PATCH', `/${id}`, { status: 'published' });
        check('draft -> published (PATCH)', r.status === 200 && r.json.highlight.state === 'live', r);
        check('published card becomes visible', (await visible()).includes('QA brouillon'));
        r = await call(admin.jwt, 'PATCH', `/${id}`, { status: 'archived' });
        check('published -> archived hides it', r.status === 200 && !(await visible()).includes('QA brouillon'), r);
        r = await call(admin.jwt, 'PATCH', `/${id}`, { title: '<b>x</b>' });
        check('HTML in PATCH rejected (400)', r.status === 400, r);
        r = await call(admin.jwt, 'PATCH', `/${id}`, { cta_target: 'annonces_map' });
        check('PATCH to whitelisted target accepted', r.status === 200 && r.json.highlight.cta_target === 'annonces_map', r);
        r = await call(admin.jwt, 'DELETE', `/${id}`);
        check('DELETE removes the card', r.status === 200 && !(await svc.from('editorial_highlights').select('id').eq('id', id)).data.length, r);
        const audits = await svc.from('admin_audit_events').select('action,actor_id').eq('module_name', 'Éditorial À la une').in('target_id', created.ids.concat(created.paths));
        const actions = new Set((audits.data || []).map((x) => x.action));
        check('audit rows written (create, publish/archive, update, delete, image)', ['EDITORIAL_HIGHLIGHT_CREATE', 'EDITORIAL_HIGHLIGHT_PUBLISHED', 'EDITORIAL_HIGHLIGHT_ARCHIVED', 'EDITORIAL_HIGHLIGHT_UPDATE', 'EDITORIAL_HIGHLIGHT_DELETE', 'EDITORIAL_HIGHLIGHT_IMAGE'].every((a) => actions.has(a)), [...actions]);
        check('audit actor is the administrator', (audits.data || []).every((x) => x.actor_id === admin.userId));
    } finally {
        if (!argv.includes('--seed-captures')) {
            if (created.ids.length) await svc.from('editorial_highlights').delete().in('id', created.ids);
            if (created.paths.length) await svc.storage.from(BUCKET).remove(created.paths);
            const left = await svc.from('editorial_highlights').select('id', { count: 'exact', head: true });
            console.log('cleanup: highlights left in table =', left.count);
        }
        server.kill();
    }
    const failed = results.filter((x) => !x.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
