'use strict';
/*
 * Cohérence de la PROPOSITION de taxonomie v2 (phase 3.2B) : structure, sécurité, correspondance avec l'existant,
 * qualité de classification, et innocuité des brouillons SQL. Aucun accès réseau ni base distante.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../scripts/taxonomy-v2/lib');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'docs', 'taxonomy', 'data');
const DRAFT = path.join(ROOT, 'docs', 'taxonomy', 'migration-draft');
const legacy = require(path.join(DATA, 'legacy-map.data.js'));
const snapshot = require(path.join(DATA, 'staging-snapshot.json'));
const pct = (x) => `${(x * 100).toFixed(0)} %`;
const ctx = lib.build();
const { nodes, byCode, data } = ctx;
const trades = nodes.filter((n) => n.kind === 'trade');
const specialties = nodes.filter((n) => n.kind === 'specialty');
const families = nodes.filter((n) => n.kind === 'family');
const SAFETY_RANK = { NORMAL: 0, CAUTION: 1, PRO_REQUIRED: 2, RESTRICTED: 3, PROHIBITED: 4 };

test('structure : 8 familles + « autres », identifiants uniques et bien formés', () => {
    assert.equal(families.length, 9);
    assert.deepEqual(families.map((f) => f.code), ['maison', 'jardin', 'entretien', 'beaute', 'transport', 'famille', 'evenement', 'numerique', 'autres']);
    const codes = nodes.map((n) => n.code);
    assert.equal(new Set(codes).size, codes.length, 'codes dupliqués');
    for (const code of codes) assert.match(code, /^[a-z0-9_]{2,80}$/, code);
    assert.ok(trades.length >= 100, `métiers: ${trades.length}`);
    assert.ok(specialties.length >= 400, `spécialités: ${specialties.length}`);
});

test('structure : parents, familles, sous-domaines et préfixes cohérents', () => {
    const familyCodes = new Set(families.map((f) => f.code));
    for (const t of trades) {
        assert.ok(familyCodes.has(t.family), `famille inconnue pour ${t.code}`);
        const family = data.FAMILIES.find((f) => f.code === t.family);
        assert.ok(family.groups.some((g) => g.code === t.group), `sous-domaine ${t.group} inconnu dans ${t.family} (${t.code})`);
        for (const a of t.also) {
            assert.ok(familyCodes.has(a) && a !== t.family, `famille secondaire invalide ${a} sur ${t.code}`);
        }
    }
    for (const s of specialties) {
        const parent = byCode.get(s.parent);
        assert.equal(parent && parent.kind, 'trade', `parent de ${s.code}`);
        assert.equal(s.family, parent.family);
        assert.ok(s.code.startsWith(`${parent.code}_`), `préfixe de ${s.code}`);
        assert.ok(SAFETY_RANK[s.safety] >= SAFETY_RANK[parent.safety], `${s.code} moins strict que son métier`);
    }
});

test('structure : libellés non vides et uniques par famille', () => {
    for (const f of families) {
        const labels = nodes.filter((n) => n.family === f.code && n.kind !== 'family').map((n) => lib.normalize(n.label));
        assert.equal(new Set(labels).size, labels.length, `libellés dupliqués dans ${f.code}`);
    }
    for (const n of nodes) assert.ok(n.label.trim().length >= 2, n.code);
});

test('Découvrir : 10 tuiles (9 domaines + Autres en 10e), aucune famille ni métier orphelin', () => {
    const tiles = data.DISCOVER_TILES;
    assert.equal(tiles.length, 10);
    assert.equal(tiles[9].family, 'autres');
    assert.ok(tiles.slice(0, 9).every((t) => t.family !== 'autres'));
    for (const f of families.filter((x) => x.code !== 'autres')) assert.ok(tiles.some((t) => t.family === f.code), `famille sans tuile: ${f.code}`);
    for (const t of trades.filter((x) => x.family !== 'autres')) {
        assert.ok(tiles.some((tile) => tile.family === t.family && (!tile.groups || tile.groups.includes(t.group))), `métier inaccessible depuis Découvrir: ${t.code}`);
    }
    for (const tile of tiles) for (const g of tile.groups || []) {
        assert.ok(data.FAMILIES.find((f) => f.code === tile.family).groups.some((x) => x.code === g), `${tile.code}: groupe ${g}`);
    }
});

test('sécurité : activités réglementées jamais sélectionnables, familles non sélectionnables', () => {
    for (const n of nodes) {
        if (n.safety === 'RESTRICTED' || n.safety === 'PROHIBITED') assert.equal(n.selectable, false, n.code);
        if (n.kind === 'family') assert.equal(n.selectable, false);
    }
    const restricted = nodes.filter((n) => n.safety === 'RESTRICTED').map((n) => n.code).sort();
    assert.deepEqual(restricted, ['aide_personnes_agees_aide_toilette_soins', 'permis_code_route_lecons_conduite', 'traduction_interpretation_traduction_assermentee']);
    for (const n of nodes.filter((x) => x.safety === 'RESTRICTED')) assert.ok(n.regulation, `${n.code}: note de réglementation manquante`);
    // Le transport rémunéré de personnes ne doit pas être présenté comme une activité libre.
    assert.notEqual(byCode.get('covoiturage_trajets').safety, 'NORMAL');
});

test('termes : couverture minimale, unicité des libellés, termes trop génériques maîtrisés', () => {
    for (const t of trades) {
        const own = t.terms.length;
        assert.ok(own >= 4, `${t.code}: ${own} termes`);
        const hasProblem = [t, ...specialties.filter((s) => s.parent === t.code)].some((n) => n.terms.some((x) => x.type === 'problem'));
        assert.ok(hasProblem, `${t.code}: aucun problème formulé en langage naturel`);
    }
    for (const s of specialties) assert.ok(s.terms.length >= 3, `${s.code}: ${s.terms.length} termes`);
    const labelOwners = new Map();
    for (const n of nodes.filter((x) => x.kind !== 'family')) {
        const norm = lib.normalize(n.label);
        assert.ok(!labelOwners.has(norm), `libellé en doublon: « ${n.label} » (${n.code} / ${labelOwners.get(norm)})`);
        labelOwners.set(norm, n.code);
    }
    const registry = new Set(Object.keys(data.AMBIGUOUS_TERMS).map(lib.normalize));
    for (const c of lib.collisions(nodes, byCode)) {
        assert.ok(c.trades.length <= 4 || registry.has(c.norm), `terme partagé par ${c.trades.length} métiers sans être déclaré ambigu: « ${c.norm} »`);
    }
    for (const k of Object.keys(data.AMBIGUOUS_TERMS)) assert.ok(data.AMBIGUOUS_TERMS[k].question.length > 5, k);
});

test('existant : les 89 feuilles de lyann_taxonomy (Staging) sont toutes couvertes par la correspondance', () => {
    assert.equal(snapshot.leaves.length, 89);
    const covered = new Map(legacy.LEAVES.map((l) => [`${l.universe}|${l.category}|${l.subcategory}`, l]));
    for (const leaf of snapshot.leaves) assert.ok(covered.has(leaf.slice(0, 3).join('|')), `feuille non couverte: ${leaf.slice(0, 3).join(' > ')}`);
    assert.equal(covered.size, legacy.LEAVES.length, 'clé de feuille dupliquée');
    for (const l of legacy.LEAVES) {
        assert.ok(byCode.has(l.node), `${l.subcategory} → ${l.node}`);
        for (const a of l.alt) assert.ok(byCode.has(a), `${l.subcategory} alt ${a}`);
        assert.ok(['exact', 'broad', 'split', 'merge', 'ambiguous'].includes(l.kind));
        assert.equal(byCode.get(l.node).selectable, true, `${l.node} cible non sélectionnable`);
        if (l.kind === 'split' || l.kind === 'merge') assert.ok(l.alt.length > 0, `${l.subcategory}: split/merge sans alternative`);
        if (l.kind === 'ambiguous') assert.ok(l.note.length > 20, `${l.subcategory}: ambiguïté non expliquée`);
    }
});

test('existant : demandes utilisant une feuille → leur nœud cible existe et conserve la famille attendue', () => {
    const used = snapshot.leaves.filter((l) => l[5] > 0);
    assert.ok(used.length >= 6);
    for (const leaf of used) {
        const m = legacy.LEAVES.find((l) => l.universe === leaf[0] && l.category === leaf[1] && l.subcategory === leaf[2]);
        assert.ok(m, leaf.join('|'));
    }
});

test('existant : titres de compétences (Staging ∪ catalogue Maison), boutons, catégories de demandes, familles de carte, clés pro', () => {
    const titles = new Set(legacy.SKILL_TITLES.map((s) => lib.normalize(s.title)));
    for (const [title] of snapshot.services) assert.ok(titles.has(lib.normalize(title)), `compétence Staging non couverte: ${title}`);
    global.window = {};
    require(path.join(ROOT, 'maison-catalog.js'));
    const catalogSkills = new Set(global.window.LYANN_MAISON_CATALOG.flatMap((p) => p.skills));
    delete global.window;
    assert.ok(catalogSkills.size > 80);
    for (const skill of catalogSkills) assert.ok(titles.has(lib.normalize(skill)), `compétence catalogue non couverte: ${skill}`);
    for (const s of legacy.SKILL_TITLES) {
        assert.ok(byCode.has(s.node), `${s.title} → ${s.node}`);
        for (const a of s.alt) assert.ok(byCode.has(a), `${s.title} alt ${a}`);
        if (s.kind === 'ambiguous') assert.ok(s.alt.length >= 1, `${s.title}: ambigu sans alternative`);
    }
    assert.equal(legacy.SKILL_BUTTONS.length, 9);
    for (const b of legacy.SKILL_BUTTONS) {
        const node = byCode.get(b.node);
        assert.ok(node, b.button);
        assert.equal(node.family === b.family || node.also.includes(b.family), true, `${b.button}: famille ${b.family}`);
    }
    const categories = new Set(snapshot.request_categories.map((r) => r[0]));
    for (const c of categories) assert.ok(legacy.REQUEST_CATEGORIES.some((r) => r.category === c), `catégorie de demande non couverte: ${c}`);
    for (const r of legacy.REQUEST_CATEGORIES) assert.ok(byCode.has(r.node), r.category);
    assert.equal(legacy.MAP_FAMILIES.length, 8);
    const familyCodes = new Set(families.map((f) => f.code));
    for (const m of legacy.MAP_FAMILIES) {
        for (const f of m.families) assert.ok(familyCodes.has(f), m.old);
        for (const t of m.trades) assert.equal(byCode.get(t).kind, 'trade', `${m.old}: ${t}`);
    }
    assert.equal(legacy.ACTIVITY_KEYS.length, 3);
    for (const a of legacy.ACTIVITY_KEYS) for (const t of a.trades) assert.equal(byCode.get(t).kind, 'trade', `${a.old}: ${t}`);
});

test('existant : la carte Annonces actuelle (needs-map-category-families.js) est recouverte par la correspondance', () => {
    const source = fs.readFileSync(path.join(ROOT, 'needs-map-category-families.js'), 'utf8');
    const ids = [...source.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(ids)].sort(), legacy.MAP_FAMILIES.map((m) => m.old).sort());
});

test('classification (jeu principal, utilisé pour le réglage) : aucune erreur, précision stricte élevée', () => {
    const cases = require(path.join(DATA, 'classification-cases.js'));
    const wrong = []; let strict = 0;
    for (const c of cases) {
        const r = lib.classify(c.q, ctx);
        const accept = [].concat(c.trade || []);
        if (c.status === 'CLARIFY') {
            if (r.status === 'CLASSIFIED' || r.status === 'UNCLASSIFIED' && !r.ambiguousTerms.length) wrong.push(`${c.q} → ${r.status}`); else strict += 1;
        } else if (c.status) {
            if (r.status !== c.status) wrong.push(`${c.q} → ${r.status}`); else strict += 1;
        } else if (r.status === 'CLASSIFIED') {
            if (accept.includes(r.ranked[0].trade) && (!c.node || r.ranked[0].node === c.node)) strict += 1; else wrong.push(`${c.q} → ${r.ranked[0].trade}`);
        } else if (!(r.status === 'NEEDS_CLARIFICATION' && r.ranked.slice(0, 2).some((x) => accept.includes(x.trade)))) {
            wrong.push(`${c.q} → ${r.status} ${r.ranked.slice(0, 2).map((x) => x.trade).join(',')}`);
        }
    }
    assert.deepEqual(wrong, [], 'jamais de mauvaise classification silencieuse');
    assert.ok(strict / cases.length >= 0.95, `précision stricte ${(strict / cases.length * 100).toFixed(1)} %`);
});

test('classification (jeu hors échantillon) : généralisation mesurée, seuils volontairement exigeants', () => {
    const cases = require(path.join(DATA, 'classification-heldout.js'));
    let strict = 0; let safe = 0;
    const misses = [];
    for (const c of cases) {
        const r = lib.classify(c.q, ctx);
        if (c.status) {
            const ok = c.status === 'UNCLASSIFIED' ? r.status === 'UNCLASSIFIED' : r.status !== 'CLASSIFIED';
            if (ok) { strict += 1; safe += 1; } else misses.push(c.q);
            continue;
        }
        const top = r.ranked[0];
        const s = r.status === 'CLASSIFIED' && top && c.accept.includes(top.trade);
        const sf = s || (r.status === 'NEEDS_CLARIFICATION' && r.ranked.slice(0, 2).some((x) => c.accept.includes(x.trade)));
        if (s) strict += 1;
        if (sf) safe += 1; else misses.push(c.q);
    }
    assert.ok(strict / cases.length >= 0.85, `précision stricte ${(strict / cases.length * 100).toFixed(0)} % ; manqués: ${misses.join(' | ')}`);
    assert.ok(safe / cases.length >= 0.93, `précision « sûre » ${(safe / cases.length * 100).toFixed(0)} % ; manqués: ${misses.join(' | ')}`);
});

test('classification (titres réels de recette Staging) : aucune erreur silencieuse', () => {
    const cases = require(path.join(DATA, 'classification-staging.js'));
    for (const c of cases) {
        const r = lib.classify(c.q, ctx);
        if (c.status) assert.notEqual(r.status, 'CLASSIFIED', `« ${c.q} » ne doit pas être classé de force`);
        else { assert.equal(r.status, 'CLASSIFIED', c.q); assert.ok(c.accept.includes(r.ranked[0].trade), `${c.q} → ${r.ranked[0].trade}`); }
    }
});

test('classification : un terme ambigu seul déclenche une question, jamais un choix arbitraire', () => {
    for (const term of ['batterie', 'depannage', 'nettoyage', 'transport', 'aide']) {
        const r = lib.classify(term, ctx);
        assert.notEqual(r.status, 'CLASSIFIED', term);
        assert.ok(r.ambiguousTerms.length > 0, `${term}: question attendue`);
    }
    for (const q of ['bonjour a tous', 'azerty uiop', '']) assert.equal(lib.classify(q, ctx).status, 'UNCLASSIFIED', q);
});

test('classification : activités réglementées guidées, jamais présentées comme un service libre', () => {
    const r = lib.classify('des lecons de conduite pour passer mon permis', ctx);
    assert.equal(r.ranked[0].node, 'permis_code_route_lecons_conduite');
    assert.equal(byCode.get(r.ranked[0].node).selectable, false);
});

test('territoires : lot de vocabulaire par région valide, sans erreur silencieuse, écart entre régions borné', () => {
    const evaluate = require(path.join(ROOT, 'scripts', 'taxonomy-v2', 'evaluate.js'));
    const REGIONS = ['antilles', 'guyane', 'reunion'];
    const lots = require(path.join(DATA, 'territory-vocabulary.js'));
    assert.deepEqual(Object.keys(lots).sort(), [...REGIONS].sort());
    const tagged = nodes.flatMap((n) => n.terms).filter((t) => t.territories);
    assert.ok(tagged.length >= 100, `termes territoriaux marqués : ${tagged.length}`);
    for (const t of tagged) for (const r of t.territories) assert.ok(REGIONS.includes(r), `région inconnue ${r} (${t.term})`);
    const { rows, byRegion } = evaluate.run();
    assert.equal(rows.filter((r) => r.silentError).length, 0, `erreurs silencieuses : ${rows.filter((r) => r.silentError).map((r) => r.q).join(' | ')}`);
    const held = byRegion.filter((s) => s.group.startsWith('territorial (hors échantillon)'));
    for (const s of held) assert.ok(s.safe >= 0.85, `${s.group} : « sûr » ${pct(s.safe)}`);
    const safes = held.map((s) => s.safe);
    assert.ok(Math.max(...safes) - Math.min(...safes) <= 0.15, 'écart entre territoires > 15 points');
    const seed = fs.readFileSync(path.join(DRAFT, '04_seed_taxonomy_v2.sql'), 'utf8');
    assert.match(seed, /ARRAY\['guyane'\]::text\[\]/);
    assert.match(fs.readFileSync(path.join(DRAFT, '01_schema_taxonomy_v2.sql'), 'utf8'), /territories text\[\]/);
});

test('revue produit (doc. 10) : générée, à jour, et fidèle aux données', () => {
    const { render } = require(path.join(ROOT, 'scripts', 'taxonomy-v2', 'review.js'));
    const current = fs.readFileSync(path.join(ROOT, 'docs', 'taxonomy', '10-product-review.md'), 'utf8');
    assert.equal(current, render(), 'doc. 10 obsolète : node scripts/taxonomy-v2/review.js');
    for (const f of ['maison', 'jardin', 'entretien', 'beaute', 'transport', 'famille', 'evenement', 'numerique']) assert.ok(current.includes(`(\`${f}\`)`), f);
    for (let i = 1; i <= 13; i += 1) assert.ok(new RegExp(`\\*\\*D${i}\\*\\* \\|`).test(current), `D${i} absente de la revue`);
    const decisions = fs.readFileSync(path.join(ROOT, 'docs', 'taxonomy', '09-risks-and-decisions.md'), 'utf8');
    assert.ok(!/D14/.test(decisions), 'référence à une décision D14 inexistante');
});

test('plan d\'intégration Staging (doc. 11) : arbitrages, priorités, blocages ; pré-vol strictement en lecture seule', () => {
    const plan = fs.readFileSync(path.join(ROOT, 'docs', 'taxonomy', '11-staging-integration-plan.md'), 'utf8');
    for (const d of ['D1', 'D4', 'D5', 'D8', 'D11', 'D13']) assert.ok(new RegExp(`\\*\\*${d}\\*\\*`).test(plan), `${d} absent du plan`);
    for (let i = 1; i <= 8; i += 1) assert.ok(new RegExp(`\\| ${i} \\| \\*\\*`).test(plan), `priorité ${i} absente`);
    for (const p of ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']) assert.ok(plan.includes(`**${p}**`), `${p} absente`);
    for (let i = 1; i <= 30; i += 1) assert.ok(plan.includes(`| C${String(i).padStart(2, '0')} |`), `contrôle C${i} absent`);
    assert.match(plan, /taxonomy\.manage[^\n]*existe déjà|existe déjà[^\n]*taxonomy\.manage/);
    const pre = fs.readFileSync(path.join(ROOT, 'docs', 'taxonomy', 'sql', 'staging-preflight-readonly.sql'), 'utf8');
    const code = pre.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(code, /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/i, 'le pré-vol doit rester en lecture seule');
    assert.doesNotMatch(pre, /gzispjfoywklpqatjyop/, 'identifiant Production');
});

test('livrables générés : cohérents avec la source', () => {
    const gen = path.join(ROOT, 'docs', 'taxonomy', 'generated');
    const json = JSON.parse(fs.readFileSync(path.join(gen, 'taxonomy-v2.json'), 'utf8'));
    assert.equal(json.nodes.length, nodes.length - families.length, 'taxonomy-v2.json obsolète : relancer scripts/taxonomy-v2/build.js');
    const csvLines = fs.readFileSync(path.join(gen, 'nodes.csv'), 'utf8').trim().split('\n').length - 1;
    assert.equal(csvLines, nodes.length - families.length);
    const stats = JSON.parse(fs.readFileSync(path.join(gen, 'stats.json'), 'utf8'));
    assert.equal(stats.trades, trades.length);
    assert.equal(stats.specialties, specialties.length);
    const seed = fs.readFileSync(path.join(DRAFT, '04_seed_taxonomy_v2.sql'), 'utf8');
    for (const n of nodes) assert.ok(seed.includes(`'${n.code}'`), `seed sans ${n.code}`);
});

test('brouillons SQL : étiquetés non appliqués, additifs, sans accès Production', () => {
    const files = fs.readdirSync(DRAFT).filter((f) => f.endsWith('.sql'));
    assert.ok(files.length >= 7);
    for (const f of files) {
        const sql = fs.readFileSync(path.join(DRAFT, f), 'utf8');
        assert.match(sql, /NON APPLIQUÉ/, `${f}: en-tête manquant`);
        assert.doesNotMatch(sql, /gzispjfoywklpqatjyop/, `${f}: identifiant Production`);
        assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY/i, `${f}: RLS désactivée`);
        assert.doesNotMatch(sql, /\bTRUNCATE\b/i, `${f}: TRUNCATE`);
        if (f.startsWith('09_')) continue;
        assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b(?![^;]*IF EXISTS)/i, `${f}: DROP hors rollback`);
        assert.doesNotMatch(sql, /ALTER\s+TABLE\s+public\.(requests|services|lyann_taxonomy)\s+(ALTER|DROP)\s+COLUMN/i, `${f}: colonne existante modifiée`);
        assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.(requests|lyann_taxonomy|profiles|messages)\b/i, `${f}: suppression de données`);
    }
    // Seuls les nouveaux champs sont écrits dans les tables existantes.
    const backfill = fs.readFileSync(path.join(DRAFT, '05_legacy_map_and_backfill.sql'), 'utf8');
    for (const m of backfill.matchAll(/UPDATE\s+public\.(\w+)\s+\w+\s+SET\s+([^\n]+)/gi)) {
        const assigned = m[2].split(',').map((x) => x.split('=')[0].trim());
        for (const col of assigned) assert.ok(['node_code', 'taxonomy_node_code', 'taxonomy_node_source'].includes(col), `${m[1]}: colonne écrite inattendue ${col}`);
    }
    // 06 : déclencheurs de double écriture : SECURITY DEFINER à search_path fixé, fail-open, n'écrivent que les champs v2.
    const derive = fs.readFileSync(path.join(DRAFT, '06_dual_write_derivation.sql'), 'utf8');
    const functions = [...derive.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)].map((m) => m[0]);
    const triggers = functions.filter((f) => /RETURNS trigger/.test(f));
    assert.equal(triggers.length, 2);
    for (const fn of triggers) {
        assert.match(fn, /SECURITY DEFINER/); assert.match(fn, /SET search_path = public, pg_temp/);
        assert.match(fn, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/, 'doit être fail-open');
        assert.doesNotMatch(fn, /RAISE EXCEPTION/, 'ne doit jamais bloquer une écriture');
        assert.doesNotMatch(fn, /\b(INSERT|DELETE|UPDATE)\s+(INTO\s+)?public\./i, 'ne doit écrire que dans NEW');
        for (const col of [...fn.matchAll(/NEW\.(\w+)\s*:=/g)].map((x) => x[1])) assert.ok(['taxonomy_node_code', 'taxonomy_node_source'].includes(col), `NEW.${col} modifié`);
    }
    // 06 : aides de cohérence = lecture seule (aucune écriture), SECURITY DEFINER à search_path fixé dès qu'elles lisent une table.
    const helpers = functions.filter((f) => /lyann_(node_related_to|request_legacy_matches_node|service_legacy_matches_node|legacy_value_is_placeholder)/.test(f.split('\n')[0]));
    assert.equal(helpers.length, 4);
    for (const fn of helpers) {
        assert.doesNotMatch(fn, /\b(INSERT|DELETE|UPDATE)\b\s+(INTO\s+)?public\.|\bRAISE EXCEPTION\b/i, 'une aide de cohérence ne modifie rien');
        if (/FROM public\./.test(fn)) { assert.match(fn, /SECURITY DEFINER/); assert.match(fn, /SET search_path = public, pg_temp/); assert.match(fn, /\bSTABLE\b/); }
    }
    // 06 : la RPC d'enregistrement des compétences (migration 83) n'est modifiée QUE par la protection des compétences à nœud explicite.
    const protectedRpc = functions.find((f) => /lyann_sync_profile_skills\(p_user/.test(f.split('\n')[0]));
    assert.ok(protectedRpc, 'RPC protégée absente de 06');
    const original = fs.readFileSync(path.join(ROOT, '83_lyann_atomic_profile_skills_staging.sql'), 'utf8');
    const originalFn = original.slice(original.indexOf('CREATE FUNCTION public.lyann_sync_profile_skills'), original.indexOf('REVOKE ALL ON FUNCTION public.lyann_sync_profile_skills')).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION').trim();
    const stripAdded = protectedRpc.split('\n').filter((l) => !/Compétence posée par un client v2|AND NOT \(s\.taxonomy_node_code IS NOT NULL/.test(l)).join('\n').replace('never priced services, never v2 skills.', 'never priced services.').trim();
    assert.equal(stripAdded, originalFn, 'la RPC protégée ne doit différer de la migration 83 que par les lignes de protection');
    // 08 : la projection historique est un trigger fail-open qui n'écrit que category et taxonomy_id dans NEW.
    const projection = fs.readFileSync(path.join(DRAFT, '08_legacy_projection.sql'), 'utf8');
    const proj = projection.match(/CREATE OR REPLACE FUNCTION public\.lyann_fill_request_legacy[\s\S]*?\$\$;/)[0];
    assert.match(proj, /SECURITY DEFINER/); assert.match(proj, /SET search_path = public, pg_temp/);
    assert.match(proj, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/); assert.doesNotMatch(proj, /RAISE EXCEPTION/);
    assert.doesNotMatch(proj, /\b(INSERT|DELETE|UPDATE)\s+(INTO\s+)?public\./i);
    assert.deepEqual([...new Set([...proj.matchAll(/NEW\.(\w+)\s*:=/g)].map((x) => x[1]))].sort(), ['category', 'taxonomy_id']);
    assert.match(projection, /ALTER TABLE public\.lyann_taxonomy_legacy_projection ENABLE ROW LEVEL SECURITY/);
    // Toute nouvelle table a la RLS activée.
    const schema = fs.readFileSync(path.join(DRAFT, '01_schema_taxonomy_v2.sql'), 'utf8') + fs.readFileSync(path.join(DRAFT, '03_search_and_skills_rpc.sql'), 'utf8');
    const created = [...schema.matchAll(/CREATE TABLE public\.(\w+)/g)].map((m) => m[1]);
    assert.ok(created.length >= 8);
    for (const t of created) assert.match(schema, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`), `${t}: RLS non activée`);
    // Les fonctions SECURITY DEFINER fixent leur search_path.
    for (const m of schema.matchAll(/CREATE FUNCTION[\s\S]*?\$\$;/g)) {
        if (/SECURITY DEFINER/.test(m[0])) assert.match(m[0], /SET search_path/, 'SECURITY DEFINER sans search_path');
    }
});

test('brouillons SQL : validation locale complète (PGlite) — application, vérifications, RLS, RPC, rollback, rejouabilité', async (t) => {
    const { run } = require('../scripts/taxonomy-v2/validate-sql-pglite');
    const report = await run();
    if (report.skipped) { t.skip(report.reason); return; }
    assert.deepEqual(report.failures, []);
    assert.ok(report.steps.length >= 40);
});
