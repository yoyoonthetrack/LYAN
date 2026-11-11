'use strict';
/*
 * Matrice de compatibilité des anciens clients — HORS APPLICATION, lecture seule.
 * Exécute le vrai code des builds TestFlight 1.0-15 / 1.0-16 et du code courant (filtres Annonces/Lyanneurs, familles de carte)
 * sur un enregistrement écrit par un client v2 pour CHAQUE nœud sélectionnable, selon plusieurs politiques d'écriture.
 *
 *   node scripts/taxonomy-v2/compat-matrix.js          → écrit docs/taxonomy/generated/legacy-compat-matrix.{json,csv}
 *   require('./compat-matrix').analyse()                → utilisé par les tests
 */
const fs = require('node:fs');
const path = require('node:path');
const compat = require('./compat');

const OUT = path.join(__dirname, '..', '..', 'docs', 'taxonomy', 'generated');

// Familles de la carte (8 pins historiques) attendues pour un nœud v2 (MAP_FAMILIES de la matrice de correspondance).
function expectedPin(node, byCode, mapFamilies) {
    const trade = node.kind === 'specialty' ? byCode.get(node.parent) : node;
    for (const f of mapFamilies) if (f.trades.includes(trade.code)) return f.old;
    for (const f of mapFamilies) if (f.trades.length === 0 && f.families.includes(trade.family) && f.old !== 'quotidien') return f.old;
    return 'quotidien';
}

function request(title, category, taxonomyId) {
    return { id: 'r', status: 'OPEN', title, description: '', category, taxonomy_id: taxonomyId || null, location: '', budget: null, profiles: null, created_at: '2026-11-11T00:00:00Z' };
}
function profile(services) { return { id: 'p', name: 'Lyanneur test', first_name: '', last_name: '', territory: '', city: '', bio: '', services }; }

