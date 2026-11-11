'use strict';
/*
 * Compétences sans nœud après P5 (52 sur 208 sur Staging) : analyse déterministe et RPC de précision par le membre (post-migration, non appliquée).
 * Banc : PGlite local (dépendance optionnelle). Aucun réseau, aucune écriture ailleurs que dans la base du banc.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const skills = require('../scripts/taxonomy-v2/unattached-skills');
const DRAFT = path.join(ROOT, 'docs', 'taxonomy', 'migration-draft');
const POST = path.join(ROOT, 'docs', 'taxonomy', 'post-migration-draft');
const GEN = path.join(ROOT, 'docs', 'taxonomy', 'generated');

test('analyse : 208 compétences Staging, 156 rattachées par 05, 52 non rattachées — chiffres identiques à la mesure P3', () => {
    const r = skills.analyse();
    assert.equal(r.totals.services, 208);
    assert.equal(r.totals.attached, 156, 'V11 de P3 : 156 compétences rattachées');
    assert.equal(r.totals.unattached, 52);
    assert.equal(r.totals.unattachedTitles, 23);
    assert.equal(r.buckets.recoverable.rows + r.buckets.needs_member_precision.rows + r.buckets.out_of_reference.rows, 52);
});

test('analyse : aucune non-rattachée n\'est « récupérable sans ambiguïté » — théorème, pas un oubli (un titre à un seul métier est déjà rattaché par 05)', () => {
    const r = skills.analyse();
    assert.deepEqual(r.buckets.recoverable, { rows: 0, titles: 0 });
    for (const item of r.items) assert.ok(item.candidateTrades >= 2, `${item.title} : ${item.candidateTrades} métier(s)`);
    // Et inversement : la règle sait reconnaître un titre à un seul métier.
    assert.equal(skills.bucketFor('plomberie', ['plomberie']), 'recoverable');
});

test('analyse : répartition 48 précision du membre / 4 hors référentiel ou trop général, chaque non-rattachée porte sa liste de candidats issue de la table', () => {
    const r = skills.analyse();
    assert.deepEqual(r.buckets.needs_member_precision, { rows: 48, titles: 21 });
    assert.deepEqual(r.buckets.out_of_reference, { rows: 4, titles: 2 });
    assert.deepEqual(r.items.filter((i) => i.bucket === 'out_of_reference').map((i) => i.title).sort(), ['dépannage', 'musique, concert, événement, cours de batterie,']);
    for (const item of r.items) {
        assert.ok(item.candidates.length >= 2, item.title);
        assert.ok(item.candidates.every((c) => c.selectable), `${item.title} : un candidat non sélectionnable ne doit jamais être proposé`);
        assert.equal(item.suggestionFirst, item.candidates[0].code, 'le premier candidat est la cible par défaut de la table, présentée en premier, jamais écrite');
    }
    const courses = r.items.find((i) => i.title === 'courses');
    assert.deepEqual(courses.candidates.map((c) => c.code), ['courses_commissions', 'colis_livraison']);
});

test('analyse : la règle de bucket est stable (cas synthétiques)', () => {
    assert.equal(skills.bucketFor('cuisine', ['a', 'b']), 'needs_member_precision');
    assert.equal(skills.bucketFor('x', ['a', 'b', 'c', 'd']), 'needs_member_precision');
    assert.equal(skills.bucketFor('x', ['a', 'b', 'c', 'd', 'e']), 'out_of_reference');
    assert.equal(skills.bucketFor('musique, concert', ['a', 'b']), 'out_of_reference');
    assert.equal(skills.bucketFor('a; b', ['a', 'b']), 'out_of_reference');
});

test('analyse : les fichiers générés sont à jour (aucune dérive entre la source et le rapport committé)', () => {
    const r = skills.analyse();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(GEN, 'unattached-skills.json'), 'utf8')), JSON.parse(JSON.stringify(r)));
    assert.equal(fs.readFileSync(path.join(GEN, 'unattached-skills.csv'), 'utf8'), skills.toCsv(r));
    const json = fs.readFileSync(path.join(GEN, 'unattached-skills.json'), 'utf8');
    assert.doesNotMatch(json, /owner_id|user_id|@|uuid/i, 'aucune donnée personnelle ni identifiant');
});

const loadPglite = () => {
    const bench = require('../scripts/taxonomy-v2/validate-sql-pglite');
    return bench;
};

/** Applique 01-06 et 08 sur la base du banc, puis le fichier 10. */
async function applyV2(db, withTen = true) {
    for (const f of ['01_schema_taxonomy_v2.sql', '02_additive_columns.sql', '03_search_and_skills_rpc.sql', '04_seed_taxonomy_v2.sql', '05_legacy_map_and_backfill.sql', '06_dual_write_derivation.sql', '08_legacy_projection.sql']) {
        await db.exec(fs.readFileSync(path.join(DRAFT, f), 'utf8'));
    }
    if (withTen) await db.exec(fs.readFileSync(path.join(POST, '10_resolve_legacy_skill.sql'), 'utf8'));
}

