#!/usr/bin/env node
/*
 * Phase 3.2A — Bug 1 : vérification réelle contre Staging (tdktfbtqceldlaeqjtow uniquement) de la chaîne favoris Lyanneur.
 * Comptes QA existants (QA_A / QA_B). Le favori créé est supprimé en fin d'exécution. Aucun jeton n'est affiché.
 */
require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { mustStaging } = require('./admin-staging-real-session-lib');

const results = [];
const check = (label, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : '  ->  ' + JSON.stringify(detail)}`); };
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

(async () => {
    mustStaging();
    const url = process.env.SUPABASE_URL;
    const mk = () => createClient(url, process.env.SUPABASE_ANON_KEY, opts);
    const a = mk(); const b = mk();
    const sa = await a.auth.signInWithPassword({ email: process.env.LYANN_E2E_QA_A_EMAIL, password: process.env.LYANN_E2E_QA_A_PASSWORD });
    const sb = await b.auth.signInWithPassword({ email: process.env.LYANN_E2E_QA_B_EMAIL, password: process.env.LYANN_E2E_QA_B_PASSWORD });
    const idA = sa.data.user.id; const idB = sb.data.user.id;
    check('connexion QA_A et QA_B', idA && idB && idA !== idB);
    await a.from('user_favorites').delete().eq('user_id', idA).eq('entity_id', idB);
    try {
        const ins = await a.from('user_favorites').upsert({ user_id: idA, entity_type: 'PROFILE', entity_id: idB }, { onConflict: 'user_id,entity_type,entity_id' }).select().single();
        check('A enregistre B en favori (RLS INSERT)', !ins.error && ins.data && ins.data.entity_id === idB, ins.error);
        const mine = await a.from('user_favorites').select('*').eq('user_id', idA).eq('entity_type', 'PROFILE');
        check('A relit son favori (RLS SELECT)', !mine.error && (mine.data || []).some((f) => f.entity_id === idB), mine.error);
        const old = await a.from('profiles').select('id, first_name').eq('id', idB).maybeSingle();
        console.log(`INFO  ancienne hydratation (table profiles) -> ${old.data ? 'ligne lue' : 'AUCUNE ligne (favori omis en silence)'}`);
        const pub = await a.from('public_profiles').select('id, first_name, last_name, avatar_url, city, territory, professional_status, is_pro').eq('id', idB).maybeSingle();
        check('hydratation via public_profiles lisible pour A', !pub.error && pub.data && pub.data.id === idB, pub.error);
        const other = await b.from('user_favorites').select('*').eq('user_id', idA);
        check('isolation : B ne voit pas les favoris de A', !other.error && (other.data || []).length === 0, other.data);
        const spoof = await b.from('user_favorites').insert({ user_id: idA, entity_type: 'PROFILE', entity_id: idB });
        check('isolation : B ne peut pas écrire au nom de A', !!spoof.error, spoof);
        const del = await b.from('user_favorites').delete().eq('user_id', idA).eq('entity_id', idB).select();
        check('isolation : B ne peut pas supprimer le favori de A', !del.error && (del.data || []).length === 0, del);
        const rm = await a.from('user_favorites').delete().eq('user_id', idA).eq('entity_type', 'PROFILE').eq('entity_id', idB);
        check('A retire le favori', !rm.error, rm.error);
        const after = await a.from('user_favorites').select('id').eq('user_id', idA).eq('entity_id', idB);
        check('favori bien supprimé après retrait', (after.data || []).length === 0, after.data);
    } finally {
        await a.from('user_favorites').delete().eq('user_id', idA).eq('entity_id', idB);
    }
    const ok = results.every(Boolean);
    console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
    process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERREUR', e.message); process.exit(1); });