function analyse({ builds = ['TestFlight 1.0-16'], only = null } = {}) {
    const { bridges, byCode } = compat.buildBridge();
    const leaves = compat.legacyLeaves.map((l) => ({ ...l }));
    const categories = [...new Set(leaves.map((l) => l.category))];
    const mapFamilies = compat.legacyMap.MAP_FAMILIES;
    const NEUTRAL_TITLE = 'Besoin d’aide';
    const rows = [];
    const clients = builds.map((label) => compat.loadOldClient(label));

    const filtersOf = () => [
        ...categories.map((c) => ({ id: `cat:${c}`, justifiedKey: `c:${c}`, filters: { category: c } })),
        ...leaves.map((l) => ({ id: `leaf:${compat.leafKey(l)}`, justifiedKey: `l:${compat.leafKey(l)}`, filters: { category: l.category, service: l.id } }))
    ];
    // Valeurs neutres exigées par discover() des anciens builds (budget '' = « pas de plafond », sinon toute annonce sans budget est écartée).
    const BASE_FILTERS = { query: '', area: '', urgency: '', budget: '', territory: '', commune: '', viewerTerritory: '' };
    const allFilters = filtersOf().map((f) => ({ ...f, filters: { ...BASE_FILTERS, ...f.filters } }));

    for (const entry of bridges.values()) {
        const node = entry.node;
        if (only && !only.has(node.code)) continue;
        const proj = compat.legacyProjection(entry, leaves);
        const justified = new Set();
        for (const key of entry.leaves) { justified.add(`l:${key}`); justified.add(`c:${compat.categoryOfKey(key)}`); }
        if (entry.category) justified.add(`c:${entry.category}`);
        // Ce que l'enregistrement ÉCRIT par la politique « bridge » doit atteindre : sa feuille (si écrite) + sa catégorie. Un enregistrement
        // ne porte qu'une seule taxonomy_id ; les autres feuilles du pont restent atteignables par leur catégorie commune.
        const expected = new Set();
        if (proj.category) expected.add(`c:${proj.category}`);
        if (proj.taxonomy_id) { const lf = leaves.find((l) => l.id === proj.taxonomy_id); if (lf) expected.add(`l:${compat.leafKey(lf)}`); }
        const justifiedCats = new Set([...justified].filter((k) => k.startsWith('c:')));
        const justifiedLeaves = new Set([...justified].filter((k) => k.startsWith('l:')));
        // Un client v2 qui n'écrit PAS de catégorie historique de remplacement (politique naïve) : libellé v2 + feuille NULL.
        const policies = {
            naive: { taxonomy_id: null, category: node.label },
            bridge: { taxonomy_id: proj.taxonomy_id, category: proj.category }
        };
        const perBuild = {};
        for (const client of clients) {
            const out = {};
            for (const [policyName, policy] of Object.entries(policies)) {
                for (const titleName of (policyName === 'naive' ? ['neutral', 'label'] : ['neutral'])) {
                    const rec = request(titleName === 'neutral' ? NEUTRAL_TITLE : node.label, policy.category, policy.taxonomy_id);
                    const hit = allFilters.filter((f) => client.discover([rec], leaves, f.filters, 'annonces').length > 0).map((f) => f.justifiedKey);
                    const hitSet = new Set(hit);
                    out[`${policyName}.${titleName}`] = {
                        hits: hit,
                        justifiedHit: [...justified].filter((k) => hitSet.has(k)).length,
                        justifiedExpected: justified.size,
                        expectedHit: [...expected].filter((k) => hitSet.has(k)).length,
                        expectedSize: expected.size,
                        unjustifiedHits: hit.filter((k) => !justified.has(k))
                    };
                }
            }
            // Compétence (Lyanneurs) : aucun champ structuré côté ancien client, seul le texte compte.
            const skillA = profile([{ title: node.label, description: node.label, category: node.label }]);
            const skillB = profile([{ title: node.label, description: node.label, category: proj.category }]);
            // Politique C : le titre porte le métier (« Plomberie · Fuite & recherche de fuite ») ; category = title comme aujourd'hui, donc AUCUN effet sur les quotas.
            const tradeLabel = node.kind === 'specialty' ? byCode.get(node.parent).label : null;
            const composed = tradeLabel ? `${tradeLabel} · ${node.label}` : node.label;
            const skillC = profile([{ title: composed, description: composed, category: composed }]);
            for (const [name, prof] of [['skillTitleOnly', skillA], ['skillLegacyCategory', skillB], ['skillComposedTitle', skillC]]) {
                const hit = allFilters.filter((f) => client.discover([prof], leaves, f.filters, 'lyanneurs').length > 0).map((f) => f.justifiedKey);
                const hitSet = new Set(hit);
                out[name] = { hits: hit, justifiedHit: [...justified].filter((k) => hitSet.has(k)).length, justifiedExpected: justified.size, unjustifiedHits: hit.filter((k) => !justified.has(k)) };
            }
            if (client.families) {
                const pin = (policy) => client.families.familyForRow({ category: policy.category, taxonomy_id: policy.taxonomy_id }, leaves);
                out.pin = { expected: expectedPin(node, byCode, mapFamilies), naive: pin(policies.naive), bridge: pin(policies.bridge) };
            }
            perBuild[client.label] = out;
        }
        rows.push({
            code: node.code, kind: node.kind, family: node.family, label: node.label, safety: node.safety,
            bridge: entry.kind, bridgeLeaves: entry.leaves, bridgeCategory: entry.category || (entry.leaves.length ? [...new Set(entry.leaves.map(compat.categoryOfKey))].join(' + ') : null),
            ambiguousCategories: entry.ambiguousCategories, projection: proj,
            justifiedCategories: [...justifiedCats].map((k) => k.slice(2)), justifiedLeaves: [...justifiedLeaves].map((k) => k.slice(2)),
            perBuild
        });
    }
    return { rows, builds, categories, leaves };
}

