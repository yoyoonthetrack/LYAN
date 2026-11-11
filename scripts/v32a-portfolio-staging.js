#!/usr/bin/env node
/*
 * Phase 3.2A — Bug 3 : cycle de vie réel d'une photo de réalisation contre Staging (tdktfbtqceldlaeqjtow uniquement).
 * Compte QA_A. Dépose une petite photo neutre (témoin) et/ou une photo > 5 Mio (cas suspect), puis suit moderation_jobs.
 * Tout (lignes, objets Storage, jobs, libérations) est supprimé en fin d'exécution. Aucun jeton n'est affiché.
 *
 *   node scripts/v32a-portfolio-staging.js small=/tmp/v32a/small.jpg big=/tmp/v32a/big.jpg [wait=420]
 */
require('./force-staging-v2-env');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { mustStaging } = require('./admin-staging-real-session-lib');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const WAIT = Number(args.wait || 420) * 1000;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    mustStaging();
    const url = process.env.SUPABASE_URL;
    const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
    const a = createClient(url, process.env.SUPABASE_ANON_KEY, opts);
    const s = await a.auth.signInWithPassword({ email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD });
    const uid = s.data.user.id;
    const items = [];
    const objects = [];
    try {
        for (const [label, file] of Object.entries({ small: args.small, big: args.big }).filter(([, f]) => f)) {
            const bytes = fs.readFileSync(file);
            const objectPath = `${uid}/portfolio_qa32a_${label}_${Date.now()}.jpg`;
            const up = await a.storage.from('portfolio-images-hold').upload(objectPath, bytes, { contentType: 'image/jpeg', upsert: true });
            console.log(`${label}: ${(bytes.length / 1048576).toFixed(2)} Mio, upload ${up.error ? 'ERREUR ' + up.error.message : 'ok'}`);
            if (up.error) continue;
            objects.push(objectPath);
            const imageUrl = `${process.env.LYANN_PUBLIC_ORIGIN || 'https://staging.lyann.app'}/v1/media/portfolio-images-hold/${objectPath}`;
            const ins = await a.from('user_portfolio_items').insert({ user_id: uid, image_url: imageUrl, title: `QA 3.2A ${label}`, caption: '', is_public: true }).select().single();
            console.log(`${label}: insertion ${ins.error ? 'ERREUR ' + ins.error.message : 'ok'}`);
            if (!ins.error) items.push({ label, id: ins.data.id, objectPath, size: bytes.length });
        }
        const start = Date.now();
        const last = {};
        while (Date.now() - start < WAIT) {
            let allFinal = true;
            for (const item of items) {
                const job = await svc.from('moderation_jobs').select('status, reason_code, attempts').eq('subject_type', 'portfolio').eq('subject_id', item.id).maybeSingle();
                const rel = await svc.from('public_media_releases').select('status').eq('bucket_id', 'portfolio-images-hold').eq('object_name', item.objectPath).maybeSingle();
                const row = await svc.from('user_portfolio_items').select('is_public').eq('id', item.id).maybeSingle();
                const sig = `${job.data && job.data.status}/${job.data && job.data.reason_code}/att=${job.data && job.data.attempts}/release=${rel.data && rel.data.status}/public=${row.data && row.data.is_public}`;
                if (last[item.label] !== sig) { last[item.label] = sig; console.log(`[+${Math.round((Date.now() - start) / 1000)}s] ${item.label}: ${sig}`); }
                if (!job.data || !['done', 'held'].includes(job.data.status)) allFinal = false;
            }
            if (allFinal && items.length) break;
            await sleep(10000);
        }
        console.log('FINAL', JSON.stringify(last));
    } finally {
        for (const item of items) {
            await svc.from('moderation_jobs').delete().eq('subject_type', 'portfolio').eq('subject_id', item.id);
            await svc.from('user_portfolio_items').delete().eq('id', item.id);
        }
        if (objects.length) {
            await svc.storage.from('portfolio-images-hold').remove(objects);
            for (const o of objects) await svc.from('public_media_releases').delete().eq('bucket_id', 'portfolio-images-hold').eq('object_name', o);
        }
        console.log(`nettoyage: ${items.length} lignes, ${objects.length} objets`);
    }
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
