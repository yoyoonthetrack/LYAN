'use strict';
/*
 * Taxonomie — compatibilité des anciens builds iOS/Android et gel conditionnel de l'ancienne API (phase 3.2B, Staging, local uniquement).
 *
 * Deux sources de preuve :
 *  · la matrice complète des 516 nœuds, générée par scripts/taxonomy-v2/compat-matrix.js (≈ 3 minutes) et committée ;
 *  · une exécution EN DIRECT du vrai code des builds TestFlight 1.0-15 / 1.0-16 sur un échantillon, pour qu'une modification du pont,
 *    de la correspondance ou des filtres ne puisse pas passer inaperçue.
 * Aucune écriture, aucun accès réseau.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const compat = require('../scripts/taxonomy-v2/compat');
const matrix = require('../scripts/taxonomy-v2/compat-matrix');
const projection = require('../scripts/taxonomy-v2/build-legacy-projection');

const GENERATED = path.join(ROOT, 'docs', 'taxonomy', 'generated');
const matrixJson = JSON.parse(fs.readFileSync(path.join(GENERATED, 'legacy-compat-matrix.json'), 'utf8'));
const TF16 = 'TestFlight 1.0-16';
const summary = matrixJson.summary.byBuild[TF16];

// ---------------------------------------------------------------------------------------------------------------------
// Matrice complète (artefact généré)
// ---------------------------------------------------------------------------------------------------------------------
test('matrice : 516 nœuds, 382 retrouvables par les filtres d\'un ancien build, 134 sans équivalent véridique', () => {
    assert.equal(matrixJson.summary.total, 516);
    assert.equal(matrixJson.rows.length, 516);
    assert.equal(summary.filterable, 382);
    assert.equal(summary.notFilterable, 134);
    assert.equal(summary.filterable + summary.notFilterable, 516);
    assert.equal(summary.annoncesBridgeComplete, 382);
    assert.deepEqual(summary.annoncesBridgeMissing, ['video_captation_live'], 'seul nœud couvert par deux catégories historiques : on n\'en choisit aucune');
    assert.equal(matrixJson.summary.bridged, 383);
    assert.equal(matrixJson.summary.none, 133);
});

test('matrice : aucun faux positif de FEUILLE ; le bruit de catégorie est celui de l\'ancien code lui-même', () => {
    assert.deepEqual(summary.annoncesBridgeFalsePositives, [], 'aucun filtre de feuille ne doit accrocher un nœud hors pont');
    assert.equal(summary.legacyHeuristicNoise.length, 33);
    // Ce bruit vient des recoupements de mots de matchesTaxonomy (« Déménagement » ↔ « Ménage »), pas du pont : on le prouve en l'obtenant sur des
    // enregistrements purement historiques, écrits comme un ancien client les écrit.
    const client = compat.loadOldClient(TF16);
    const base = { query: '', area: '', urgency: '', budget: '', territory: '', commune: '', viewerTerritory: '' };
    const record = (category) => ({ id: 'r', status: 'OPEN', title: 'Besoin d’aide', description: '', category, taxonomy_id: null, location: '', budget: null, profiles: null, created_at: '2026-11-11T00:00:00Z' });
    assert.equal(client.discover([record('Déménagement')], compat.legacyLeaves, { ...base, category: 'Ménage' }, 'annonces').length, 1, 'bruit historique : « Déménagement » accroche « Ménage »');
    assert.equal(client.discover([record('Garde d’enfants')], compat.legacyLeaves, { ...base, category: 'Garde d animaux' }, 'annonces').length, 1, 'bruit historique : « Garde d’enfants » accroche « Garde d animaux »');
});

test('matrice : les trois builds exécutent exactement le même filtre', () => {
    const par = matrixJson.summary.parity;
    assert.equal(par.sameMatcher, true);
    assert.deepEqual(par.diffs, []);
    assert.equal(new Set(Object.values(par.fingerprints)).size, 1);
    for (const label of compat.availableBuilds()) assert.equal(compat.matcherFingerprint(label), par.fingerprints[label]);
});

test('matrice : sans pont, l\'écriture « naïve » (libellé v2 dans category) ne retrouve que 133 nœuds, le pont 382', () => {
    assert.equal(summary.annoncesNaiveReach, 133);
    assert.ok(summary.annoncesBridgeComplete > 2.8 * summary.annoncesNaiveReach);
});

test('matrice : répartition par famille', () => {
    const f = summary.byFamily;
    assert.equal(Object.values(f).reduce((a, x) => a + x.total, 0), 516);
    assert.deepEqual(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.notFilterable])),
        { maison: 31, jardin: 14, entretien: 30, beaute: 14, transport: 7, famille: 3, evenement: 12, numerique: 20, autres: 3 });
    assert.equal(f.autres.filterable, 0, 'la famille « autres » n\'a volontairement aucun équivalent métier');
});

test('compétences (Lyanneurs) : le titre seul atteint 255 nœuds, le titre composé 364, la catégorie historique 382 (mais elle modifie le quota)', () => {
    assert.equal(summary.skillTitleOnlyReach, 255);
    assert.equal(summary.skillComposedTitleReach, 364);
    assert.equal(summary.skillLegacyCategoryReach, 382);
    assert.ok(summary.skillComposedTitleReach > summary.skillTitleOnlyReach);
});

test('scénario T2 (coquilles) : 32 feuilles de remplacement rendent 513 nœuds sur 516 retrouvables, sans effet sur l\'existant', () => {
    const t2 = matrixJson.shellScenario;
    assert.equal(t2.shells, 32);
    assert.equal(t2.shellRows.length, 32);
    assert.equal(t2.filterable, 513);
    assert.deepEqual(t2.notFilterable, ['autre_demande', 'autre_demande_non_classee', 'autre_demande_service_direct']);
    assert.deepEqual(t2.leafFalsePositives, []);
    assert.deepEqual(t2.legacyRecordsHitByShellFilters, [], 'aucun enregistrement historique n\'accroche une catégorie coquille');
    for (const row of t2.shellRows) assert.equal(row.category, row.subcategory, 'une coquille est exactement aussi précise que son nœud');
});

test('CSV : une ligne par nœud, cohérente avec le JSON', () => {
    const csv = fs.readFileSync(path.join(GENERATED, 'legacy-compat-matrix.csv'), 'utf8').trim().split('\n');
    assert.equal(csv.length, 517);
    assert.match(csv[0], /taxonomy_id ecrit/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Exécution en direct sur un échantillon
// ---------------------------------------------------------------------------------------------------------------------
const { bridges } = compat.buildBridge();
const allCodes = [...bridges.keys()];
const SAMPLE = new Set([...allCodes.filter((_, i) => i % 23 === 0), 'plomberie', 'plomberie_fuite', 'demenagement', 'garde_enfants', 'peinture', 'coiffure_afro', 'video_captation_live', 'autre_demande'].filter((c) => bridges.has(c)));

test('direct : chaque nœud de l\'échantillon reste retrouvable par le filtre de sa catégorie (et de sa feuille quand elle existe)', { timeout: 120000 }, () => {
    const live = matrix.analyse({ builds: [TF16], only: SAMPLE });
    assert.ok(live.rows.length >= 20);
    for (const row of live.rows) {
        const result = row.perBuild[TF16]['bridge.neutral'];
        if (row.code === 'video_captation_live' || row.bridge === 'none') continue;
        assert.equal(result.expectedHit, result.expectedSize, `${row.code} (${row.bridge}) : filtres attendus ${JSON.stringify(row.projection)}`);
        assert.ok(result.expectedSize >= 1);
        assert.deepEqual(result.unjustifiedHits.filter((k) => k.startsWith('l:')), [], `${row.code} : aucune feuille hors pont`);
    }
});

test('direct : jamais plus précis que le nœud — une feuille n\'est écrite que si elle est la seule possible', () => {
    for (const entry of bridges.values()) {
        const proj = compat.legacyProjection(entry, compat.legacyLeaves);
        if (proj.via === 'leaf') assert.equal(entry.leaves.length, 1, entry.node.code);
        if (proj.via === 'category-of-leaves') assert.equal(new Set(entry.leaves.map(compat.categoryOfKey)).size, 1, entry.node.code);
        if (entry.kind === 'none') assert.equal(proj.via, 'label-only', `${entry.node.code} : rien de véridique à écrire`);
    }
});

test('direct : un enregistrement « Général » ou « Autre » n\'accroche AUCUN filtre (aucune fausse catégorie par défaut)', () => {
    const base = { query: '', area: '', urgency: '', budget: '', territory: '', commune: '', viewerTerritory: '' };
    const categories = [...new Set(compat.legacyLeaves.map((l) => l.category))];
    for (const label of compat.availableBuilds()) {
        const client = compat.loadOldClient(label);
        for (const category of ['Général', 'Autre / Je ne trouve pas', '']) {
            const rec = { id: 'r', status: 'OPEN', title: 'Besoin d’aide', description: '', category, taxonomy_id: null, location: '', budget: null, profiles: null, created_at: '2026-11-11T00:00:00Z' };
            const hits = categories.filter((c) => client.discover([rec], compat.legacyLeaves, { ...base, category: c }, 'annonces').length > 0);
            assert.deepEqual(hits, [], `${label} : « ${category} »`);
        }
    }
});

// ---------------------------------------------------------------------------------------------------------------------
// Projection historique (brouillon 08) : données générées
// ---------------------------------------------------------------------------------------------------------------------
test('projection : le brouillon 08 committé est exactement celui que génère le pont', () => {
    assert.equal(fs.readFileSync(projection.OUT, 'utf8'), projection.render());
});

test('projection : 382 nœuds, jamais « autres », jamais un nœud sans pont, feuilles existantes et cohérentes avec la correspondance', () => {
    const rows = projection.projectionRows();
    assert.equal(rows.length, 382);
    const { byCode } = compat.buildBridge();
    const leafKeys = new Set(compat.legacyLeaves.map(compat.leafKey));
    const mapByKey = new Map(compat.legacyMap.LEAVES.map((m) => [compat.leafKey(m), m]));
    for (const row of rows) {
        const node = byCode.get(row.code);
        assert.ok(node && node.selectable, row.code);
        assert.notEqual(node.family, 'autres', row.code);
        assert.notEqual(bridges.get(row.code).kind, 'none', row.code);
        assert.ok(row.category.trim().length > 0);
        if (row.leafKey) {
            assert.equal(row.via, 'leaf');
            assert.ok(leafKeys.has(row.leafKey), `${row.code} : feuille inconnue ${row.leafKey}`);
            const mapped = mapByKey.get(row.leafKey);
            const targets = new Set([mapped.node, ...mapped.alt]);
            const related = targets.has(row.code) || targets.has(node.parent) || [...targets].some((t) => byCode.get(t) && byCode.get(t).parent === row.code);
            assert.ok(related, `${row.code} : la feuille ${row.leafKey} n'est pas un parent ou un équivalent du nœud`);
        } else {
            assert.notEqual(row.via, 'leaf');
        }
    }
});

// ---------------------------------------------------------------------------------------------------------------------
// Gel conditionnel de l'ancienne API de gestion de la taxonomie (B6) — éteint par défaut, rien n'est désactivé
// ---------------------------------------------------------------------------------------------------------------------
const server = fs.readFileSync(path.join(ROOT, 'api', 'server.js'), 'utf8');
const routeBlock = (header) => {
    const start = server.indexOf(header);
    assert.ok(start >= 0, header);
    const next = server.indexOf('\napp.', start + header.length);
    return server.slice(start, next);
};

test('gel B6 : variable stricte, éteinte par défaut, écritures seulement', () => {
    assert.match(server, /const legacyTaxonomyWritesFrozen = \(\) => process\.env\.LYANN_FREEZE_LEGACY_TAXONOMY_WRITES === 'true';/);
    const source = server.slice(server.indexOf('const legacyTaxonomyWritesFrozen'), server.indexOf("app.get('/v1/admin/taxonomy'"));
    const run = (value) => {
        const calls = [];
        const context = { process: { env: value === undefined ? {} : { LYANN_FREEZE_LEGACY_TAXONOMY_WRITES: value } }, result: null };
        vm.runInNewContext(`${source}\nresult = { frozen: legacyTaxonomyWritesFrozen(), refuse: refuseFrozenLegacyTaxonomyWrite({ status(code) { return { json(body) { return { code, body }; } }; } }) };`, context);
        calls.push(context.result);
        return context.result;
    };
    assert.equal(run(undefined).frozen, false);
    for (const value of ['false', '', '1', 'TRUE', 'yes']) assert.equal(run(value).frozen, false, value);
    const on = run('true');
    assert.equal(on.frozen, true);
    assert.equal(on.refuse.code, 423);
    assert.equal(on.refuse.body.code, 'LEGACY_TAXONOMY_FROZEN');
    assert.equal(on.refuse.body.success, false);
});

test('gel B6 : le garde passe APRÈS la vérification des droits (un non-admin reste 401/403) et ne touche pas la lecture', () => {
    for (const header of ["app.post('/v1/admin/taxonomy'", "app.patch('/v1/admin/taxonomy/:id'"]) {
        const block = routeBlock(header);
        const auth = block.indexOf("verifyAdminPermission(req, 'moderation.manage')");
        const guard = block.indexOf('if (legacyTaxonomyWritesFrozen()) return refuseFrozenLegacyTaxonomyWrite(res);');
        assert.ok(auth > 0 && guard > auth, header);
        assert.ok(guard < block.indexOf('supabaseAdmin'), `${header} : refus avant toute écriture`);
    }
    assert.doesNotMatch(routeBlock("app.get('/v1/admin/taxonomy'"), /legacyTaxonomyWritesFrozen/);
    assert.doesNotMatch(server, /app\.delete\('\/v1\/admin\/taxonomy/);
});

test('B6 consommateurs : seule la lecture (GET) de l\'ancienne API est appelée, jamais POST ni PATCH', () => {
    const files = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, f)), ...fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'scripts', f))];
    const consumers = [];
    for (const file of files) {
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.matchAll(/\/v1\/admin\/taxonomy[^\n]*/g)) consumers.push({ file: path.relative(ROOT, file), line: m[0] });
    }
    assert.deepEqual([...new Set(consumers.map((c) => c.file))].sort(), ['admin-script.js', 'scripts/admin-pr5-staging-circuit.js']);
    for (const c of consumers) assert.doesNotMatch(c.line, /POST|PATCH|PUT|DELETE/i, `${c.file} : ${c.line}`);
    const adminScript = fs.readFileSync(path.join(ROOT, 'admin-script.js'), 'utf8');
    assert.doesNotMatch(adminScript, /fetchWithAdminAuth\(\s*[`'"]\/v1\/admin\/taxonomy[^)]*method\s*:\s*['"](POST|PATCH)/);
});
