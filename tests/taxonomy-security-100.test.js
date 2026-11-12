'use strict';
/*
 * Correctif de sécurité 100 (services : TRUNCATE, TRIGGER, REFERENCES) — preuves locales sur PGlite, aucun réseau, rien d'appliqué ailleurs.
 * Le fichier testé est le vrai brouillon (docs/taxonomy/security-draft), pas une copie.
 * Les cas couvrent : effet, effets de bord (politiques, droits ordinaires, FK, déclencheurs, RLS), idempotence, droits effectifs par héritage,
 * garde de dépendances (routine SECURITY INVOKER), refus atomique, rollback fidèle.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SECURITY = path.join(__dirname, '..', 'docs', 'taxonomy', 'security-draft');
const APPLY = fs.readFileSync(path.join(SECURITY, '100_services_dangerous_privileges_staging.sql'), 'utf8');
const ROLLBACK = fs.readFileSync(path.join(SECURITY, '100_services_dangerous_privileges_rollback.sql'), 'utf8');

function loadPglite() {
    for (const t of [() => require('@electric-sql/pglite'), () => require(path.join(process.env.PGLITE_PATH || '', '@electric-sql/pglite'))]) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}

/** Base minimale « comme Staging » : les trois rôles exposés portent tous les privilèges de table (constat P08), RLS active, FK et déclencheur. */
async function stagingLikeDb(pglite, extra = '') {
    const db = new pglite.PGlite();
    await db.exec(`
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        CREATE ROLE authenticator NOLOGIN NOINHERIT; GRANT anon, authenticated TO authenticator;
        CREATE ROLE app_member NOLOGIN INHERIT; GRANT authenticated TO app_member;
        CREATE SCHEMA IF NOT EXISTS auth;
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
    SELECT coalesce(string_agg(g || ':' || p, ',' ORDER BY g, p), '') AS s FROM (
        SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS g, a.privilege_type AS p
        FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid = 'public.services'::regclass) x`)).rows[0].s;
const has = async (db, role, priv) => (await db.query(`SELECT has_table_privilege('${role}', 'public.services', '${priv}') AS ok`)).rows[0].ok;
const policies = async (db) => (await db.query("SELECT md5(string_agg(policyname || cmd || roles::text || coalesce(qual, '') || coalesce(with_check, ''), '|' ORDER BY policyname)) AS h FROM pg_policies WHERE tablename = 'services'")).rows[0].h;
const STRUCTURAL = ['TRUNCATE', 'TRIGGER', 'REFERENCES'];

test('100 : retire TRUNCATE, TRIGGER, REFERENCES à anon et authenticated (droits effectifs, y compris par héritage), sans toucher au reste', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite);
    for (const r of ['anon', 'authenticated', 'app_member']) for (const p of STRUCTURAL) assert.equal(await has(db, r, p), r !== 'authenticator', `${r}:${p} avant`);
    const polBefore = await policies(db);
    const aclBefore = await aclSet(db);
    await db.exec(APPLY);
    for (const r of ['anon', 'authenticated', 'app_member', 'authenticator']) for (const p of STRUCTURAL) assert.equal(await has(db, r, p), false, `${r}:${p} après`);
    for (const p of STRUCTURAL) { assert.equal(await has(db, 'service_role', p), true, `service_role:${p}`); }
    assert.equal(await has(db, 'postgres', 'TRUNCATE'), true);
    for (const r of ['anon', 'authenticated']) for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await has(db, r, p), true, `${r}:${p} conservé`);
    assert.equal(await policies(db), polBefore, 'politiques RLS inchangées');
    const aclAfter = new Set((await aclSet(db)).split(','));
    const removed = aclBefore.split(',').filter((x) => !aclAfter.has(x));
    assert.deepEqual(removed.sort(), ['anon:REFERENCES', 'anon:TRIGGER', 'anon:TRUNCATE', 'authenticated:REFERENCES', 'authenticated:TRIGGER', 'authenticated:TRUNCATE'], 'exactement six droits retirés');
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.services'::regclass")).rows[0].relrowsecurity, true);
    await db.close();
});

test('100 : le chemin de données des rôles exposés fonctionne après correction (RLS, déclencheur, clé étrangère) ; TRUNCATE est refusé', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite);
    await db.exec(APPLY);
    await db.exec("SET ROLE authenticated");
    await db.exec("INSERT INTO public.services(id, title, category) VALUES ('00000000-0000-0000-0000-0000000000a1', 'Plomberie', 'Plomberie')");
    await db.exec("UPDATE public.services SET title = 'Plomberie 2' WHERE id = '00000000-0000-0000-0000-0000000000a1'");
    assert.equal((await db.query("SELECT count(*)::int n FROM public.services")).rows[0].n, 1);
    await db.exec("RESET ROLE");
    assert.equal((await db.query('SELECT count(*)::int n FROM public.service_log')).rows[0].n, 2, 'le déclencheur (propriétaire) a tourné pour INSERT et UPDATE');
    await db.exec("INSERT INTO public.service_reviews(related_service_id) VALUES ('00000000-0000-0000-0000-0000000000a1')");
    await db.exec("SET ROLE authenticated; DELETE FROM public.services WHERE id = '00000000-0000-0000-0000-0000000000a1'; RESET ROLE");
    assert.equal((await db.query('SELECT related_service_id r FROM public.service_reviews')).rows[0].r, null, 'ON DELETE SET NULL fonctionne avec les droits du propriétaire');
    for (const role of ['anon', 'authenticated', 'app_member']) {
        await assert.rejects(async () => { await db.exec(`SET ROLE ${role}; TRUNCATE public.services`); }, /permission denied/, `${role} TRUNCATE`);
        await db.exec('RESET ROLE');
    }
    await assert.rejects(async () => { await db.exec('SET ROLE authenticated; ALTER TABLE public.services ADD CONSTRAINT x FOREIGN KEY (owner_id) REFERENCES public.services(id)'); }, /permission denied|must be owner/);
    await db.exec('RESET ROLE');
    await db.close();
});

