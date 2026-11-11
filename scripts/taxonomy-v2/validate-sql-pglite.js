'use strict';
/*
 * Validation LOCALE des brouillons SQL de la taxonomie v2 (aucune base distante, aucun réseau à l'exécution).
 * Joue 01 → 06, 07 puis 09 dans un Postgres embarqué (PGlite, en mémoire) sur des tables de test qui reprennent
 * la structure et les agrégats de Staging, puis vérifie que le rollback restitue exactement l'état initial.
 *
 * Prérequis hors dépôt : `npm i --no-save @electric-sql/pglite` (ou PGLITE_PATH=/chemin/vers/node_modules).
 *   node scripts/taxonomy-v2/validate-sql-pglite.js
 */
const fs = require('node:fs');
const path = require('node:path');

const DRAFT = path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'migration-draft');
const moderation = require('./moderation-fixture');
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

async function run(opts = {}) {
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
        CREATE TABLE public.requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, category text, taxonomy_id uuid REFERENCES public.lyann_taxonomy(id), ${moderation.REQUEST_MODERATION_COLUMNS});
        CREATE TABLE public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, title text, description text, category text, slug text, base_price numeric, indicative_price numeric, price_type text, pricing_model text, category_id uuid, active boolean DEFAULT true, is_active boolean DEFAULT true);
        CREATE TABLE public.lyann_plan_memberships (user_id uuid PRIMARY KEY, plan text, status text, expires_at timestamptz);
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.requests, public.services, public.lyann_taxonomy TO authenticated;
    `);
    // Ancienne RPC d'enregistrement des compétences (migration 83, déjà appliquée sur Staging) : nécessaire pour prouver que 06 la protège et que 09 la restitue.
    await db.exec(fs.readFileSync(path.join(__dirname, '..', '..', '83_lyann_atomic_profile_skills_staging.sql'), 'utf8'));
    // Garde de quota de catégories RÉELLE (migration 82), extraite du fichier : présente sur Staging, elle doit survivre à toute la séquence
    const quotaObjects = require('./validate-quotas-pglite').extractQuotaObjects();
    for (const t of quotaObjects.tables) await db.exec(t);
    for (const f of quotaObjects.functions) await db.exec(f);
    await db.exec(quotaObjects.trigger);
    const skillsFn = async () => (await rows("SELECT md5(prosrc) h FROM pg_proc WHERE proname = 'lyann_sync_profile_skills'"))[0].h;
    const skillsFnBefore = await skillsFn();
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

    await moderation.install(db);   // déclencheurs RÉELS de modération des demandes (migrations 70 et 71), installés après le chargement des données de test
    const fingerprint = async () => {
        const t = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, universe, category, subcategory, safety_level, active FROM public.lyann_taxonomy) x");
        const r = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, title, category, taxonomy_id FROM public.requests) x");
        const s = await rows("SELECT md5(string_agg(row_to_json(x)::text, '|' ORDER BY id)) h, count(*) n FROM (SELECT id, owner_id, title, description, category, slug, base_price FROM public.services) x");
        return JSON.stringify([t[0], r[0], s[0]]);
    };
    const before = await fingerprint();
    report.rowCounts = JSON.parse(before).map((x) => Number(x.n));
    if (opts.afterSetup) {
        await opts.afterSetup({ db, rows, step, report, userA, userB });
        if (opts.onlyAfterSetup) { await db.close(); return report; }
    }

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

    // --- Modération : le rétro-remplissage de `requests` ne doit ni rouvrir la file de modération, ni toucher une modification en attente ---
    const backfill05 = moderation.backfillVariants(read('05_legacy_map_and_backfill.sql'));
    const measureVariant = async (variant) => {
        await db.exec('BEGIN');
        await db.exec('ALTER TABLE public.requests DISABLE TRIGGER USER');
        await db.exec(`INSERT INTO public.requests(title, category, public_moderation_status, title_pending) VALUES ('mod-pending-edit', 'Plomberie', 'approved', 'texte modifié en attente')`);
        await db.exec(`INSERT INTO public.requests(title, category, public_moderation_status) VALUES ('mod-rejected', 'Plomberie', 'rejected')`);
        await db.exec('ALTER TABLE public.requests ENABLE TRIGGER USER');
        const before = await moderation.moderationState(db);
        await db.exec(moderation.stripTransaction(variant));
        const after = await moderation.moderationState(db);
        const specials = await rows("SELECT title, taxonomy_node_code c FROM public.requests WHERE title IN ('mod-pending-edit', 'mod-rejected') ORDER BY title");
        const classified = Number((await rows('SELECT count(taxonomy_node_code) n FROM public.requests'))[0].n);
        await db.exec('ROLLBACK');
        return { before, after, specials, classified };
    };
    const plainRun = await measureVariant(backfill05.plain);
    const serviceRun = await measureVariant(backfill05.service);
    report.moderation = { plain: { queue: plainRun.after.queue - plainRun.before.queue, jobs: plainRun.after.jobs - plainRun.before.jobs, hashChanged: plainRun.after.requestsHash !== plainRun.before.requestsHash },
        service: { queue: serviceRun.after.queue - serviceRun.before.queue, jobs: serviceRun.after.jobs - serviceRun.before.jobs, hashChanged: serviceRun.after.requestsHash !== serviceRun.before.requestsHash }, classified: serviceRun.classified };
    step('modération · exécution « telle quelle » (sans contexte service) : la réécriture re-modère les demandes (effet constaté, documenté, décision X6)', report.moderation.plain.queue > 0 || report.moderation.plain.jobs > 0, JSON.stringify(report.moderation.plain));
    step('modération · exécution en contexte « service » : aucune ligne de file, aucune tâche, aucun texte ni statut de modération modifié', report.moderation.service.queue === 0 && report.moderation.service.jobs === 0 && !report.moderation.service.hashChanged, JSON.stringify(report.moderation.service));
    step('modération : demandes avec modification en attente ou non approuvées exclues du rétro-remplissage (restent « à classer »), dans les deux variantes', serviceRun.specials.every((r) => r.c === null) && plainRun.specials.every((r) => r.c === null), JSON.stringify(serviceRun.specials));
    step('modération : le rétro-remplissage classe bien les demandes approuvées (80 de test)', serviceRun.classified === 80, String(serviceRun.classified));
    const modBefore = await moderation.moderationState(db);
    try { await db.exec(backfill05.service); step('appliquer 05_legacy_map_and_backfill.sql', true); } catch (e) { step('appliquer 05_legacy_map_and_backfill.sql', false, e.message); return report; }
    v = await runVerify(['V07', 'V08', 'V09', 'V10', 'V18', 'V21']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (après backfill)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
    // Idempotence : un second passage ne change rien
    const cov1 = await rows('SELECT count(taxonomy_node_code) a FROM public.services');
    await db.exec(backfill05.service);
    const cov2 = await rows('SELECT count(taxonomy_node_code) a FROM public.services');
    step('backfill idempotent', cov1[0].a === cov2[0].a, `${cov1[0].a} → ${cov2[0].a}`);
    const sk = await rows('SELECT count(*) total, count(taxonomy_node_code) mapped FROM public.services');
    report.skillCoverage = { total: Number(sk[0].total), mapped: Number(sk[0].mapped) };
    const rq = await rows('SELECT count(*) total, count(taxonomy_id) legacy, count(taxonomy_node_code) v2 FROM public.requests');
    report.requestCoverage = { total: Number(rq[0].total), legacy: Number(rq[0].legacy), v2: Number(rq[0].v2) };
    step('les colonnes historiques sont inchangées après backfill', (await fingerprint()) === before);
    const modAfter = await moderation.moderationState(db);
    step('le rétro-remplissage (contexte service) laisse intacts la file et les tâches de modération et le texte/statut de toutes les demandes', JSON.stringify(modAfter) === JSON.stringify(modBefore), JSON.stringify({ modBefore, modAfter }));

    // --- 06 : rattachement automatique pour les anciens clients ---
    try { await db.exec(read('06_dual_write_derivation.sql')); step('appliquer 06_dual_write_derivation.sql', true); } catch (e) { step('appliquer 06_dual_write_derivation.sql', false, e.message); return report; }
    v = await runVerify(['V13', 'V14']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (après 06)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
    step('06 ne modifie aucune ligne existante', (await fingerprint()) === before);
    // Séquence réelle : 05 → 06 → 05 (rejeu) ; le rejeu doit rester neutre, déclencheurs actifs (lignes écrites entre 05 et 06 rattrapées).
    const covA = await rows('SELECT count(taxonomy_node_code) r, (SELECT count(taxonomy_node_code) FROM public.services) s FROM public.requests');
    await db.exec(backfill05.service);
    const covB = await rows('SELECT count(taxonomy_node_code) r, (SELECT count(taxonomy_node_code) FROM public.services) s FROM public.requests');
    step('rejeu de 05 après 06 : neutre, déclencheurs actifs', covA[0].r === covB[0].r && covA[0].s === covB[0].s, `${JSON.stringify(covA[0])} → ${JSON.stringify(covB[0])}`);

    // --- 08 : écriture historique véridique (étape facultative) ---
    try { await db.exec(read('08_legacy_projection.sql')); step('appliquer 08_legacy_projection.sql', true); } catch (e) { step('appliquer 08_legacy_projection.sql', false, e.message); return report; }
    step('08 ne modifie aucune ligne existante', (await fingerprint()) === before);
    v = await runVerify(['V10', 'V13', 'V14', 'V15', 'V16', 'V17']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (après 08)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
    const projCount = Number((await rows('SELECT count(*) n FROM public.lyann_taxonomy_legacy_projection'))[0].n);
    step('projection : une ligne par nœud ayant un pont véridique', projCount === require('./build-legacy-projection').projectionRows().length, String(projCount));
    await db.exec('RESET ROLE');
    let denyProj = false; await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`); try { await rows('SELECT count(*) FROM public.lyann_taxonomy_legacy_projection'); } catch (_) { denyProj = true; } await db.exec('RESET ROLE');
    step('projection : illisible pour un membre (table réservée au serveur)', denyProj);

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
    // Ancien éditeur de compétences (RPC 83 protégée par 06) : les compétences v2 de userB survivent à son enregistrement.
    await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${userB}', 'Piscine', 'Piscine', 'Piscine', 'oc-old-stub')`);
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    await db.query(`SELECT public.lyann_sync_profile_skills('${userB}', ARRAY['Couture'])`);
    await db.exec('RESET ROLE');
    step('ancien éditeur de compétences : les compétences v2 (nœud explicite) ne sont pas supprimées', Number((await rows(`SELECT count(*) n FROM public.services WHERE owner_id='${userB}' AND taxonomy_node_source = 'client'`))[0].n) === 3);
    step('ancien éditeur de compétences : un ancien stub absent de la liste est toujours supprimé (comportement inchangé)', Number((await rows("SELECT count(*) n FROM public.services WHERE slug = 'oc-old-stub'"))[0].n) === 0);
    step('ancien éditeur de compétences : la nouvelle compétence reçoit un nœud dérivé de son titre', (await rows(`SELECT taxonomy_node_source s FROM public.services WHERE owner_id='${userB}' AND title = 'Couture'`))[0].s === 'derived_title');
    await db.exec(`DELETE FROM public.services WHERE owner_id='${userB}' AND title = 'Couture'`);
    const priced = await rows("SELECT count(*) n FROM public.services WHERE slug='priced'");
    step('un service tarifé n\'est jamais supprimé', Number(priced[0].n) === 1);

    // --- Anciens clients : écritures sans taxonomy_node_code (le cas des builds iOS/Android déjà publiés) ---
    const leafId = (await rows("SELECT id FROM public.lyann_taxonomy WHERE category = 'Plomberie' AND subcategory = 'Fuite & Dépannage'"))[0].id;
    const node = async (title) => (await rows(`SELECT taxonomy_node_code c, taxonomy_node_source s FROM public.requests WHERE title = ${q(title)}`))[0];
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    await db.exec(`INSERT INTO public.requests(title, category, taxonomy_id) VALUES ('oc-leaf', 'Plomberie', '${leafId}')`);
    await db.exec("INSERT INTO public.requests(title, category) VALUES ('oc-cat', 'Plomberie'), ('oc-general', 'Général'), ('oc-residu', 'k7mqp4lyannrc'), ('oc-jardinage', 'Jardinage')");
    await db.exec("INSERT INTO public.requests(title, category, taxonomy_node_code) VALUES ('oc-v2', 'Jardinage', 'garde_enfants')");
    await db.exec("INSERT INTO public.requests(title, category, taxonomy_node_code, taxonomy_node_source) VALUES ('oc-class', 'Général', 'plomberie_fuite', 'classifier')");
    const leafBy = async (cat, sub) => (await rows(`SELECT id FROM public.lyann_taxonomy WHERE category = ${q(cat)} AND subcategory = ${q(sub)}`))[0].id;
    await db.exec(`INSERT INTO public.requests(title, category, taxonomy_id) VALUES ('oc-leaf-exact', 'Électricité', '${await leafBy('Électricité', 'Panne & Dépannage')}'), ('oc-leaf-cross', 'DJ & Son', '${await leafBy('DJ & Son', 'Animation musicale')}')`);
    await db.exec('RESET ROLE');
    let n = await node('oc-leaf');
    step('ancien client : feuille historique → nœud dérivé (membre sans accès à la table de correspondance)', n.c === 'plomberie' && n.s === 'derived_leaf_parent', JSON.stringify(n));
    // Décision X5 : feuille certaine → nœud précis ; feuille qui recouvre plusieurs spécialités → métier parent + signal ; plusieurs métiers → rien.
    n = await node('oc-leaf-exact'); step('X5 : feuille certaine (exact) → nœud précis conservé, sans signal de précision', n.c === 'electricite_panne' && n.s === 'derived_leaf', JSON.stringify(n));
    n = await node('oc-leaf'); step('X5 : feuille ambiguë (split sur 3 spécialités de la plomberie) → métier parent, besoin de précision signalé, spécialité jamais choisie', n.c === 'plomberie' && n.s === 'derived_leaf_parent', JSON.stringify(n));
    n = await node('oc-leaf-cross'); step('X5 : feuille qui recouvre plusieurs métiers → aucun rattachement (à classer)', n.c === null && n.s === null, JSON.stringify(n));
    n = await node('oc-cat'); step('ancien client : catégorie libre exacte → nœud dérivé', n.c === 'plomberie' && n.s === 'derived_category', JSON.stringify(n));
    n = await node('oc-jardinage'); step('ancien client : catégorie « large » → métier de repli, provenance dérivée', n.c === 'jardinage_entretien' && n.s === 'derived_category', JSON.stringify(n));
    n = await node('oc-general'); step('ancien client : « Général » reste à classer (NULL)', n.c === null && n.s === null, JSON.stringify(n));
    n = await node('oc-residu'); step('ancien client : résidu de test reste à classer (NULL)', n.c === null, JSON.stringify(n));
    n = await node('oc-v2'); step('client v2 : valeur explicite jamais écrasée par la catégorie', n.c === 'garde_enfants' && n.s === 'client', JSON.stringify(n));
    n = await node('oc-class'); step('client v2 : provenance « classifier » conservée', n.c === 'plomberie_fuite' && n.s === 'classifier', JSON.stringify(n));
    await db.exec("UPDATE public.requests SET category = 'Piscine' WHERE title = 'oc-cat'");
    n = await node('oc-cat'); step('ancien client modifie la catégorie : nœud dérivé recalculé', n.c === 'piscine_bassin' && n.s === 'derived_category', JSON.stringify(n));
    await db.exec("UPDATE public.requests SET category = 'Piscine' WHERE title = 'oc-v2'");
    n = await node('oc-v2'); step('ancien client écrit une catégorie qui CONTREDIT le nœud explicite : nœud re-dérivé', n.c === 'piscine_bassin' && n.s === 'derived_category', JSON.stringify(n));

    let sn0;
    // Compatibilité des modifications par un ancien client sur une annonce v2 (nœud explicite précis) — jamais de fausse catégorie, jamais de perte gratuite.
    const fuiteLabel = (await rows("SELECT label_fr FROM public.lyann_taxonomy_node WHERE code = 'plomberie_fuite'"))[0].label_fr;
    const poolLeaf = (await rows("SELECT id FROM public.lyann_taxonomy WHERE category = 'Piscine' ORDER BY id LIMIT 1"))[0].id;
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    await db.exec(`INSERT INTO public.requests(title, category, taxonomy_node_code) VALUES ('oc-edit', ${q(fuiteLabel)}, 'plomberie_fuite')`);
    await db.exec('RESET ROLE');
    n = await node('oc-edit'); step('annonce v2 précise : nœud « client » enregistré', n.c === 'plomberie_fuite' && n.s === 'client', JSON.stringify(n));
    const editAs = async (setSql) => { await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`); await db.exec(`UPDATE public.requests SET ${setSql} WHERE title = 'oc-edit'`); await db.exec('RESET ROLE'); return node('oc-edit'); };
    n = await editAs("category = 'Plomberie'"); step('ancien client : catégorie historique du pont (« Plomberie ») → nœud précis conservé', n.c === 'plomberie_fuite' && n.s === 'client', JSON.stringify(n));
    n = await editAs("category = 'Général'"); step('ancien client : repli « Général » → nœud précis conservé', n.c === 'plomberie_fuite' && n.s === 'client', JSON.stringify(n));
    n = await editAs("category = 'Autre / Je ne trouve pas'"); step('ancien client : repli « Autre / Je ne trouve pas » (présélection de l\'ancien assistant) → nœud précis conservé', n.c === 'plomberie_fuite' && n.s === 'client', JSON.stringify(n));
    n = await editAs(`taxonomy_id = '${leafId}', category = 'Plomberie'`); step('ancien client : feuille historique cohérente avec le nœud → conservé', n.c === 'plomberie_fuite' && n.s === 'client', JSON.stringify(n));
    n = await editAs(`taxonomy_id = '${poolLeaf}', category = 'Piscine'`); step('ancien client : feuille d\'une AUTRE catégorie → nœud re-dérivé depuis la feuille', n.c !== 'plomberie_fuite' && /^derived_leaf(_parent)?$/.test(n.s), JSON.stringify(n));
    n = await editAs("taxonomy_id = NULL, category = 'k7mqp4lyannrc'"); step('ancien client : valeur informative sans équivalent fiable → « à classer », jamais un nœud inventé', n.c === null && n.s === null, JSON.stringify(n));
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug, taxonomy_node_code) VALUES ('${userB}', ${q(fuiteLabel)}, ${q(fuiteLabel)}, ${q(fuiteLabel)}, 'oc-s3', 'plomberie_fuite')`);
    await db.exec('RESET ROLE');
    const editSvc = async (title) => { await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`); await db.exec(`UPDATE public.services SET title = ${q(title)} WHERE slug = 'oc-s3'`); await db.exec('RESET ROLE'); return (await rows("SELECT taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE slug = 'oc-s3'"))[0]; };
    const parentLabel = (await rows("SELECT label_fr FROM public.lyann_taxonomy_node WHERE code = 'plomberie'"))[0].label_fr;
    sn0 = await editSvc(parentLabel + ' · ' + fuiteLabel); step('compétence : titre composé « Métier · Spécialité » → nœud précis conservé', sn0.c === 'plomberie_fuite' && sn0.s === 'client', JSON.stringify(sn0));
    sn0 = await editSvc('Plomberie'); step('compétence : titre du métier parent → nœud précis conservé (cohérent)', sn0.c === 'plomberie_fuite' && sn0.s === 'client', JSON.stringify(sn0));
    sn0 = await editSvc('Piscine'); step('compétence : titre sans rapport → re-dérivé depuis le titre', sn0.c !== 'plomberie_fuite', JSON.stringify(sn0));
    await db.exec('BEGIN');
    await db.exec('ALTER TABLE public.lyann_taxonomy_legacy_map RENAME TO lyann_taxonomy_legacy_map_x');
    let failOpen = true; try { await db.exec("INSERT INTO public.requests(title, category) VALUES ('oc-failopen', 'Plomberie')"); } catch (_) { failOpen = false; }
    n = failOpen ? await node('oc-failopen') : null;
    await db.exec('ROLLBACK');
    step('fail-open : anomalie de taxonomie → écriture acceptée, nœud NULL', failOpen && n && n.c === null, JSON.stringify(n));
    await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`);
    await db.exec("INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('" + userB + "', 'Plomberie', 'Plomberie', 'Plomberie', 'oc-s1'), ('" + userB + "', 'Installation', 'Installation', 'Installation', 'oc-s2')");
    await db.exec('RESET ROLE');
    const sv = async (slug) => (await rows(`SELECT taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE slug = ${q(slug)}`))[0];
    let sn = await sv('oc-s1'); step('ancien client : compétence « Plomberie » → nœud dérivé du titre', sn.c === 'plomberie' && sn.s === 'derived_title', JSON.stringify(sn));
    sn = await sv('oc-s2'); step('ancien client : compétence ambiguë « Installation » → à classer (NULL)', sn.c === null, JSON.stringify(sn));
    v = await runVerify(['V13', 'V14', 'V18']);
    for (const [id, found] of Object.entries(v)) step(`verify ${id} (après écritures d'anciens clients)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
    await db.exec("DELETE FROM public.requests WHERE title LIKE 'oc-%'");
    await db.exec("DELETE FROM public.services WHERE slug LIKE 'oc-%'");

    // --- Projection historique : un client v2 écrit un nœud, l'ancien client doit pouvoir le retrouver sans fausse catégorie ---
    {
        const pj = async (title) => (await rows(`SELECT r.category c, r.taxonomy_id i, t.subcategory sub, r.taxonomy_node_code n, r.taxonomy_node_source s FROM public.requests r LEFT JOIN public.lyann_taxonomy t ON t.id = r.taxonomy_id WHERE r.title = ${q(title)}`))[0];
        const asB = async (sqlText) => { await db.exec(`SET ROLE authenticated; SET test.uid = '${userB}'`); try { await db.exec(sqlText); } finally { await db.exec('RESET ROLE'); } };
        const unbridged = (await rows(`SELECT code FROM public.lyann_taxonomy_node n WHERE n.selectable AND n.kind <> 'family' AND n.family_code <> 'autres'
            AND NOT EXISTS (SELECT 1 FROM public.lyann_taxonomy_legacy_projection p WHERE p.node_code = n.code) ORDER BY code LIMIT 1`))[0].code;
        const fuite = (await rows("SELECT label_fr FROM public.lyann_taxonomy_node WHERE code = 'plomberie_fuite'"))[0].label_fr;
        await asB(`INSERT INTO public.requests(title, category, taxonomy_node_code) VALUES ('pj-leaf', 'Général', 'plomberie_fuite'), ('pj-label', ${q(fuite)}, 'plomberie_fuite'),
            ('pj-trade', 'Général', 'plomberie'), ('pj-none', 'Général', ${q(unbridged)}), ('pj-chosen', 'Jardinage', 'plomberie_fuite')`);
        await asB(`INSERT INTO public.requests(title, category, taxonomy_node_code, taxonomy_id) VALUES ('pj-leafchosen', 'Plomberie', 'plomberie_fuite', '${poolLeaf}')`);
        let r = await pj('pj-leaf'); step('projection : nœud précis + repli « Général » → feuille et catégorie historiques véridiques', r.c === 'Plomberie' && r.i === leafId && r.n === 'plomberie_fuite' && r.s === 'client', JSON.stringify(r));
        r = await pj('pj-label'); step('projection : libellé v2 recopié dans category → remplacé par la catégorie historique', r.c === 'Plomberie' && r.i === leafId, JSON.stringify(r));
        r = await pj('pj-trade'); step('projection : métier seul → catégorie historique, jamais de sous-catégorie plus précise', r.c === 'Plomberie' && r.i === null, JSON.stringify(r));
        r = await pj('pj-none'); step(`projection : nœud sans pont véridique (${unbridged}) → rien d'écrit, jamais de catégorie inventée`, r.c === 'Général' && r.i === null && r.n === unbridged, JSON.stringify(r));
        r = await pj('pj-chosen'); step('projection : catégorie historique choisie → jamais écrasée', r.c === 'Jardinage' && r.i === null, JSON.stringify(r));
        r = await pj('pj-leafchosen'); step('projection : feuille historique choisie → jamais écrasée', r.i === poolLeaf, JSON.stringify(r));
        await asB("UPDATE public.requests SET taxonomy_node_code = 'plomberie' WHERE title = 'pj-leaf'");
        r = await pj('pj-leaf'); step('projection : le nœud change, champs historiques périmés → recalculés (plus de feuille pour le métier seul)', r.n === 'plomberie' && r.c === 'Plomberie' && r.i === null, JSON.stringify(r));
        await asB("UPDATE public.requests SET taxonomy_node_code = 'plomberie_fuite', category = 'Jardinage' WHERE title = 'pj-leaf'");
        r = await pj('pj-leaf'); step('projection : nœud et catégorie modifiés ensemble → catégorie écrite conservée', r.c === 'Jardinage', JSON.stringify(r));
        await db.exec('BEGIN');
        await db.exec('ALTER TABLE public.lyann_taxonomy_legacy_projection RENAME TO lyann_taxonomy_legacy_projection_x');
        let failOpenP = true; try { await db.exec("INSERT INTO public.requests(title, category, taxonomy_node_code) VALUES ('pj-failopen', 'Général', 'plomberie_fuite')"); } catch (_) { failOpenP = false; }
        r = failOpenP ? await pj('pj-failopen') : null;
        await db.exec('ROLLBACK');
        step('projection fail-open : anomalie → écriture acceptée, champs inchangés', failOpenP && r && r.c === 'Général' && r.n === 'plomberie_fuite', JSON.stringify(r));
        v = await runVerify(['V10']);
        step('verify V10 détecte la seule écriture contradictoire (nœud « plomberie_fuite » + feuille « Piscine » écrites par un client)', (v.V10 || []).length === 1, JSON.stringify(v.V10));
        await db.exec("DELETE FROM public.requests WHERE title = 'pj-leafchosen'");
        v = await runVerify(['V10', 'V13', 'V14']);
        for (const [id, found] of Object.entries(v)) step(`verify ${id} (après projections)`, found.length === 0, found.length ? JSON.stringify(found.slice(0, 3)) : '');
        await db.exec("DELETE FROM public.requests WHERE title LIKE 'pj-%'");
    }

    // --- Contrôle négatif : les vérifications détectent bien une anomalie (annulée ensuite) ---
    await db.exec('BEGIN');
    await db.exec("INSERT INTO public.lyann_taxonomy_node(code, kind, parent_code, family_code, label_fr) VALUES ('zz_neg_spec', 'specialty', 'plomberie', 'jardin', 'Anomalie volontaire')");
    const neg = await runVerify(['V02']);
    await db.exec('ROLLBACK');
    step('contrôle négatif : V02 détecte une spécialité incohérente', (neg.V02 || []).length === 1, JSON.stringify(neg.V02));
    const source = await rows("SELECT taxonomy_node_source s, count(*) n FROM public.requests WHERE taxonomy_node_source LIKE 'backfill\\_%' GROUP BY 1 ORDER BY 1");
    report.requestSources = Object.fromEntries(source.map((r) => [r.s, Number(r.n)]));
    step('provenance du backfill renseignée', source.reduce((a, r) => a + Number(r.n), 0) === report.requestCoverage.v2, JSON.stringify(report.requestSources));
    // Décision X5 : bilan de la résolution des valeurs historiques (jamais de spécialité inventée)
    const x5 = await rows(`SELECT m.legacy_kind k, m.mapping_kind mk, c.precision_needed p, c.node_code IS NULL AS nul, count(*) n FROM public.lyann_taxonomy_legacy_map m
        CROSS JOIN LATERAL public.lyann_legacy_certain_node(m.legacy_kind, m.legacy_key) c WHERE m.legacy_kind IN ('taxonomy_leaf', 'skill_title', 'request_category') GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`);
    report.x5 = x5.map((r) => ({ kind: r.k, mapping: r.mk, parent: r.p, none: r.nul, n: Number(r.n) }));
    const leafParents = (await rows("SELECT count(*) n FROM public.lyann_taxonomy t JOIN public.lyann_taxonomy_node n ON n.code = t.node_code WHERE n.kind = 'trade' AND EXISTS (SELECT 1 FROM public.lyann_taxonomy_legacy_map m WHERE m.legacy_kind='taxonomy_leaf' AND m.legacy_key = t.universe||'|'||t.category||'|'||t.subcategory AND m.mapping_kind IN ('split','merge','ambiguous') AND cardinality(m.alt_codes) > 0)"))[0].n;
    report.crossTradeLeaves = (await rows('SELECT universe||\'|\'||category||\'|\'||subcategory leaf FROM public.lyann_taxonomy WHERE node_code IS NULL ORDER BY 1')).map((r) => r.leaf);
    step('X5 : aucune feuille ambiguë ne désigne une spécialité (V18) ; les feuilles multi-métiers restent sans nœud', report.crossTradeLeaves.length > 0 && Number(leafParents) > 0, `${leafParents} feuilles → métier parent ; ${report.crossTradeLeaves.length} multi-métiers`);
    await db.exec('BEGIN');
    await db.exec(`INSERT INTO public.requests(title, category, taxonomy_id, taxonomy_node_code, taxonomy_node_source) VALUES ('zz-neg-x5', 'Plomberie', '${leafId}', 'plomberie_debouchage', 'backfill_leaf')`);
    const negX5 = await runVerify(['V18']);
    await db.exec('ROLLBACK');
    step('contrôle négatif : V18 détecte une spécialité choisie à partir d\'une feuille ambiguë', (negX5.V18 || []).length === 1, JSON.stringify(negX5.V18));

    // --- Rollback ---
    await db.exec(`DELETE FROM public.services WHERE owner_id='${userB}'`);
    try { await db.exec(read('09_rollback_taxonomy_v2.sql')); step('appliquer 09_rollback_taxonomy_v2.sql', true); } catch (e) { step('appliquer 09_rollback_taxonomy_v2.sql', false, e.message); return report; }
    step('rollback : état initial restitué à l\'identique', (await fingerprint()) === before);
    step('rollback : la RPC d\'enregistrement des compétences est restituée à l\'identique de la migration 83', (await skillsFn()) === skillsFnBefore);
    const left = await rows("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND (relname LIKE 'lyann_taxonomy_%' OR relname='lyann_profile_skill') AND relkind IN ('r','v')");
    step('rollback : aucune table v2 résiduelle', left.length === 0, left.map((r) => r.relname).join(','));
    const cols = await rows("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('taxonomy_node_code','node_code')");
    step('rollback : aucune colonne v2 résiduelle', cols.length === 0);
    // Rejouable : appliquer à nouveau après rollback
    try { await db.exec(read('01_schema_taxonomy_v2.sql')); await db.exec(read('02_additive_columns.sql')); await db.exec(read('03_search_and_skills_rpc.sql')); await db.exec(read('04_seed_taxonomy_v2.sql')); await db.exec(read('05_legacy_map_and_backfill.sql')); await db.exec(read('06_dual_write_derivation.sql')); await db.exec(read('08_legacy_projection.sql')); step('rejouable après rollback', true); } catch (e) { step('rejouable après rollback', false, e.message); }
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
