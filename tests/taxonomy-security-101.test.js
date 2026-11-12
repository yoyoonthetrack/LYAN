'use strict';
/*
 * Correctif de sécurité 101 (services : MAINTAIN) — preuves locales sur PGlite, aucun réseau. Le fichier testé est le vrai brouillon, pas une copie.
 * Cas : effet exact (deux rôles, PUBLIC), effets de bord (politiques, autres droits, FK, déclencheurs, RLS), idempotence, droits effectifs par héritage,
 * rôle prédéfini pg_maintain, garde de dépendances (routine SECURITY INVOKER), refus atomique (GRANT OPTION), rollback fidèle, MAINTAIN réellement refusé.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SECURITY = path.join(__dirname, '..', 'docs', 'taxonomy', 'security-draft');
const APPLY = fs.readFileSync(path.join(SECURITY, '101_services_maintain_privilege_staging.sql'), 'utf8');
const ROLLBACK = fs.readFileSync(path.join(SECURITY, '101_services_maintain_privilege_rollback.sql'), 'utf8');
const APPLY_100 = fs.readFileSync(path.join(SECURITY, '100_services_dangerous_privileges_staging.sql'), 'utf8');

function loadPglite() {
    for (const t of [() => require('@electric-sql/pglite'), () => require(path.join(process.env.PGLITE_PATH || '', '@electric-sql/pglite'))]) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}

/** Base « comme Staging après S100 » : anon et authenticated portent SELECT, INSERT, UPDATE, DELETE et MAINTAIN ; service_role tout. */
async function stagingLikeDb(pglite, extra = '') {
    const db = new pglite.PGlite();
    await db.exec(`
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE ROLE authenticator NOLOGIN NOINHERIT; GRANT anon, authenticated TO authenticator;
        CREATE ROLE app_member NOLOGIN INHERIT; GRANT authenticated TO app_member;
        CREATE TABLE public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, title text, category text, active boolean DEFAULT true);
        CREATE TABLE public.service_reviews (id serial PRIMARY KEY, related_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL);
        CREATE TABLE public.service_log (n int);
        CREATE FUNCTION public.log_service() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN INSERT INTO public.service_log VALUES (1); RETURN NEW; END $$;
        CREATE TRIGGER services_log AFTER INSERT OR UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.log_service();
        ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
        CREATE POLICY services_read ON public.services FOR SELECT TO anon, authenticated USING (active);
        CREATE POLICY services_write ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
        GRANT ALL ON public.services TO anon, authenticated, service_role;
        GRANT ALL ON public.service_log, public.service_reviews TO anon, authenticated, service_role;
        ${extra}
    `);
    return db;
}

const aclSet = async (db) => (await db.query(`
    SELECT coalesce(string_agg(g || ':' || p || ':' || gr, ',' ORDER BY g, p), '') AS s FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS g, a.privilege_type AS p, a.is_grantable AS gr
        FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid = 'public.services'::regclass) x`)).rows[0].s;
const has = async (db, role, priv) => (await db.query(`SELECT has_table_privilege('${role}', 'public.services', '${priv}') AS ok`)).rows[0].ok;
const policies = async (db) => (await db.query("SELECT md5(string_agg(policyname || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, ''), '|' ORDER BY policyname)) AS h FROM pg_policies WHERE tablename = 'services'")).rows[0].h;

test('101 : retire MAINTAIN à anon et authenticated (droits effectifs, y compris par héritage), exactement deux droits, sans toucher au reste', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite);
    for (const r of ['anon', 'authenticated', 'app_member']) assert.equal(await has(db, r, 'MAINTAIN'), true, `${r} avant`);
    assert.equal(await has(db, 'authenticator', 'MAINTAIN'), false, 'authenticator est NOINHERIT : aucun droit direct');
    const before = await aclSet(db); const pol = await policies(db);
    await db.exec(APPLY);
    for (const r of ['anon', 'authenticated', 'app_member', 'authenticator']) assert.equal(await has(db, r, 'MAINTAIN'), false, `${r} après`);
    for (const r of ['service_role', 'postgres']) assert.equal(await has(db, r, 'MAINTAIN'), true, `${r} conserve MAINTAIN`);
    for (const r of ['anon', 'authenticated']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) assert.equal(await has(db, r, p), true, `${r}:${p} inchangé`);
    const after = new Set((await aclSet(db)).split(','));
    assert.deepEqual(before.split(',').filter((x) => !after.has(x)).sort(), ['anon:MAINTAIN:false', 'authenticated:MAINTAIN:false'], 'exactement deux droits retirés');
    assert.equal([...after].filter((x) => !before.split(',').includes(x)).length, 0, 'aucun droit ajouté');
    assert.equal(await policies(db), pol);
    assert.equal((await db.query("SELECT relrowsecurity r, relforcerowsecurity f FROM pg_class WHERE oid = 'public.services'::regclass")).rows[0].r, true);
    await db.close();
});