test('100 : idempotente (deuxième application sans effet) et PUBLIC est traité', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite, 'GRANT TRUNCATE ON public.services TO PUBLIC;');
    assert.equal(await has(db, 'app_member', 'TRUNCATE'), true);
    await db.exec(APPLY);
    const once = await aclSet(db);
    assert.doesNotMatch(once, /PUBLIC:(TRUNCATE|TRIGGER|REFERENCES)/);
    await db.exec(APPLY);
    assert.equal(await aclSet(db), once);
    await db.close();
});

test('100 : une routine SECURITY INVOKER qui s\'appuie sur un droit structurel arrête la migration, rien n\'est modifié', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const cases = {
        'TRUNCATE': 'CREATE FUNCTION public.purge_services() RETURNS void LANGUAGE plpgsql AS $$ BEGIN TRUNCATE public.services; END $$;',
        'TRUNCATE sans schéma': 'CREATE FUNCTION public.purge_services() RETURNS void LANGUAGE plpgsql AS $$ BEGIN TRUNCATE TABLE services; END $$;',
        'création de déclencheur': 'CREATE FUNCTION public.add_trigger() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE \'CREATE TRIGGER z AFTER INSERT ON public.services FOR EACH ROW EXECUTE FUNCTION public.log_service()\'; END $$;',
        'création de clé étrangère': 'CREATE FUNCTION public.add_fk() RETURNS void LANGUAGE plpgsql AS $$ BEGIN EXECUTE \'ALTER TABLE public.service_log ADD COLUMN s uuid REFERENCES public.services(id)\'; END $$;',
    };
    for (const [name, ddl] of Object.entries(cases)) {
        const db = await stagingLikeDb(pglite, ddl);
        const before = await aclSet(db);
        await assert.rejects(async () => { await db.exec(APPLY); }, /SECURITY INVOKER routine/, name);
        try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
        assert.equal(await aclSet(db), before, `${name} : droits intacts après refus`);
        await db.close();
    }
    // La même routine en SECURITY DEFINER (propriétaire) n'est pas concernée.
    const ok = await stagingLikeDb(pglite, 'CREATE FUNCTION public.purge_services() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN TRUNCATE public.services; END $$;');
    await ok.exec(APPLY);
    assert.equal(await has(ok, 'authenticated', 'TRUNCATE'), false);
    await ok.close();
});

test('100 : refus atomique si le résultat n\'est pas exactement celui préparé (droit hérité d\'un rôle tiers déjà accordé avec GRANT OPTION)', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    // anon a reçu TRUNCATE avec GRANT OPTION et l'a transmis : un REVOKE sans CASCADE doit échouer proprement, rien n'est modifié.
    const db = await stagingLikeDb(pglite, `
        CREATE ROLE relais NOLOGIN;
        GRANT TRUNCATE ON public.services TO anon WITH GRANT OPTION;
        SET ROLE anon; GRANT TRUNCATE ON public.services TO relais; RESET ROLE;`);
    const before = await aclSet(db);
    await assert.rejects(async () => { await db.exec(APPLY); }, /dependent privileges/);
    try { await db.exec('ROLLBACK'); } catch (_) { /* déjà annulée */ }
    assert.equal(await aclSet(db), before, 'état identique après refus');
    await db.close();
});

test('100 : le rollback restitue exactement les droits d\'origine de anon et authenticated, sans toucher aux politiques', async (t) => {
    const pglite = loadPglite();
    if (!pglite) { t.skip('PGlite absent'); return; }
    const db = await stagingLikeDb(pglite);
    const aclBefore = await aclSet(db);
    const polBefore = await policies(db);
    await db.exec(APPLY);
    assert.notEqual(await aclSet(db), aclBefore);
    await db.exec(ROLLBACK);
    assert.equal(await aclSet(db), aclBefore, 'ensemble de droits identique à l\'origine');
    assert.equal(await policies(db), polBefore);
    await db.close();
});

test('100 : fichiers prêts mais jamais exécutables par un script de l\'application (aucune référence ailleurs que les bancs et ce test)', () => {
    const root = path.join(__dirname, '..');
    const refs = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (['node_modules', '.git', 'artifacts', 'www', 'ios', 'android', 'work'].includes(e.name)) continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|json|yml|yaml)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('100_services_dangerous_privileges')) refs.push(path.relative(root, p));
        }
    };
    walk(root);
    const allowed = new Set(['scripts/taxonomy-v2/validate-quotas-pglite.js', 'tests/taxonomy-quota.test.js', 'tests/taxonomy-security-100.test.js']);
    assert.deepEqual(refs.filter((r) => !allowed.has(r) && !/^tests\/taxonomy-(p45|security-101)/.test(r) && !/^scripts\/taxonomy-v2\/p45-/.test(r)), []);
});