function summarise(result) {
    const out = { total: result.rows.length, byBridge: {}, byBuild: {} };
    for (const r of result.rows) out.byBridge[r.bridge] = (out.byBridge[r.bridge] || 0) + 1;
    const bridged = result.rows.filter((r) => r.bridge !== 'none');
    out.bridged = bridged.length;
    out.none = result.rows.length - bridged.length;
    for (const label of result.builds) {
        const s = { annoncesBridgeComplete: 0, annoncesBridgeMissing: [], annoncesBridgeFalsePositives: [], legacyHeuristicNoise: [], annoncesNaiveReach: 0, annoncesNaiveTextReach: 0, noneTextReach: 0, noneTextReachList: [], skillTitleOnlyReach: 0, skillLegacyCategoryReach: 0, skillComposedTitleReach: 0, skillBridgedTotal: bridged.length, pinWrongNaive: 0, pinWrongBridge: 0, pinTotal: 0 };
        for (const r of result.rows) {
            const b = r.perBuild[label];
            const bridgeNeutral = b['bridge.neutral'];
            if (r.bridge !== 'none') {
                if (bridgeNeutral.expectedHit === bridgeNeutral.expectedSize && bridgeNeutral.expectedSize > 0) s.annoncesBridgeComplete += 1; else s.annoncesBridgeMissing.push(r.code);
                // Au sens strict : un filtre justifié par une catégorie accrédite l'ensemble de ses feuilles (le filtre « catégorie » les contient toutes),
                // mais un filtre de FEUILLE non justifié est une fausse correspondance si la feuille n'est pas dans le pont.
                // Faux positifs STRUCTURELS : un filtre de FEUILLE qui accroche alors qu'il n'est pas dans le pont (jamais acceptable).
                const bad = bridgeNeutral.unjustifiedHits.filter((k) => k.startsWith('l:'));
                if (bad.length) s.annoncesBridgeFalsePositives.push({ code: r.code, hits: bad });
                // Bruit heuristique de l'ancien client : filtres de CATÉGORIE voisins accrochés par ses recoupements de mots (« Peinture » ↔ « Peinture & Dessin »,
                // « Déménagement » ↔ « Ménage »). L'enregistrement écrit est celui qu'un ancien client écrirait lui-même pour cette catégorie : ce bruit existe déjà aujourd'hui.
                const noise = bridgeNeutral.unjustifiedHits.filter((k) => k.startsWith('c:') && !r.justifiedCategories.includes(k.slice(2)));
                if (noise.length) s.legacyHeuristicNoise.push({ code: r.code, hits: noise });
                if (b['naive.neutral'].justifiedHit > 0) s.annoncesNaiveReach += 1;
                if (b['naive.label'].justifiedHit > 0) s.annoncesNaiveTextReach += 1;
                if (b.skillTitleOnly.justifiedHit > 0) s.skillTitleOnlyReach += 1;
                if (b.skillLegacyCategory.justifiedHit > 0) s.skillLegacyCategoryReach += 1;
                if (b.skillComposedTitle.justifiedHit > 0) s.skillComposedTitleReach += 1;
            } else if (b['naive.label'].hits.length > 0) { s.noneTextReach += 1; s.noneTextReachList.push({ code: r.code, hits: b['naive.label'].hits }); }
            if (b.pin) { s.pinTotal += 1; if (b.pin.naive !== b.pin.expected) s.pinWrongNaive += 1; if (b.pin.bridge !== b.pin.expected) s.pinWrongBridge += 1; }
        }
        // Répartition par famille : filtrable = l'enregistrement écrit atteint sa catégorie (et sa feuille quand elle existe).
        s.byFamily = {};
        for (const r of result.rows) {
            const b = r.perBuild[label]['bridge.neutral'];
            const slot = (s.byFamily[r.family] = s.byFamily[r.family] || { total: 0, filterable: 0, notFilterable: 0 });
            slot.total += 1;
            if (r.bridge !== 'none' && b.expectedSize > 0 && b.expectedHit === b.expectedSize) slot.filterable += 1; else slot.notFilterable += 1;
        }
        s.filterable = Object.values(s.byFamily).reduce((a, f) => a + f.filterable, 0);
        s.notFilterable = result.rows.length - s.filterable;
        out.byBuild[label] = s;
    }
    return out;
}