test('101 : MAINTAIN est réellement refusé après correction (REINDEX, CLUSTER) ; le chemin de données (RLS, déclencheur, FK) fonctionne ; service_role garde l\'administration', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite, 'INSERT INTO public.services(title, category) VALUES (\'a\', \'a\');');
    const maint = ['REINDEX TABLE public.services', 'CLUSTER public.services USING services_pkey'];
    // Avant : les rôles exposés pouvaient lancer des opérations de maintenance sur la table.
    for (const role of ['anon', 'authenticated']) for (const stmt of maint) await db.exec(`SET ROLE ${role}; ${stmt}; RESET ROLE`);
    await db.exec(APPLY);
    for (const role of ['anon', 'authenticated', 'app_member']) for (const stmt of maint) {
        await assert.rejects(async () => { await db.exec(`SET ROLE ${role}; ${stmt}`); }, /must be owner|permission denied/, `${role} ${stmt}`);
        await db.exec('RESET ROLE');
    }
    for (const stmt of maint) await db.exec(`SET ROLE service_role; ${stmt}; RESET ROLE`);
    // Limite connue et documentée : un verrou exclusif reste permis par UPDATE/DELETE (règle de PostgreSQL), indépendamment de MAINTAIN.
    await db.exec('BEGIN; SET LOCAL ROLE anon; LOCK TABLE public.services IN ACCESS EXCLUSIVE MODE; COMMIT; RESET ROLE');
    await db.exec('DELETE FROM public.services');
    await db.exec("SET ROLE authenticated");
    await db.exec("INSERT INTO public.services(id, title, category) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Plomberie', 'Plomberie')");
    await db.exec("UPDATE public.services SET title = 'Plomberie 2' WHERE id = '00000000-0000-0000-0000-0000000000a1'");
    assert.equal((await db.query('SELECT count(*)::int n FROM public.services')).rows[0].n, 1);
    await db.exec('RESET ROLE');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.service_log')).rows[0].n, 3, 'le déclencheur a tourné (insertion initiale, insertion, mise à jour)');
    await db.exec("INSERT INTO public.service_reviews(related_service_id) VALUES ('00000000-0000-0000-0000-0000000000a1')");
    await db.exec("SET ROLE authenticated; DELETE FROM public.services WHERE id = '00000000-0000-0000-0000-0000000000a1'; RESET ROLE");
    assert.equal((await db.query('SELECT related_service_id r FROM public.service_reviews')).rows[0].r, null, 'ON DELETE SET NULL');
    await db.exec('SET ROLE anon');
    assert.equal((await db.query('SELECT count(*)::int n FROM public.services')).rows[0].n, 0);
    await db.exec('RESET ROLE');
    await db.close();
});

test('101 : suite de 100 (dans les deux ordres) : le résultat est identique ; aucun autre privilège ne bouge', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const ab = await stagingLikeDb(pglite); await ab.exec(APPLY_100); await ab.exec(APPLY);
    const ba = await stagingLikeDb(pglite); await ba.exec(APPLY); await ba.exec(APPLY_100);
    const a = await aclSet(ab);
    assert.equal(a, await aclSet(ba), 'même ACL quel que soit l\'ordre');
    for (const r of ['anon', 'authenticated']) assert.deepEqual(a.split(',').filter((x) => x.startsWith(`${r}:`)).map((x) => x.split(':')[1]), ['DELETE', 'INSERT', 'SELECT', 'UPDATE'], `${r} : lecture et écriture seulement`);
    assert.ok(a.includes('service_role:MAINTAIN') && a.includes('service_role:TRUNCATE') && a.includes('postgres:MAINTAIN'), 'rôles internes intacts');
    await ab.close(); await ba.close();
});

test('101 : idempotente (deuxième application sans effet) et PUBLIC est traité', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite, 'GRANT MAINTAIN ON public.services TO PUBLIC;');
    assert.equal(await has(db, 'app_member', 'MAINTAIN'), true);
    await db.exec(APPLY);
    const once = await aclSet(db);
    assert.doesNotMatch(once, /PUBLIC:MAINTAIN/);
    await db.exec(APPLY);
    assert.equal(await aclSet(db), once);
    await db.close();
});