test('RPC 10 (banc) : le membre précise le métier ; seul le nœud change ; le quota, le titre, la catégorie, le prix et l\'état sont intacts', async (t) => {
    const { run } = loadPglite();
    const out = {};
    const report = await run({
        onlyAfterSetup: true,
        afterSetup: async ({ db, rows, userA, userB }) => {
            await applyV2(db);
            const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
            // Compétences « à titre ambigu » écrites comme un ancien client : le rétro-remplissage 05 et la dérivation 06 les laissent sans nœud.
            await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug, base_price, price_type) VALUES
                ('${userA}', 'Courses', 'Je fais les courses', 'Courses', 'amb-1', 12.5, 'hourly'),
                ('${userA}', 'Dépannage', 'Dépannage', 'Dépannage', 'amb-2', NULL, NULL),
                ('${userB}', 'Cuisine', 'Cuisine', 'Cuisine', 'amb-3', NULL, NULL)`);
            const before = await rows("SELECT slug, title, description, category, base_price, price_type, active, is_active, category_id, taxonomy_node_code c FROM public.services WHERE slug LIKE 'amb-%' ORDER BY slug");
            out.unattachedBefore = before.map((r) => r.c);
            const quotaKeys = async (owner) => (await rows(`SELECT count(DISTINCT lyann_service_category(category_id, category))::int n FROM public.services WHERE owner_id = '${owner}'`))[0].n;
            out.quotaBefore = await quotaKeys(userA);
            const id = async (slug) => (await rows(`SELECT id FROM public.services WHERE slug = '${slug}'`))[0].id;
            const asUser = async (uid, sql) => { await db.exec(`SET ROLE authenticated; SET test.uid = '${uid}'`); try { return await rows(sql); } finally { await db.exec("RESET ROLE; SET test.uid = ''"); } };
            const fail = async (uid, sql) => { try { await asUser(uid, sql); return null; } catch (e) { return e; } finally { try { await db.exec("RESET ROLE; SET test.uid = ''"); } catch (_) { /* ok */ } } };
            const call = (service, node) => `SELECT public.lyann_resolve_legacy_skill('${service}', ${node === null ? 'NULL' : q(node)}) AS r`;
            const a1 = await id('amb-1'); const a2 = await id('amb-2'); const b3 = await id('amb-3');

            // 1. Succès du propriétaire.
            out.ok = (await asUser(userA, call(a1, 'courses_commissions')))[0].r;
            out.after = (await rows("SELECT slug, title, description, category, base_price, price_type, active, is_active, category_id, taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE slug = 'amb-1'"))[0];
            out.before1 = before[0];
            out.profileSkill = (await rows(`SELECT count(*)::int n FROM public.lyann_profile_skill WHERE user_id = '${userA}' AND node_code = 'courses_commissions'`))[0].n;
            out.quotaAfter = await quotaKeys(userA);

            // 2. Refus (même message pour « pas à moi » et « inexistant » : pas d'énumération).
            const notMine = await fail(userA, call(b3, 'cuisine_domicile'));
            const missing = await fail(userA, call('00000000-0000-0000-0000-000000000000', 'cuisine_domicile'));
            out.notMine = notMine && { code: notMine.code, message: notMine.message };
            out.missing = missing && { code: missing.code, message: missing.message };
            out.stillNull = (await rows("SELECT taxonomy_node_code c FROM public.services WHERE slug = 'amb-3'"))[0].c;
            const anonymous = await fail('', call(a2, 'plomberie'));
            out.anonymous = anonymous && anonymous.code;
            out.already = (await fail(userA, call(a1, 'colis_livraison'))) && (await fail(userA, call(a1, 'colis_livraison'))).code;
            out.badFormat = [null, 'Plomberie', 'x', "a'b", 'a'.repeat(81), ''].map((n) => ({ n }));
            out.badFormatCodes = [];
            for (const n of [null, 'Plomberie', 'x', "a'b", 'a'.repeat(81)]) { const e = await fail(userA, call(a2, n)); out.badFormatCodes.push(e && e.code); }
            // Nœuds refusés : inconnu, famille, « autres », inactif, non sélectionnable.
            const refusals = {};
            refusals.unknown = await fail(userA, call(a2, 'metier_qui_nexiste_pas'));
            refusals.family = await fail(userA, call(a2, (await rows("SELECT code FROM public.lyann_taxonomy_node WHERE kind = 'family' LIMIT 1"))[0].code));
            const autres = (await rows("SELECT code FROM public.lyann_taxonomy_node WHERE family_code = 'autres' AND kind <> 'family' AND selectable LIMIT 1"));
            refusals.autres = autres.length ? await fail(userA, call(a2, autres[0].code)) : { code: '22023', skipped: true };
            const restricted = await rows("SELECT code FROM public.lyann_taxonomy_node WHERE NOT selectable AND kind <> 'family' LIMIT 1");
            refusals.restricted = restricted.length ? await fail(userA, call(a2, restricted[0].code)) : { code: '22023', skipped: true };
            await db.exec("UPDATE public.lyann_taxonomy_node SET active = false WHERE code = 'plomberie'");
            refusals.inactive = await fail(userA, call(a2, 'plomberie'));
            await db.exec("UPDATE public.lyann_taxonomy_node SET active = true WHERE code = 'plomberie'");
            out.refusals = Object.fromEntries(Object.entries(refusals).map(([k, e]) => [k, e && e.code]));
            out.refusalsMessage = refusals.restricted && refusals.restricted.message;
            out.a2StillNull = (await rows("SELECT taxonomy_node_code c FROM public.services WHERE slug = 'amb-2'"))[0].c;

            // 3. Droits d'exécution : anon n'a pas la fonction.
            try { await db.exec("SET ROLE anon; SELECT public.lyann_resolve_legacy_skill('00000000-0000-0000-0000-000000000000', 'plomberie')"); out.anonExec = 'OUVERT'; } catch (e) { out.anonExec = e.code || e.message; } finally { await db.exec('RESET ROLE'); }

            // 4. Un ancien client qui réécrit son profil conserve la compétence précisée (même titre dans sa liste).
            await asUser(userA, `SELECT public.lyann_sync_profile_skills('${userA}', ARRAY['Courses'])`);
            out.afterOldClient = (await rows("SELECT taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE slug = 'amb-1'"))[0];

            // 5. Rollback de la fonction seule : le choix du membre reste.
            await db.exec(fs.readFileSync(path.join(POST, '10_resolve_legacy_skill_rollback.sql'), 'utf8'));
            out.fnAfterRollback = (await rows("SELECT count(*)::int n FROM pg_proc WHERE proname = 'lyann_resolve_legacy_skill'"))[0].n;
            out.choiceKept = (await rows("SELECT taxonomy_node_code c FROM public.services WHERE slug = 'amb-1'"))[0].c;
        }
    });
    if (report.skipped) { t.skip(report.reason); return; }
    assert.deepEqual(out.unattachedBefore, [null, null, null], 'les trois titres ambigus ne sont pas rattachés (X5)');
    assert.equal(out.ok.success, true);
    assert.equal(out.after.c, 'courses_commissions');
    assert.equal(out.after.s, 'user');
    for (const col of ['title', 'description', 'category', 'base_price', 'price_type', 'active', 'is_active', 'category_id']) assert.equal(out.after[col], out.before1[col], `${col} inchangé`);
    assert.equal(out.profileSkill, 1);
    assert.equal(out.quotaAfter, out.quotaBefore, 'le nombre de clés de quota est inchangé');
    assert.deepEqual(out.notMine, out.missing, 'même réponse pour une compétence d\'autrui et une compétence inexistante');
    assert.equal(out.notMine.code, '42501');
    assert.equal(out.stillNull, null, 'la compétence d\'autrui n\'a pas bougé');
    assert.equal(out.anonymous, '42501');
    assert.equal(out.already, '22023', 'une compétence déjà classée ne se modifie pas par cette fonction');
    assert.deepEqual(out.badFormatCodes, ['22023', '22023', '22023', '22023', '22023']);
    for (const [k, v] of Object.entries(out.refusals)) assert.equal(v, '22023', `nœud refusé : ${k}`);
    assert.equal(out.a2StillNull, null, 'aucun refus n\'a laissé d\'écriture partielle');
    assert.notEqual(out.anonExec, 'OUVERT', 'anon ne peut pas exécuter la fonction');
    assert.deepEqual(out.afterOldClient, { c: 'courses_commissions', s: 'user' }, 'l\'ancien éditeur (83) conserve la compétence précisée');
    assert.equal(out.fnAfterRollback, 0);
    assert.equal(out.choiceKept, 'courses_commissions', 'le rollback de la fonction ne défait pas les choix des membres');
});

test('RPC 10 : fichiers — non appliqués, hors séquence P3, Staging seulement, sans effet externe', () => {
    for (const f of ['10_resolve_legacy_skill.sql', '10_resolve_legacy_skill_rollback.sql']) {
        const sql = fs.readFileSync(path.join(POST, f), 'utf8');
        assert.match(sql.split('\n')[0], /NON APPLIQUÉ/, f);
        assert.doesNotMatch(sql, /gzispjfoywklpqatjyop/, f);
        assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ''), /\b(TRUNCATE|NOTIFY|nextval|DISABLE TRIGGER|session_replication_role|DROP TABLE|DROP POLICY)\b/i, f);
    }
    const apply = fs.readFileSync(path.join(POST, '10_resolve_legacy_skill.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    assert.match(apply, /SECURITY DEFINER SET search_path = public, pg_temp/);
    assert.match(apply, /REVOKE ALL ON FUNCTION public\.lyann_resolve_legacy_skill\(uuid, text\) FROM PUBLIC, anon/);
    assert.match(apply, /GRANT EXECUTE ON FUNCTION public\.lyann_resolve_legacy_skill\(uuid, text\) TO authenticated/);
    // Ce que la RPC écrit dans services : uniquement le nœud et sa provenance.
    const sets = apply.match(/UPDATE public\.services SET ([^;]*?) WHERE/);
    assert.equal(sets[1].replace(/\s+/g, ' '), "taxonomy_node_code = p_node, taxonomy_node_source = 'user'");
    // P3 ne l'inclut pas.
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'scripts', 'taxonomy-v2', 'p3-rehearsal.js'), 'utf8'), /post-migration-draft|10_resolve_legacy_skill/);
});
