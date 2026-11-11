'use strict';
/*
 * Preuve LOCALE (PGlite, aucun réseau) que les nouvelles écritures de compétences de la taxonomie v2 préservent les règles de quotas actuelles.
 *
 * Le code testé n'est pas recopié : la garde `lyann_guard_category_entitlement`, `lyann_service_category`, `lyann_plan_limits`,
 * `lyann_current_plan`, `lyann_entitlements_enforced` et leur déclencheur sont EXTRAITS du fichier réel `82_lyann_entitlement_guards_staging.sql`,
 * l'ancienne RPC `lyann_sync_profile_skills` du fichier réel `83_*`, puis les brouillons 01 → 06 (+ 08) sont appliqués par-dessus.
 *
 * Règle actuelle (migration 82) : le quota de catégories d'un forfait (FREE 1 · PLUS 3 · PRO 5) compte les clés DISTINCTES
 * `lyann_service_category(category_id, category)` des services actifs d'un membre, et ne refuse que si le compte dépasse la limite ET augmente.
 * Aujourd'hui un stub de compétence porte category = title : une compétence = une clé.
 *
 *   PGLITE_PATH=/tmp/pg/node_modules node scripts/taxonomy-v2/validate-quotas-pglite.js
 */
const fs = require('node:fs');
const path = require('node:path');

const { REQUEST_MODERATION_COLUMNS } = require('./moderation-fixture');
const ROOT = path.join(__dirname, '..', '..');
const DRAFT = path.join(ROOT, 'docs', 'taxonomy', 'migration-draft');

function loadPglite() {
    for (const t of [() => require('@electric-sql/pglite'), () => require(path.join(process.env.PGLITE_PATH || '', '@electric-sql/pglite'))]) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}