function toCsv(result) {
    const labels = result.builds;
    const head = ['code', 'type', 'famille', 'libelle', 'pont', 'taxonomy_id ecrit (feuille)', 'category ecrite', 'via', 'categories historiques justifiees', ...labels.map((l) => `${l} : filtres attendus atteints`), 'ambigu (plusieurs categories)'];
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [head.map(esc).join(',')];
    for (const r of result.rows) {
        lines.push([r.code, r.kind, r.family, r.label, r.bridge, r.projection.taxonomy_id ? r.bridgeLeaves[0] : '', r.projection.category, r.projection.via, r.justifiedCategories.join(' + '),
            ...labels.map((l) => `${r.perBuild[l]['bridge.neutral'].expectedHit}/${r.perBuild[l]['bridge.neutral'].expectedSize}`), r.ambiguousCategories.join(' + ')].map(esc).join(','));
    }
    return lines.join('\n') + '\n';
}

/**
 * Scénario T2 (coquilles de compatibilité) : même simulation, restreinte à la politique « pont », sur la liste de feuilles élargie.
 * Mesure aussi l'effet INVERSE : les nouvelles catégories accrochent-elles des enregistrements historiques existants (faux positifs créés) ?
 */
function analyseShells(label = 'TestFlight 1.0-16') {
    const scenario = compat.withShells();
    const client = compat.loadOldClient(label);
    const leaves = scenario.leaves;
    const categories = [...new Set(leaves.map((l) => l.category))];
    const BASE = { query: '', area: '', urgency: '', budget: '', territory: '', commune: '', viewerTerritory: '' };
    const filters = [...categories.map((c) => ({ key: `c:${c}`, f: { ...BASE, category: c } })), ...leaves.map((l) => ({ key: `l:${compat.leafKey(l)}`, f: { ...BASE, category: l.category, service: l.id } }))];
    const hitsOf = (rec) => new Set(filters.filter((x) => client.discover([rec], leaves, x.f, 'annonces').length > 0).map((x) => x.key));
    const out = { label, shells: scenario.shells.length, shellRows: scenario.shells.map((l) => ({ node: l.shellFor, universe: l.universe, category: l.category, subcategory: l.subcategory })), nodes: 0, filterable: 0, notFilterable: [], leafFalsePositives: [], categoryNoiseNodes: 0, legacyRecordsHitByShellFilters: [] };
    for (const entry of scenario.bridges.values()) {
        const proj = compat.legacyProjection(entry, leaves);
        const expected = new Set();
        if (proj.category) expected.add(`c:${proj.category}`);
        if (proj.taxonomy_id) { const lf = leaves.find((l) => l.id === proj.taxonomy_id); if (lf) expected.add(`l:${compat.leafKey(lf)}`); }
        const hits = proj.via === 'label-only' ? new Set() : hitsOf(request('Besoin d’aide', proj.category, proj.taxonomy_id));
        out.nodes += 1;
        const reached = expected.size > 0 && proj.via !== 'label-only' && [...expected].every((k) => hits.has(k));
        if (reached) out.filterable += 1; else out.notFilterable.push(entry.node.code);
        const justified = new Set(entry.leaves.flatMap((k) => [`l:${k}`, `c:${compat.categoryOfKey(k)}`]));
        if (entry.category) justified.add(`c:${entry.category}`);
        const unjust = [...hits].filter((k) => !justified.has(k));
        if (unjust.some((k) => k.startsWith('l:'))) out.leafFalsePositives.push({ code: entry.node.code, hits: unjust.filter((k) => k.startsWith('l:')) });
        if (unjust.some((k) => k.startsWith('c:'))) out.categoryNoiseNodes += 1;
    }
    // Effet sur l'existant : un enregistrement écrit par un ancien client pour une feuille historique accroche-t-il une catégorie « coquille » ?
    const shellKeys = new Set(scenario.shells.flatMap((l) => [`c:${l.category}`, `l:${compat.leafKey(l)}`]));
    for (const leaf of compat.legacyLeaves) {
        const rec = request('Besoin d’aide', leaf.category, leaf.id);
        const hit = [...hitsOf(rec)].filter((k) => shellKeys.has(k));
        if (hit.length) out.legacyRecordsHitByShellFilters.push({ leaf: compat.leafKey(leaf), hits: hit });
    }
    return out;
}

