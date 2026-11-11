'use strict';
/*
 * Validation LOCALE des brouillons SQL de la taxonomie v2 (aucune base distante, aucun réseau à l'exécution).
 * Joue 01 → 05, 07 puis 09 dans un Postgres embarqué (PGlite, en mémoire) sur des tables de test qui reprennent
 * la structure et les agrégats de Staging, puis vérifie que le rollback restitue exactement l'état initial.
 *
 * Prérequis hors dépôt : `npm i --no-save @electric-sql/pglite` (ou PGLITE_PATH=/chemin/vers/node_modules).
 *   node scripts/taxonomy-v2/validate-sql-pglite.js
 */
const fs = require('node:fs');
const path = require('node:path');

const DRAFT = path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'migration-draft');
const snapshot = require(path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'data', 'staging-snapshot.json'));

function loadPglite() {
    const tries = [() => require('@electric-sql/pglite'), () => require(path.join(process.env.PGLITE_PATH || '', '@electric-sql/pglite'))];
    for (const t of tries) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}
function loadContrib(name) {
    const tries = [() => require(`@electric-sql/pglite/contrib/${name}`), () => require(path.join(process.env.PGLITE_PATH || '', `@electric-sql/pglite/contrib/${name}`))];
    for (const t of tries) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}

const read = (f) => fs.readFileSync(path.join(DRAFT, f), 'utf8');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function run() {
    const pglite = loadPglite();
    if (!pglite) return { skipped: true, reason: '@electric-sql/pglite introuvable (dépendance de développement optionnelle)' };
    const unaccent = loadContrib('unaccent');
    const trgm = loadContrib('pg_trgm');
    const db = new pglite.PGlite({ extensions: { unaccent: unaccent.unaccent, pg_trgm: trgm.pg_trgm } });
    const report = { steps: [], failures: [] };
    const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); if (!ok) report.failures.push(`${name}${detail ? ` — ${detail}` : ''}`); };
    const rows = async (sql) => (await db.query(sql)).rows;

    // --- Environnement Supabase minimal simulé ---
    await db.exec(`
        CREATE SCHEMA extensions;
        CREATE SCHEMA auth;
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
        GRANT USAGE ON SCHEMA public, extensions, auth TO anon, authenticated;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
        CREATE FUNCTION public.has_admin_permission(p_user uuid, p_perm text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT p_user IS NOT NULL AND p_user = nullif(current_setting('test.admin', true), '')::uuid $$;
        CREATE TABLE public.lyann_taxonomy (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), universe text, category text, subcategory text, synonyms text[], tags text[], safety_level text, active boolean DEFAULT true);
        CREATE TABLE public.requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, category text, taxonomy_id uuid REFERENCES public.lyann_taxonomy(id));
        CREATE TABLE public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, title text, description text, category text, slug text, base_price numeric, indicative_price numeric, price_type text, pricing_model text);
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests, public.services, public.lyann_taxonomy TO authenticated;
    `);
    for (const [u, c, s, safety] of snapshot.leaves) {
        await db.exec(`INSERT INTO public.lyann_taxonomy(universe, category, subcategory, safety_level) VALUES (${q(u)}, ${q(c)}, ${q(s)}, ${q(safety)})`);
    }
    // Demandes : reproduit la répartition de Staging (catégories libres + quelques feuilles classées).
    for (const [cat, n, withTax] of snapshot.request_categories) {
        for (let i = 0; i < n; i += 1) {
            const tax = i < withTax ? "(SELECT id FROM public.lyann_taxonomy WHERE category = 'Plomberie' AND subcategory = 'Fuite & Dépannage')" : 'NULL';
            await db.exec(`INSERT INTO public.requests(title, category, taxonomy_id) VALUES (${q(`req-${cat}-${i}`)}, ${q(cat)}, ${tax})`);
        }
    }
    const userA = '11111111-1111-1111-1111-111111111111';
    const userB = '22222222-2222-2222-2222-222222222222';
    await db.exec(`INSERT INTO auth.users VALUES ('${userA}'), ('${userB}')`);
    for (const [title, , n] of snapshot.services) {
        for (let i = 0; i < n; i += 1) await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${userA}', ${q(title)}, ${q(title)}, ${q(title)}, ${q(`s-${title}-${i}`)})`);
    }
    await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug, base_price) VALUES ('${userA}', 'Peinture pro', 'Peinture soignée', 'Peinture', 'priced', 40)`);

    const fingerprint = async () => {
        const t = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, universe, category, subcategory, safety_level, active FROM public.lyann_taxonomy) x");
        const r = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, title, category, taxonomy_id FROM public.requests) x");
        const s = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, owner_id, title, description, category, slug, base_price FROM public.services) x");
        return JSON.stringify([t[0], r[0], s[0]]);
    };
    const before = await fingerprint();
    report.rowCounts = JSON.parse(before).map((x) => Number(x.n));

    // --- Application des brouillons ---
    for (const file of ['01_schema_taxonomy_v2.sql', '02_additive_columns.sql', '03_search_and_skills_rpc.sql', '04_seed_taxonomy_v2.sql']) {
        try { await db.exec(read(file)); step(`appliquer ${file}`, true); } catch (e) { step(`appliquer ${file}`, false, e.message); return report; }
    }
    // Contrôles avant backfill
    const verify = read('07_verify_taxonomy_v2.sql').split(/^-- V\d+/m).slice(1);
    const runVerify = async (only) => {
        const out = {};
        for (const block of verify) {
            const sqlText = block.split('\n').slice(1).filter((l) => !l.startsWith('--')).join('\n').trim();
            const id = (/'(V\d+)[^']*'/.exec(sqlText) || [])[1];
            if (!id || !only.includes(id)) continue;
            for (const stmt of sqlText.split(/;\s*$/m).map((x) => x.trim()).filter(Boolean)) {
                if (/AS info/.test(stmt)) continue;
                out[id] = (out[id] || []).concat(await rows(stmt));
            }
        }
        return out;
    };
    let v = await runVerify(['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V12']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (avant backfill)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');

    try { await db.exec(read('05_legacy_map_and_backfill.sql')); step('appliquer 05_legacy_map_and_backfill.sql', true); } catch (e) { step('appliquer 05_legacy_map_and_backfill.sql', false, e.message); return report; }
    v = await runVerify(['V07', 'V08', 'V09', 'V10']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (après backfill)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
    // Idempotence : un second passage ne change rien
    const cov1 = await rows('SELECT count(taxonomy_node_code) a FROM public.services');
    await db.exec(read('05_legacy_map_and_backfill.sql'));
    const cov2 = await rows('SELECT count(taxonomy_node_code) a FROM public.services');
    step('backfill idempotent', cov1[0].a === cov2[0].a, `${cov1[0].a} → ${cov2[0].a}`);
    const sk = await rows('SELECT count(*) total, count(taxonomy_node_code) mapped FROM public.services');
    report.skillCoverage = { total: Number(sk[0].total), mapped: Number(sk[0].mapped) };
    const rq = await rows('SELECT count(*) total, count(taxonomy_id) legacy, count(taxonomy_node_code) v2 FROM public.requests');
    report.requestCoverage = { total: Number(rq[0].total), legacy: Number(rq[0].legacy), v2: Number(rq[0].v2) };
    step('les colonnes historiques sont inchangées après backfill', (await fingerprint()) === before);

    // --- Comportements : recherche ---
    const search = async (text) => (await rows(`SELECT node_code, trade_code, family_code, score, needs_clarification FROM public.lyann_taxonomy_search(${q(text)}, 5)`));
    const s1 = await search('fuite sous mon évier');
    step('recherche « fuite sous mon évier » → plomberie', s1[0] && s1[0].trade_code === 'plomberie', JSON.stringify(s1[0]));
    const s2 = await search('ravets');
    step('recherche « ravets » (créole) → nuisibles', s2[0] && s2[0].trade_code === 'nuisibles_hygiene', JSON.stringify(s2[0]));
    const s3 = await search('batterie');
    step('recherche « batterie » → question de précision', s3.length > 0 && s3.every((r) => r.needs_clarification), JSON.stringify(s3.slice(0, 2)));
    const s4 = await search("100%_ ; DROP TABLE x --");
    step('recherche : caractères spéciaux sans effet', Array.isArray(s4));
    const s5 = await search('lecons de conduite');
    step('recherche « leçons de conduite » : nœud réglementé non sélectionnable', s5.length > 0 && (await rows("SELECT selectable FROM public.lyann_taxonomy_node WHERE code='permis_code_route_lecons_conduite'"))[0].selectable === false);

    // --- Comportements : intégrité ---
    const expectFail = async (name, sqlText) => { try { await db.exec(sqlText); step(name, false, 'aurait dû échouer'); } catch (_) { step(name, true); } };
    await expectFail('code de nœud immuable', "UPDATE public.lyann_taxonomy_node SET code = 'plomberie_x' WHERE code = 'plomberie'");
    await expectFail('suppression de nœud interdite', "DELETE FROM public.lyann_taxonomy_node WHERE code = 'plomberie_fuite'");
    await expectFail('activité réglementée non sélectionnable (contrainte)', "UPDATE public.lyann_taxonomy_node SET selectable = true WHERE code = 'permis_code_route_lecons_conduite'");
    await expectFail('forme de nœud invalide', "INSERT INTO public.lyann_taxonomy_node(code, kind, parent_code, family_code, label_fr) VALUES ('zz_test', 'specialty', NULL, 'maison', 'Test')");
    await db.exec("UPDATE public.lyann_taxonomy_node SET label_fr = 'Plomberie & sanitaire' WHERE code = 'plomberie'");
    step('un libellé reste modifiable sans toucher au code', (await rows("SELECT label_fr FROM public.lyann_taxonomy_node WHERE code='plomberie'"))[0].label_fr === 'Plomberie & sanitaire');

    // --- Sécurité (RLS) ---
    await db.exec("SET ROLE anon");
    step('anon lit le catalogue', Number((await rows('SELECT count(*) n FROM public.lyann_taxonomy_node'))[0].n) > 500);
    let denied = false; try { await db.exec("INSERT INTO public.lyann_taxonomy_node(code, kind, family_code, label_fr) VALUES ('hack_trade', 'trade', 'maison', 'Hack')"); } catch (_) { denied = true; }
    step('anon ne peut pas écrire', denied);
    let legacyDenied = false; try { await rows('SELECT count(*) FROM public.lyann_taxonomy_legacy_map'); } catch (_) { legacyDenied = true; }
    step('anon ne lit pas la table de correspondance', legacyDenied);
    await db.exec('RESET ROLE');
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'; SET test.admin = '${userA}'`);
    const wrote = await db.query("UPDATE public.lyann_taxonomy_node SET label_fr = 'Hack' WHERE code = 'plomberie' RETURNING code").then((r) => r.rows.length, () => -1);
    step('un membre non administrateur ne modifie pas le catalogue (RLS)', wrote === 0 || wrote === -1, `lignes modifiées: ${wrote}`);
    await db.exec('RESET ROLE');

    // --- Compétences de profil ---
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    const ok = await rows("SELECT public.lyann_sync_profile_skills_v2('" + userB + "', ARRAY['plomberie','garde_enfants','cuisine_domicile']) r");
    step('RPC compétences v2 : écrit les compétences', ok[0].r.success === true);
    await db.exec('RESET ROLE');
    step('RPC compétences v2 : stubs services écrits pour compatibilité', Number((await rows(`SELECT count(*) n FROM public.services WHERE owner_id='${userB}' AND taxonomy_node_code IS NOT NULL`))[0].n) === 3);
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    for (const [name, arg] of [['nœud réglementé refusé', "ARRAY['permis_code_route_lecons_conduite']"], ['famille « autres » refusée', "ARRAY['autre_demande_non_classee']"], ['code inexistant refusé', "ARRAY['nimporte_quoi']"], ['injection refusée', "ARRAY['a; drop table services']"]]) {
        let refused = false; try { await db.query(`SELECT public.lyann_sync_profile_skills_v2('${userB}', ${arg})`); } catch (_) { refused = true; }
        step(`RPC compétences v2 : ${name}`, refused);
    }
    let usurp = false; try { await db.query(`SELECT public.lyann_sync_profile_skills_v2('${userA}', ARRAY['plomberie'])`); } catch (_) { usurp = true; }
    step('RPC compétences v2 : usurpation d\'un autre membre refusée', usurp);
    await db.exec('RESET ROLE');
    const priced = await rows("SELECT count(*) n FROM public.services WHERE slug='priced'");
    step('un service tarifé n\'est jamais supprimé', Number(priced[0].n) === 1);

    // --- Contrôle négatif : les vérifications détectent bien une anomalie (annulée ensuite) ---
    await db.exec('BEGIN');
    await db.exec("INSERT INTO public.lyann_taxonomy_node(code, kind, parent_code, family_code, label_fr) VALUES ('zz_neg_spec', 'specialty', 'plomberie', 'jardin', 'Anomalie volontaire')");
    const neg = await runVerify(['V02']);
    await db.exec('ROLLBACK');
    step('contrôle négatif : V02 détecte une spécialité incohérente', (neg.V02 || []).length === 1, JSON.stringify(neg.V02));
    const source = await rows("SELECT count(*) FILTER (WHERE taxonomy_node_source = 'backfill_category') c, count(*) FILTER (WHERE taxonomy_node_source = 'backfill_leaf') l FROM public.requests");
    report.requestSources = { backfill_category: Number(source[0].c), backfill_leaf: Number(source[0].l) };
    step('provenance du backfill renseignée', Number(source[0].c) + Number(source[0].l) === report.requestCoverage.v2);

    // --- Rollback ---
    await db.exec(`DELETE FROM public.services WHERE owner_id='${userB}'`);
    try { await db.exec(read('09_rollback_taxonomy_v2.sql')); step('appliquer 09_rollback_taxonomy_v2.sql', true); } catch (e) { step('appliquer 09_rollback_taxonomy_v2.sql', false, e.message); return report; }
    step('rollback : état initial restitué à l\'identique', (await fingerprint()) === before);
    const left = await rows("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (relname LIKE 'lyann_taxonomy_%' OR relname='lyann_profile_skill') AND relkind IN ('r','v')");
    step('rollback : aucune table v2 résiduelle', left.length === 0, left.map((r) => r.relname).join(','));
    const cols = await rows("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('taxonomy_node_code','node_code')");
    step('rollback : aucune colonne v2 résiduelle', cols.length === 0);
    // Rejouable : appliquer à nouveau après rollback
    try { await db.exec(read('01_schema_taxonomy_v2.sql')); await db.exec(read('02_additive_columns.sql')); await db.exec(read('03_search_and_skills_rpc.sql')); await db.exec(read('04_seed_taxonomy_v2.sql')); await db.exec(read('05_legacy_map_and_backfill.sql')); step('rejouable après rollback', true); } catch (e) { step('rejouable après rollback', false, e.message); }
    await db.close();
    return report;
}

if (require.main === module) {
    run().then((r) => {
        if (r.skipped) { console.log(`SKIP: ${r.reason}`); return; }
        for (const s of r.steps) console.log(`${s.ok ? 'OK  ' : 'FAIL'} ${s.name}${s.ok || !s.detail ? '' : ` — ${s.detail}`}`);
        console.log(`\n${r.steps.length - r.failures.length}/${r.steps.length} contrôles OK`, r.rowCounts ? `· lignes de test ${r.rowCounts.join('/')}` : '');
        if (r.requestSources) console.log(`provenance demandes ${JSON.stringify(r.requestSources)}`);
        if (r.skillCoverage) console.log(`couverture compétences ${r.skillCoverage.mapped}/${r.skillCoverage.total} · demandes v2 ${r.requestCoverage.v2}/${r.requestCoverage.total} (ancien ${r.requestCoverage.legacy})`);
        process.exit(r.failures.length ? 1 : 0);
    }).catch((e) => { console.error(e); process.exit(2); });
}
module.exports = { run };