test('101 : un droit hérité du rôle prédéfini pg_maintain arrête la migration AVANT toute écriture (un REVOKE de table ne le retirerait pas)', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    for (const [name, extra] of Object.entries({ 'authenticated membre': 'GRANT pg_maintain TO authenticated;', 'anon membre': 'GRANT pg_maintain TO anon;', 'membre indirect': 'GRANT pg_maintain TO app_member; GRANT app_member TO anon;' })) {
        const db = await stagingLikeDb(pglite, extra);
        const before = await aclSet(db);
        await assert.rejects(async () => { await db.exec(APPLY); }, /pg_maintain/, name);
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        assert.equal(await aclSet(db), before, `${name} : droits intacts après refus`);
        await db.close();
    }
});

test('101 : une routine SECURITY INVOKER qui lance une commande de maintenance sur services arrête la migration, rien n\'est modifié ; SECURITY DEFINER ou autre table : non concernée', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const cases = {
        'ANALYZE': 'CREATE FUNCTION public.refresh_stats() RETURNS void LANGUAGE plpgsql AS $$ BEGIN ANALYZE public.services; END $$;',
        'VACUUM dynamique': 'CREATE FUNCTION public.vac() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE \'VACUUM services\'; END $$;',
        'REINDEX': 'CREATE FUNCTION public.rx() RETURNS void LANGUAGE sql AS $$ REINDEX TABLE public.services $$;',
    };
    for (const [name, ddl] of Object.entries(cases)) {
        const db = await stagingLikeDb(pglite, ddl);
        const before = await aclSet(db);
        await assert.rejects(async () => { await db.exec(APPLY); }, /SECURITY INVOKER routine/, name);
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        assert.equal(await aclSet(db), before, `${name} : droits intacts après refus`);
        await db.close();
    }
    const definer = await stagingLikeDb(pglite, 'CREATE FUNCTION public.refresh_stats() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN ANALYZE public.services; END $$;');
    await definer.exec(APPLY);
    assert.equal(await has(definer, 'anon', 'MAINTAIN'), false);
    await definer.close();
    const other = await stagingLikeDb(pglite, 'CREATE FUNCTION public.refresh_stats() RETURNS void LANGUAGE plpgsql AS $$ BEGIN ANALYZE public.service_log; END $$;');
    await other.exec(APPLY);
    assert.equal(await has(other, 'anon', 'MAINTAIN'), false);
    await other.close();
});

test('101 : refus atomique si un droit transmis avec GRANT OPTION empêche le retrait exact', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite, `
        CREATE ROLE relais NOLOGIN;
        GRANT MAINTAIN ON public.services TO anon WITH GRANT OPTION;
        SET ROLE anon; GRANT MAINTAIN ON public.services TO relais; RESET ROLE;`);
    const before = await aclSet(db);
    await assert.rejects(async () => { await db.exec(APPLY); }, /dependent privileges/);
    try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
    assert.equal(await aclSet(db), before, 'état identique après refus');
    await db.close();
});

test('101 : le rollback restitue exactement l\'ACL d\'origine (non transmissible, donneur propriétaire), sans toucher aux politiques ni à 100', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite);
    await db.exec(APPLY_100);
    const aclBefore = await aclSet(db); const raw = (await db.query("SELECT relacl::text a FROM pg_class WHERE oid = 'public.services'::regclass")).rows[0].a;
    const pol = await policies(db);
    await db.exec(APPLY);
    assert.notEqual(await aclSet(db), aclBefore);
    await db.exec(ROLLBACK);
    assert.equal(await aclSet(db), aclBefore, 'ensemble de droits identique à l\'origine');
    assert.equal(await policies(db), pol);
    // Même forme d'ACL (aclitem) : anon=arwdm/postgres, authenticated=arwdm/postgres — le texte exact peut seulement différer par l'ordre des éléments.
    const sorted = (a) => a.replace(/[{}]/g, '').split(',').sort().join(',');
    assert.equal(sorted((await db.query("SELECT relacl::text a FROM pg_class WHERE oid = 'public.services'::regclass")).rows[0].a), sorted(raw));
    for (const r of ['anon', 'authenticated']) for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) assert.equal(await has(db, r, p), false, `${r}:${p} reste retiré par 100`);
    await db.close();
});

test('101 : fichiers prêts mais jamais exécutables par un script de l\'application (références limitées aux bancs et aux tests)', () => {
    const root = path.join(__dirname, '..');
    const refs = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', '.git', 'artifacts', 'www', 'ios', 'android', 'work'].includes(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|json|yml|yaml)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('101_services_maintain_privilege')) refs.push(path.relative(root, p));
        }
    };
    walk(root);
    assert.deepEqual(refs.filter((r) => !/^tests\/taxonomy-(p45|security-101)/.test(r) && !/^scripts\/taxonomy-v2\/p45-/.test(r)), []);
});