/** Parité : les trois builds exécutent le même matchesTaxonomy ; on le vérifie en rejouant un échantillon sur chacun. */
function parity(sampleEvery = 17) {
    const labels = compat.availableBuilds();
    const fingerprints = Object.fromEntries(labels.map((l) => [l, compat.matcherFingerprint(l)]));
    const same = new Set(Object.values(fingerprints)).size === 1;
    const codes = [...compat.buildBridge().bridges.keys()].filter((_, i) => i % sampleEvery === 0);
    const only = new Set(codes);
    const ref = analyse({ builds: [labels[0]], only });
    const diffs = [];
    for (const label of labels.slice(1)) {
        const other = analyse({ builds: [label], only });
        for (let i = 0; i < ref.rows.length; i += 1) {
            const a = ref.rows[i].perBuild[labels[0]];
            const b = other.rows[i].perBuild[label];
            for (const key of ['naive.neutral', 'naive.label', 'bridge.neutral', 'skillTitleOnly', 'skillLegacyCategory', 'skillComposedTitle']) {
                if (JSON.stringify(a[key].hits) !== JSON.stringify(b[key].hits)) diffs.push(`${ref.rows[i].code} ${label} ${key}`);
            }
        }
    }
    return { labels, fingerprints, sameMatcher: same, sampleSize: codes.length, diffs };
}

if (require.main === module) {
    const result = analyse();
    const summary = summarise(result);
    const par = parity();
    const shells = analyseShells();
    fs.mkdirSync(OUT, { recursive: true });
    const slim = result.rows.map(({ perBuild, ...rest }) => ({ ...rest, legacyClient: Object.fromEntries(Object.entries(perBuild).map(([k, v]) => [k, {
        bridgeNeutral: `${v['bridge.neutral'].expectedHit}/${v['bridge.neutral'].expectedSize}`, falsePositives: v['bridge.neutral'].unjustifiedHits.length,
        naiveNeutral: `${v['naive.neutral'].justifiedHit}/${v['naive.neutral'].justifiedExpected}`, naiveLabelHits: v['naive.label'].hits.length,
        skillTitleOnly: `${v.skillTitleOnly.justifiedHit}/${v.skillTitleOnly.justifiedExpected}`, skillLegacyCategory: `${v.skillLegacyCategory.justifiedHit}/${v.skillLegacyCategory.justifiedExpected}`, skillComposedTitle: `${v.skillComposedTitle.justifiedHit}/${v.skillComposedTitle.justifiedExpected}`, pin: v.pin || null }])) }));
    fs.writeFileSync(path.join(OUT, 'legacy-compat-matrix.json'), JSON.stringify({ summary: { ...summary, parity: par }, shellScenario: shells, rows: slim }, null, 1));
    fs.writeFileSync(path.join(OUT, 'legacy-compat-matrix.csv'), toCsv(result));
    console.log(JSON.stringify({ total: summary.total, byBridge: summary.byBridge, bridged: summary.bridged, none: summary.none, parity: par }, null, 1));
    console.log('T2 coquilles', JSON.stringify({ shells: shells.shells, nodes: shells.nodes, filterable: shells.filterable, notFilterable: shells.notFilterable.length, leafFalsePositives: shells.leafFalsePositives.length, categoryNoiseNodes: shells.categoryNoiseNodes, legacyRecordsHitByShellFilters: shells.legacyRecordsHitByShellFilters.length }));
    for (const [label, s] of Object.entries(summary.byBuild)) {
        console.log(label, JSON.stringify({ complete: s.annoncesBridgeComplete, missing: s.annoncesBridgeMissing.length, filterable: s.filterable, notFilterable: s.notFilterable, falsePos: s.annoncesBridgeFalsePositives.length, heuristicNoiseNodes: s.legacyHeuristicNoise.length, naiveStructured: s.annoncesNaiveReach, naiveText: s.annoncesNaiveTextReach, noneTextReach: s.noneTextReach, skillTitleOnly: s.skillTitleOnlyReach, skillLegacyCat: s.skillLegacyCategoryReach, skillComposed: s.skillComposedTitleReach, pinWrongNaive: s.pinWrongNaive, pinWrongBridge: s.pinWrongBridge, pinTotal: s.pinTotal }));
    }
}

module.exports = { analyse, analyseShells, summarise, toCsv, expectedPin, parity };