function loadContrib(name) {
    for (const t of [() => require(`@electric-sql/pglite/contrib/${name}`), () => require(path.join(process.env.PGLITE_PATH || '', `@electric-sql/pglite/contrib/${name}`))]) { try { return t(); } catch (_) { /* suivant */ } }
    return null;
}
const read = (f) => fs.readFileSync(path.join(DRAFT, f), 'utf8');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Extrait de la migration 82 réelle les objets qui portent le quota de catégories. */
function extractQuotaObjects() {
    const src = fs.readFileSync(path.join(ROOT, '82_lyann_entitlement_guards_staging.sql'), 'utf8');
    const grab = (re, label) => { const m = src.match(re); if (!m) throw new Error(`82: ${label} introuvable`); return m[0]; };
    const fn = (name) => grab(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`), name);
    return {
        tables: [grab(/CREATE TABLE public\.lyann_entitlement_rollout \([\s\S]*?\n\);/, 'rollout'), grab(/INSERT INTO public\.lyann_entitlement_rollout[^;]*;/, 'rollout insert'),
            grab(/CREATE TABLE public\.lyann_entitlement_test_accounts \([\s\S]*?\n\);/, 'test_accounts')],
        functions: ['lyann_current_plan', 'lyann_plan_limits', 'lyann_entitlements_enforced', 'lyann_service_category', 'lyann_guard_category_entitlement'].map(fn),
        trigger: grab(/CREATE TRIGGER lyann_category_entitlement[\s\S]*?;/, 'trigger'),
    };
}

/** Titre d'une compétence v2 — politique C : « Métier · Spécialité », libellé seul pour un métier. */
const composedTitle = (n, byCode) => (n.kind === 'specialty' ? `${byCode.get(n.parent_code).label_fr} · ${n.label_fr}` : n.label_fr);

async function run() {
    const pglite = loadPglite();
    if (!pglite) return { skipped: true, reason: '@electric-sql/pglite introuvable (dépendance de développement optionnelle)' };
    const unaccent = loadContrib('unaccent');
    const trgm = loadContrib('pg_trgm');
    const db = new pglite.PGlite({ extensions: { unaccent: unaccent.unaccent, pg_trgm: trgm.pg_trgm } });
    const report = { steps: [], failures: [], figures: {} };
    const step = (name, ok, detail) => { report.steps.push({ name, ok, detail }); if (!ok) report.failures.push(`${name}${detail ? ` — ${detail}` : ''}`); };
    const rows = async (sql) => (await db.query(sql)).rows;

    const quota = extractQuotaObjects();
    // Comme Staging : unaccent et pg_trgm dans `public`, search_path « $user, public, extensions ».
    await db.exec('CREATE SCHEMA extensions; CREATE EXTENSION unaccent; CREATE EXTENSION pg_trgm; SET search_path = "$user", public, extensions;');
    await db.exec(`
        CREATE SCHEMA auth;
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
        GRANT USAGE ON SCHEMA public, extensions, auth TO anon, authenticated;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
        CREATE FUNCTION public.has_admin_permission(p_user uuid, p_perm text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
        CREATE TABLE public.lyann_taxonomy (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), universe text, category text, subcategory text, synonyms text[], tags text[], safety_level text, active boolean DEFAULT true);
        CREATE TABLE public.requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, category text, taxonomy_id uuid REFERENCES public.lyann_taxonomy(id), ${REQUEST_MODERATION_COLUMNS});
        CREATE TABLE public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid, title text, description text, category text, category_id uuid,
            slug text, base_price numeric, indicative_price numeric, price_type text, pricing_model text, active boolean DEFAULT true, is_active boolean DEFAULT true);
        CREATE TABLE public.lyann_plan_memberships (user_id uuid PRIMARY KEY, plan text, status text, expires_at timestamptz);
        CREATE TABLE public.service_reviews (id serial PRIMARY KEY, related_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL);
        -- Privilèges par défaut de Supabase (constat du pré-vol P08 : services porte les 7 privilèges pour anon et authenticated)
        GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
        ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
        CREATE POLICY services_test_all ON public.services FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
        CREATE POLICY services_test_read ON public.services FOR SELECT TO anon USING (true);
    `);
    await db.exec(fs.readFileSync(path.join(ROOT, '83_lyann_atomic_profile_skills_staging.sql'), 'utf8'));
    for (const t of quota.tables) await db.exec(t);
    for (const f of quota.functions) await db.exec(f);
    await db.exec(quota.trigger);
    const snapshot = require(path.join(ROOT, 'docs', 'taxonomy', 'data', 'staging-snapshot.json'));
    for (const [u, c, s, safety] of snapshot.leaves) await db.exec(`INSERT INTO public.lyann_taxonomy(universe, category, subcategory, safety_level) VALUES (${q(u)}, ${q(c)}, ${q(s)}, ${q(safety)})`);

    const quotaFingerprint = async () => (await rows(`SELECT
        (SELECT md5(string_agg(proname || prosrc, '|' ORDER BY proname)) FROM pg_proc WHERE proname IN ('lyann_guard_category_entitlement', 'lyann_service_category', 'lyann_plan_limits', 'lyann_current_plan', 'lyann_entitlements_enforced')) AS fns,
        (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'lyann_category_entitlement') AS trg,
        (SELECT string_agg(p || '=' || public.lyann_plan_limits(p)::text, ';' ORDER BY p) FROM unnest(ARRAY['FREE', 'PLUS', 'PRO']) p) AS limits`))[0];
    const fpBefore = await quotaFingerprint();
    const limits = { FREE: 1, PLUS: 3, PRO: 5 };
    for (const [plan, n] of Object.entries(limits)) step(`forfait ${plan} : limite de catégories = ${n} (migration 82)`, Number((await rows(`SELECT (public.lyann_plan_limits('${plan}')->>'categories')::int c`))[0].c) === n);

    // --- Drafts ---
    for (const f of ['01_schema_taxonomy_v2.sql', '02_additive_columns.sql', '03_search_and_skills_rpc.sql', '04_seed_taxonomy_v2.sql', '05_legacy_map_and_backfill.sql', '06_dual_write_derivation.sql', '08_legacy_projection.sql']) {
        try { await db.exec(read(f)); step(`appliquer ${f}`, true); } catch (e) { step(`appliquer ${f}`, false, e.message); return report; }
    }
    const fpAfter = await quotaFingerprint();
    step('01→08 ne modifient ni la garde, ni la clé de quota, ni les forfaits, ni le déclencheur de quota', JSON.stringify(fpBefore) === JSON.stringify(fpAfter));
    const allDrafts = fs.readdirSync(DRAFT).filter((f) => f.endsWith('.sql')).map((f) => [f, read(f)]);
    const touching = allDrafts.filter(([, sql]) => /lyann_plan_limits|lyann_current_plan|lyann_guard_|lyann_entitlement|lyann_service_category|lyann_plan_memberships|lyann_category_entitlement/.test(sql.replace(/--.*$/gm, ''))).map(([f]) => f);
    step('aucun brouillon ne référence les objets de quota ou de forfait (hors commentaires)', touching.length === 0, touching.join(','));
    const writesCategory = allDrafts.filter(([f, sql]) => !f.startsWith('09_') && /UPDATE\s+public\.services[\s\S]{0,200}?SET[^;]*\b(category|category_id|active|is_active|owner_id)\b\s*=/i.test(sql.replace(/--.*$/gm, ''))).map(([f]) => f);
    step('aucun brouillon ne modifie services.category / category_id / active / is_active / owner_id par UPDATE', writesCategory.length === 0, writesCategory.join(','));

    // --- Les titres composés sont des clés de quota distinctes et valides ---
    const nodes = await rows("SELECT code, kind, parent_code, label_fr FROM public.lyann_taxonomy_node WHERE selectable AND kind IN ('trade', 'specialty') AND family_code <> 'autres' ORDER BY code");
    const allNodes = await rows('SELECT code, kind, parent_code, label_fr FROM public.lyann_taxonomy_node');
    const byCode = new Map(allNodes.map((n) => [n.code, n]));
    const titles = nodes.map((n) => composedTitle(n, byCode));
    const key = (t) => `label:${t.toLowerCase().trim().replace(/\s+/g, ' ')}`;
    step(`politique C : ${nodes.length} nœuds proposables → ${new Set(titles.map(key)).size} clés de quota distinctes (aucune collision)`, new Set(titles.map(key)).size === nodes.length);
    step('politique C : tous les titres tiennent dans la limite de l\'ancienne RPC (≤ 120 caractères)', Math.max(...titles.map((t) => t.length)) <= 120, String(Math.max(...titles.map((t) => t.length))));
    const labelKeys = nodes.map((n) => key(n.label_fr));
    const collidingLabels = labelKeys.length - new Set(labelKeys).size;
    report.figures.labelCollisions = collidingLabels;
    step('libellés de nœuds uniques : les politiques A (libellé seul) et C comptent le même nombre de clés de quota (une par compétence)', collidingLabels === 0, String(collidingLabels));
    step('un métier garde son libellé seul : même clé qu\'un ancien stub « Plomberie »', composedTitle(byCode.get('plomberie'), byCode) === 'Plomberie' && key('Plomberie') === key(composedTitle(byCode.get('plomberie'), byCode)));

    // --- Scénarios ---
    let seq = 0;
    const newUser = async (plan) => {
        seq += 1;
        const id = `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
        await db.exec(`INSERT INTO auth.users VALUES ('${id}')`);
        if (plan !== 'FREE') await db.exec(`INSERT INTO public.lyann_plan_memberships VALUES ('${id}', '${plan}', 'active', now() + interval '30 days')`);
        return id;
    };
    const enforce = (on) => db.exec(`UPDATE public.lyann_entitlement_rollout SET enforce_all = ${on}`);
    const insertSkill = async (user, title) => {
        try { await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${user}', ${q(title)}, ${q(title)}, ${q(title)}, 's-' || gen_random_uuid()::text)`); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    };
    const fill = async (plan, list) => {
        const user = await newUser(plan);
        let accepted = 0; let firstRejected = null;
        for (let i = 0; i < list.length; i += 1) {
            const r = await insertSkill(user, list[i]);
            if (r.ok) accepted += 1; else { if (firstRejected === null) firstRejected = i; if (!/CATEGORY_QUOTA_REACHED/.test(r.error)) throw new Error(`erreur inattendue: ${r.error}`); }
        }
        const keys = Number((await rows(`SELECT count(DISTINCT public.lyann_service_category(category_id, category)) n FROM public.services WHERE owner_id = '${user}'`))[0].n);
        return { accepted, firstRejected, keys, user };
    };
    await enforce(true);

    // Profils : métiers et spécialités, y compris deux spécialités de même libellé sous deux métiers.
    const sample = (codes) => codes.map((c) => composedTitle(byCode.get(c), byCode));
    const profiles = {
        'un métier': sample(['plomberie']),
        'un métier + 3 spécialités': sample(['plomberie', 'plomberie_fuite', 'plomberie_debouchage', 'plomberie_robinetterie']),
        '2 métiers + 4 spécialités': sample(['plomberie', 'plomberie_fuite', 'electricite', 'electricite_panne', 'climatisation', 'climatisation_installation']),
        'six métiers': sample(['plomberie', 'electricite', 'climatisation', 'bricolage', 'menage_domicile', 'garde_enfants']),
        'deux spécialités de métiers différents': sample(['plomberie_installation', 'climatisation_installation']),
    };
    step('deux spécialités « Installation » de métiers différents : titres composés distincts (deux clés)', new Set(profiles['deux spécialités de métiers différents'].map(key)).size === 2, profiles['deux spécialités de métiers différents'].join(' / '));

    for (const [plan, limit] of Object.entries(limits)) {
        for (const [name, list] of Object.entries(profiles)) {
            const v2 = await fill(plan, list);
            const legacy = await fill(plan, list.map((t, i) => `Ancienne compétence ${plan} ${name} ${i}`)); // l'ancien client : un stub (category = title) par compétence
            const expectedAccepted = Math.min(list.length, limit);
            const expectedFirst = list.length > limit ? limit : null;
            step(`${plan} (limite ${limit}) · ${name} (${list.length}) : C accepte ${expectedAccepted}, refuse à partir du rang ${expectedFirst === null ? '—' : expectedFirst + 1}`, v2.accepted === expectedAccepted && v2.firstRejected === expectedFirst && v2.keys === expectedAccepted, JSON.stringify(v2));
            step(`${plan} · ${name} : comportement identique à l'ancien client (même nombre de compétences)`, v2.accepted === legacy.accepted && v2.firstRejected === legacy.firstRejected && v2.keys === legacy.keys, `${JSON.stringify({ a: v2.accepted, r: v2.firstRejected, k: v2.keys })} vs ${JSON.stringify({ a: legacy.accepted, r: legacy.firstRejected, k: legacy.keys })}`);
        }
    }
    // Contrôle négatif : la politique B (category = catégorie historique commune) CHANGERAIT le quota — c'est pourquoi elle est exclue.
    {
        const u = await newUser('FREE');
        const results = [];
        for (const t of ['Fuite', 'Débouchage', 'Robinetterie']) {
            try { await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${u}', ${q(t)}, ${q(t)}, 'Plomberie', 's-' || gen_random_uuid()::text)`); results.push(true); } catch (_) { results.push(false); }
        }
        step('contrôle négatif : avec la politique B (même category pour 3 spécialités) un membre FREE en poserait 3 pour 1 clé — le quota changerait de sens (B exclue)', results.every(Boolean));
    }
    // Ré-enregistrer une compétence existante (casse, espaces) ne consomme rien ; un métier == ancien stub du même nom ne consomme rien non plus.
    {
        const u = await newUser('PLUS');
        await insertSkill(u, 'Plomberie'); await insertSkill(u, composedTitle(byCode.get('electricite'), byCode)); await insertSkill(u, 'Climatisation');
        const again = await insertSkill(u, '  plomberie ');
        const dupNode = await insertSkill(u, composedTitle(byCode.get('plomberie'), byCode));
        const fourth = await insertSkill(u, composedTitle(byCode.get('bricolage'), byCode));
        step('PLUS : « Plomberie » (ancien stub) et le métier plomberie v2 partagent la même clé ; une 4e catégorie est refusée comme aujourd\'hui', again.ok && dupNode.ok && !fourth.ok && /CATEGORY_QUOTA_REACHED/.test(fourth.error || ''));
    }

    // --- La RPC v2 (écriture des compétences) respecte la garde, de façon atomique ---
    const asUser = async (user, sql) => { await db.exec(`SET test.uid = '${user}'`); try { return await rows(sql); } finally { await db.exec("SET test.uid = ''"); } };
    {
        const u = await newUser('PLUS');
        const ok = await asUser(u, `SELECT public.lyann_sync_profile_skills_v2('${u}', ARRAY['plomberie','plomberie_fuite','electricite_panne']) r`);
        const stubs = await rows(`SELECT title, category FROM public.services WHERE owner_id = '${u}' ORDER BY title`);
        step('RPC v2 · PLUS · 3 compétences : acceptées, stubs au titre composé, category = title', ok[0].r.success === true && stubs.length === 3 && stubs.every((s) => s.title === s.category) && stubs.some((s) => s.title === `${byCode.get('plomberie').label_fr} · ${byCode.get('plomberie_fuite').label_fr}`), JSON.stringify(stubs));
        let refused = null;
        try { await asUser(u, `SELECT public.lyann_sync_profile_skills_v2('${u}', ARRAY['plomberie','plomberie_fuite','electricite_panne','bricolage'])`); } catch (e) { refused = e.message; }
        const after = await rows(`SELECT (SELECT count(*) FROM public.services WHERE owner_id = '${u}') s, (SELECT count(*) FROM public.lyann_profile_skill WHERE user_id = '${u}') p`);
        step('RPC v2 · PLUS · 4e compétence : CATEGORY_QUOTA_REACHED, écriture annulée en bloc (aucun état partiel)', /CATEGORY_QUOTA_REACHED/.test(refused || '') && Number(after[0].s) === 3 && Number(after[0].p) === 3, `${refused} ${JSON.stringify(after[0])}`);
        // Un ancien client enregistre son profil : les compétences v2 ne sont pas supprimées et la 4e catégorie est refusée comme aujourd'hui.
        let legacyRefused = null;
        try { await asUser(u, `SELECT public.lyann_sync_profile_skills('${u}', ARRAY['Bricolage'])`); } catch (e) { legacyRefused = e.message; }
        const kept = Number((await rows(`SELECT count(*) n FROM public.services WHERE owner_id = '${u}' AND taxonomy_node_source = 'client'`))[0].n);
        step('ancien client (RPC 83) sur un profil v2 plein : compétences v2 conservées, 4e catégorie refusée par la garde actuelle', kept === 3 && /CATEGORY_QUOTA_REACHED/.test(legacyRefused || ''), `${kept} ${legacyRefused}`);
        const u2 = await newUser('PLUS');
        await asUser(u2, `SELECT public.lyann_sync_profile_skills_v2('${u2}', ARRAY['plomberie','electricite'])`);
        await asUser(u2, `SELECT public.lyann_sync_profile_skills('${u2}', ARRAY['Climatisation'])`);
        const mix = await rows(`SELECT count(*) n, count(DISTINCT public.lyann_service_category(category_id, category)) k FROM public.services WHERE owner_id = '${u2}'`);
        step('ancien client + client v2 sur le même profil : 3 compétences = 3 clés, limite PLUS atteinte sans dépassement', Number(mix[0].n) === 3 && Number(mix[0].k) === 3, JSON.stringify(mix[0]));
        // Retirer un métier libère sa clé (la RPC v2 supprime le stub), comme aujourd'hui.
        await asUser(u2, `SELECT public.lyann_sync_profile_skills_v2('${u2}', ARRAY['plomberie'])`);
        const freed = Number((await rows(`SELECT count(DISTINCT public.lyann_service_category(category_id, category)) k FROM public.services WHERE owner_id = '${u2}' AND taxonomy_node_source = 'client'`))[0].k);
        step('retirer des compétences v2 libère leurs clés de quota', freed === 1, String(freed));
    }

    // --- Membres déjà au-dessus de leur limite (grandfathering) : rétro-remplissage et dérivation n'y touchent pas ---
    {
        await enforce(false);
        const u = await newUser('FREE');
        for (const t of ['Plomberie', 'Électricité', 'Jardinage', 'Installation', 'Garde d\'enfants']) await insertSkill(u, t);
        await enforce(true);
        const before = await rows(`SELECT id, title, category, category_id, active, is_active FROM public.services WHERE owner_id = '${u}' ORDER BY id`);
        step('grandfathering : un membre FREE avec 5 catégories existantes est conservé', before.length === 5);
        await db.exec(`UPDATE public.services SET taxonomy_node_code = NULL, taxonomy_node_source = NULL WHERE owner_id = '${u}'`);
        let err = null;
        try { await db.exec(read('05_legacy_map_and_backfill.sql')); } catch (e) { err = e.message; }
        step('grandfathering : le rétro-remplissage (05) ne déclenche pas la garde de quota (UPDATE OF category… uniquement)', err === null, err);
        await db.exec(`UPDATE public.services SET title = title WHERE owner_id = '${u}'`);
        const afterRows = await rows(`SELECT id, title, category, category_id, active, is_active FROM public.services WHERE owner_id = '${u}' ORDER BY id`);
        step('grandfathering : titres, catégories, category_id, active, is_active strictement inchangés après 05 et la dérivation', JSON.stringify(before) === JSON.stringify(afterRows));
        const mapped = await rows(`SELECT title, taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE owner_id = '${u}' ORDER BY title`);
        step('grandfathering : « Installation » (titre sans objet, plusieurs métiers) reste à classer ; « Plomberie » est rattachée', mapped.find((r) => r.title === 'Installation').c === null && mapped.find((r) => r.title === 'Plomberie').c === 'plomberie', JSON.stringify(mapped));
        const blocked = await insertSkill(u, 'Cuisine');
        step('grandfathering : ce membre ne peut toujours pas AJOUTER une catégorie (règle actuelle inchangée)', !blocked.ok && /CATEGORY_QUOTA_REACHED/.test(blocked.error));
    }

    // --- Intégrité des clés de quota sur toute écriture passant par les déclencheurs v2 ---
    {
        const u = await newUser('PRO');
        const t = composedTitle(byCode.get('plomberie_fuite'), byCode);
        await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug, taxonomy_node_code) VALUES ('${u}', ${q(t)}, ${q(t)}, ${q(t)}, 'k-1', 'plomberie_fuite')`);
        await db.exec(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${u}', 'Électricité', 'Électricité', 'Électricité', 'k-2')`);
        const r = await rows(`SELECT slug, category, category_id, active, is_active, taxonomy_node_code c FROM public.services WHERE owner_id = '${u}' ORDER BY slug`);
        step('les déclencheurs v2 n\'écrivent jamais category, category_id, active, is_active', r[0].category === t && r[1].category === 'Électricité' && r.every((x) => x.category_id === null && x.active === true && x.is_active === true) && r[1].c === 'electricite', JSON.stringify(r));
    }


    // --- X3 : durcissement des privilèges de `services` (brouillon 100, NON appliqué ailleurs que dans ce banc) : compatibilité avec la taxonomie et le quota ---
    {
        const secDir = path.join(ROOT, 'docs', 'taxonomy', 'security-draft');
        const priv = async (role, p) => (await rows(`SELECT has_table_privilege('${role}', 'public.services', '${p}') ok`))[0].ok;
        const policiesHash = async () => (await rows("SELECT md5(string_agg(policyname || cmd || roles::text || coalesce(qual,'') || coalesce(with_check,''), '|' ORDER BY policyname)) h FROM pg_policies WHERE tablename = 'services'"))[0].h;
        const polBefore = await policiesHash();
        step('privilèges initiaux de services (constat Staging) : anon et authenticated portent TRUNCATE, TRIGGER, REFERENCES', await priv('anon', 'TRUNCATE') && await priv('authenticated', 'TRIGGER') && await priv('anon', 'REFERENCES'));
        try { await db.exec(fs.readFileSync(path.join(secDir, '100_services_dangerous_privileges_staging.sql'), 'utf8')); step('appliquer 100_services_dangerous_privileges_staging.sql (banc local)', true); } catch (e) { step('appliquer 100_services_dangerous_privileges_staging.sql (banc local)', false, e.message); return report; }
        const gone = []; for (const r of ['anon', 'authenticated']) for (const p of ['TRUNCATE', 'TRIGGER', 'REFERENCES']) if (await priv(r, p)) gone.push(`${r}:${p}`);
        step('100 : TRUNCATE, TRIGGER, REFERENCES retirés à anon et authenticated', gone.length === 0, gone.join(','));
        step('100 : SELECT/INSERT/UPDATE/DELETE conservés ; service_role et postgres gardent tout', await priv('authenticated', 'INSERT') && await priv('authenticated', 'DELETE') && await priv('anon', 'SELECT') && await priv('service_role', 'TRUNCATE') && await priv('postgres', 'TRIGGER'));
        step('100 : politiques RLS inchangées', (await policiesHash()) === polBefore);
        const u = await newUser('PLUS');
        const asAuth = async (sql) => { await db.exec(`SET ROLE authenticated; SET test.uid = '${u}'`); try { return await rows(sql); } finally { await db.exec("RESET ROLE; SET test.uid = ''"); } };
        const t1 = composedTitle(byCode.get('plomberie_fuite'), byCode);
        await asAuth(`INSERT INTO public.services(owner_id, title, description, category, slug, taxonomy_node_code) VALUES ('${u}', ${q(t1)}, ${q(t1)}, ${q(t1)}, 'h-1', 'plomberie_fuite') RETURNING id`);
        await asAuth(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${u}', 'Électricité', 'Électricité', 'Électricité', 'h-0') RETURNING id`);
        const r1 = await rows("SELECT slug, taxonomy_node_code c, taxonomy_node_source s FROM public.services WHERE slug IN ('h-0', 'h-1') ORDER BY slug");
        step('après 100 : un membre authenticated insère une compétence v2 (nœud explicite) et une ancienne (titre) ; le déclencheur de dérivation (propriétaire) fonctionne', r1[0].c === 'electricite' && r1[0].s === 'derived_title' && r1[1].c === 'plomberie_fuite' && r1[1].s === 'client', JSON.stringify(r1));
        await asAuth(`SELECT public.lyann_sync_profile_skills_v2('${u}', ARRAY['plomberie','plomberie_fuite','electricite'])`);
        let err = null; try { await asAuth(`SELECT public.lyann_sync_profile_skills_v2('${u}', ARRAY['plomberie','plomberie_fuite','electricite','bricolage'])`); } catch (e) { err = e.message; }
        step('après 100 : la garde de quota refuse toujours la 4e catégorie (RPC v2)', /CATEGORY_QUOTA_REACHED/.test(err || ''), err);
        await asAuth(`SELECT public.lyann_sync_profile_skills('${u}', ARRAY['Plomberie'])`);
        step('après 100 : l\'ancienne RPC (migration 83) fonctionne toujours et conserve les compétences v2', Number((await rows(`SELECT count(*) n FROM public.services WHERE owner_id = '${u}' AND taxonomy_node_source = 'client'`))[0].n) >= 2);
        const denied = []; for (const role of ['anon', 'authenticated']) { try { await db.exec(`SET ROLE ${role}; TRUNCATE public.services`); denied.push(`${role}:OUVERT`); } catch (_) { /* refusé */ } finally { await db.exec('RESET ROLE'); } }
        step('après 100 : TRUNCATE refusé à anon et à authenticated', denied.length === 0, denied.join(','));
        await asAuth(`INSERT INTO public.services(owner_id, title, description, category, slug) VALUES ('${u}', ${q(t1)}, 'Fuites, recherche de fuite', ${q(t1)}, 'h-2') RETURNING id`);
        await db.exec("INSERT INTO public.service_reviews(related_service_id) SELECT id FROM public.services WHERE slug = 'h-2'");
        await asAuth("DELETE FROM public.services WHERE slug = 'h-2'");
        step('après 100 : une clé étrangère vers services (ON DELETE SET NULL) fonctionne avec un DELETE de membre', (await rows('SELECT related_service_id r FROM public.service_reviews'))[0].r === null);
        try { await db.exec(fs.readFileSync(path.join(secDir, '100_services_dangerous_privileges_rollback.sql'), 'utf8')); step('appliquer le rollback 100 (banc local)', true); } catch (e) { step('appliquer le rollback 100 (banc local)', false, e.message); return report; }
        step('rollback 100 : TRUNCATE, TRIGGER, REFERENCES restitués, politiques inchangées', await priv('anon', 'TRUNCATE') && await priv('authenticated', 'REFERENCES') && (await policiesHash()) === polBefore);
    }

    // --- Retour arrière ---
    {
        const users = (await rows("SELECT id FROM auth.users")).map((x) => x.id);
        await db.exec(`DELETE FROM public.services WHERE owner_id = ANY (ARRAY[${users.map((x) => `'${x}'::uuid`).join(',')}])`);
        try { await db.exec(read('09_rollback_taxonomy_v2.sql')); step('appliquer 09_rollback_taxonomy_v2.sql', true); } catch (e) { step('appliquer 09_rollback_taxonomy_v2.sql', false, e.message); return report; }
        step('après rollback : garde, clé de quota, forfaits et déclencheur de quota identiques à l\'origine', JSON.stringify(await quotaFingerprint()) === JSON.stringify(fpBefore));
        const t = await insertSkill(await newUser('PLUS'), 'Après rollback');
        step('après rollback : une écriture de compétence passe toujours par la garde', t.ok);
    }
    await db.close();
    return report;
}

if (require.main === module) {
    run().then((r) => {
        if (r.skipped) { console.log(`SKIP: ${r.reason}`); return; }
        for (const s of r.steps) console.log(`${s.ok ? 'OK  ' : 'FAIL'} ${s.name}${s.ok || !s.detail ? '' : ` — ${s.detail}`}`);
        console.log(`\n${r.steps.length - r.failures.length}/${r.steps.length} contrôles OK`, JSON.stringify(r.figures));
        process.exit(r.failures.length ? 1 : 0);
    }).catch((e) => { console.error(e); process.exit(2); });
}
module.exports = { run, extractQuotaObjects, composedTitle };
