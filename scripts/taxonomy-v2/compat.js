'use strict';
/*
 * Compatibilité des anciens builds iOS/Android (phase 3.2B — validation Staging). Outillage HORS APPLICATION.
 *
 * Deux briques :
 *  1. buildBridge()   : pour chaque nœud v2 sélectionnable, quelle(s) feuille(s) ou catégorie(s) de l'ancienne taxonomie en sont
 *                       une généralisation VÉRITABLE (jamais une approximation) ;
 *  2. loadOldClient() : charge le VRAI code des anciens builds (artifacts/testflight-15 et -16 : matchesTaxonomy, discover,
 *                       familyForRow) dans un contexte isolé pour mesurer ce que verrait réellement un ancien client.
 *
 * Règle absolue : on n'attribue jamais une catégorie métier fausse pour « faire marcher » un filtre. Un pont n'existe que si
 * l'ancienne feuille (ou catégorie) est identique au nœud, ou plus large et le contient (relation « est une sorte de »).
 * Un pont ne rend jamais le nœud PLUS précis qu'il n'est : on n'écrit pas une sous-catégorie historique pour un nœud plus large.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lib = require('./lib');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'docs', 'taxonomy', 'data');
const legacyMap = require(path.join(DATA, 'legacy-map.data.js'));
const legacyLeaves = require(path.join(DATA, 'legacy-taxonomy-staging.js')).LEAVES;

const leafKey = (l) => `${l.universe}|${l.category}|${l.subcategory}`;
const categoryOfKey = (key) => key.split('|')[1];

/** Un pont est « véridique » si la correspondance n'est ni ambiguë ni à décider. */
const TRUTHFUL_KINDS = new Set(['exact', 'merge', 'broad', 'split']);

/**
 * Ponts nœud v2 → ancienne taxonomie.
 *  - direct     : le nœud est la cible d'une feuille (exact / merge / broad / split) → taxonomy_id = cette feuille
 *  - covered    : le nœud figure parmi les cibles alternatives d'une feuille plus large (broad / split) → idem
 *  - inherited  : spécialité d'un métier qui a un pont (feuille ou catégorie) → même pont que le métier
 *  - category   : aucune feuille ne convient (elle serait plus précise que le nœud) mais TOUT ce que l'ancienne taxonomie sait
 *                 dire de ce métier tient dans UNE seule catégorie historique → on n'écrit que cette catégorie (taxonomy_id NULL)
 *  - none       : aucun pont véridique (domaine absent de l'ancienne taxonomie, ou plusieurs catégories historiques possibles)
 */
function buildBridge() {
    const { nodes, byCode } = lib.flatten();
    const keyToLeaf = new Map(legacyLeaves.map((l) => [leafKey(l), l]));
    const own = new Map(); // code → { direct, covered, ambiguous }
    const get = (code) => {
        if (!own.has(code)) own.set(code, { direct: new Set(), covered: new Set(), ambiguous: new Set() });
        return own.get(code);
    };
    for (const m of legacyMap.LEAVES) {
        const key = leafKey(m);
        if (!keyToLeaf.has(key)) throw new Error(`feuille historique inconnue de Staging : ${key}`);
        if (TRUTHFUL_KINDS.has(m.kind)) {
            get(m.node).direct.add(key);
            if (m.kind === 'broad' || m.kind === 'split') for (const alt of m.alt) get(alt).covered.add(key);
        } else {
            get(m.node).ambiguous.add(key);
            for (const alt of m.alt) get(alt).ambiguous.add(key);
        }
    }

    const children = new Map();
    for (const node of nodes) if (node.kind === 'specialty') { if (!children.has(node.parent)) children.set(node.parent, []); children.get(node.parent).push(node); }

    const result = new Map();
    const leafLevel = (code) => { const o = own.get(code); return o ? (o.direct.size ? { kind: 'direct', leaves: [...o.direct] } : o.covered.size ? { kind: 'covered', leaves: [...o.covered] } : null) : null; };

    for (const node of nodes) {
        if (node.kind !== 'trade' || !node.selectable) continue;
        let bridge = leafLevel(node.code);
        let category = null;
        let ambiguousCategories = [];
        if (!bridge) {
            // Tout ce que l'ancienne taxonomie rattache au sous-arbre de ce métier (feuilles véridiques uniquement).
            const subtree = [node, ...(children.get(node.code) || [])];
            const keys = new Set();
            for (const n of subtree) { const o = own.get(n.code); if (o) { o.direct.forEach((k) => keys.add(k)); o.covered.forEach((k) => keys.add(k)); } }
            const categories = [...new Set([...keys].map(categoryOfKey))];
            if (categories.length === 1) category = categories[0];
            else if (categories.length > 1) ambiguousCategories = categories;
        }
        const tradeEntry = { node, kind: bridge ? bridge.kind : (category ? 'category' : 'none'), leaves: bridge ? bridge.leaves : [], category, ambiguousCategories };
        result.set(node.code, tradeEntry);
        for (const spec of children.get(node.code) || []) {
            if (!spec.selectable) continue;
            const specOwn = leafLevel(spec.code);
            if (specOwn) result.set(spec.code, { node: spec, kind: specOwn.kind, leaves: specOwn.leaves, category: null, ambiguousCategories: [] });
            else if (tradeEntry.kind === 'direct' || tradeEntry.kind === 'covered') result.set(spec.code, { node: spec, kind: 'inherited', leaves: tradeEntry.leaves, category: null, ambiguousCategories: [] });
            else if (tradeEntry.kind === 'category') result.set(spec.code, { node: spec, kind: 'inherited', leaves: [], category: tradeEntry.category, ambiguousCategories: [] });
            else result.set(spec.code, { node: spec, kind: 'none', leaves: [], category: null, ambiguousCategories: tradeEntry.ambiguousCategories });
        }
    }
    for (const [code, o] of own) if (result.has(code)) result.get(code).ambiguous = [...o.ambiguous];
    return { bridges: result, nodes, byCode };
}

/** Champs historiques qu'écrirait un client v2 pour un nœud : jamais de valeur plus précise que le nœud. */
function legacyProjection(entry, leavesWithIds) {
    const keyToId = new Map(leavesWithIds.map((l) => [leafKey(l), l.id]));
    if (entry.leaves.length) {
        // plusieurs feuilles possibles (cas « covered ») : on n'en choisit AUCUNE seule, on n'écrit que leur catégorie commune si elle est unique
        const categories = [...new Set(entry.leaves.map(categoryOfKey))];
        if (entry.leaves.length === 1) return { taxonomy_id: keyToId.get(entry.leaves[0]), category: categories[0], via: 'leaf' };
        if (categories.length === 1) return { taxonomy_id: null, category: categories[0], via: 'category-of-leaves' };
        return { taxonomy_id: null, category: entry.node.label, via: 'label-only' };
    }
    if (entry.category) return { taxonomy_id: null, category: entry.category, via: 'category' };
    return { taxonomy_id: null, category: entry.node.label, via: 'label-only' };
}

/**
 * Scénario T2 « coquilles de compatibilité » (HYPOTHÈSE, rien n'est écrit nulle part) : pour chaque métier (ou spécialité isolée) sans pont
 * véridique, une feuille historique de remplacement portant SON PROPRE libellé. Les anciens clients chargent la liste des feuilles depuis
 * lyann_taxonomy : la ligne apparaîtrait dans leur menu de filtres sans mise à jour de l'application. Aucune catégorie existante n'est
 * réutilisée : la feuille est exactement aussi précise que le métier.
 */
function withShells(base = buildBridge()) {
    const { bridges, byCode } = base;
    const leaves = legacyLeaves.map((l) => ({ ...l }));
    const probe = leaves;
    const unfilterable = (entry) => entry.node.family !== 'autres' && (entry.kind === 'none' || legacyProjection(entry, probe).via === 'label-only');
    const shells = new Map();
    const shellFor = (target) => {
        if (!shells.has(target.code)) {
            const family = byCode.get(target.family);
            shells.set(target.code, { id: `shell-${target.code}`, universe: family ? family.label : 'Autres', category: target.label, subcategory: target.label, synonyms: [], safety_level: 'NORMAL', active: true, shellFor: target.code });
        }
        return shells.get(target.code);
    };
    const out = new Map();
    for (const [code, entry] of bridges) {
        if (!unfilterable(entry)) { out.set(code, entry); continue; }
        const trade = entry.node.kind === 'specialty' ? bridges.get(entry.node.parent) : entry;
        const target = entry.node.kind === 'specialty' && trade && unfilterable(trade) ? byCode.get(entry.node.parent) : entry.node;
        const shell = shellFor(target);
        out.set(code, { node: entry.node, kind: 'shell', leaves: [leafKey(shell)], category: null, ambiguousCategories: [], ambiguous: [] });
    }
    return { bridges: out, nodes: base.nodes, byCode, leaves: [...leaves, ...shells.values()], shells: [...shells.values()] };
}

// ---------------------------------------------------------------------------------------------------------------------
// Anciens clients : exécution du code réellement embarqué
// ---------------------------------------------------------------------------------------------------------------------
const BUILDS = {
    'TestFlight 1.0-15': path.join(ROOT, 'artifacts', 'testflight-15', 'LYANN-1.0-15.xcarchive', 'Products', 'Applications', 'App.app', 'public'),
    'TestFlight 1.0-16': path.join(ROOT, 'artifacts', 'testflight-16', 'LYANN-1.0-16.xcarchive', 'Products', 'Applications', 'App.app', 'public'),
    'Code courant (Staging)': ROOT
};

function loadOldClient(label) {
    const dir = BUILDS[label];
    const Classifier = require(path.join(dir, 'ai-classifier.js')).LyanAIClassifier;
    const ai = new Classifier();
    // Mémoïsation pure (même résultat, même fonction) : la simulation appelle normalizeText des millions de fois.
    const original = ai.normalizeText.bind(ai);
    const memo = new Map();
    ai.normalizeText = (value) => { const key = String(value); let hit = memo.get(key); if (hit === undefined) { hit = original(key); memo.set(key, hit); } return hit; };
    const window = { LyanAI: ai, addEventListener() {}, LYANN_ANNONCE_FORMAT: { dateMode: () => null } };
    const run = (file) => vm.runInNewContext(fs.readFileSync(path.join(dir, file), 'utf8'), { window, console, Intl, Date, URL, setTimeout, clearTimeout }, { filename: file });
    run('explorer-repository.js');
    let families = null;
    if (fs.existsSync(path.join(dir, 'needs-map-category-families.js'))) { run('needs-map-category-families.js'); families = window.LYANN_MAP_CATEGORY_FAMILIES; }
    return { label, discover: window.LYANN_EXPLORER_REPOSITORY.discover, families, ai: window.LyanAI };
}

/** Empreinte de matchesTaxonomy : tant qu'elle est identique, un seul build suffit à simuler les filtres des trois. */
function matcherFingerprint(label) {
    const src = fs.readFileSync(path.join(BUILDS[label], 'explorer-repository.js'), 'utf8');
    return require('node:crypto').createHash('sha1').update(src.match(/function matchesTaxonomy[\s\S]*?\n    \}\n/)[0]).digest('hex').slice(0, 12);
}

const availableBuilds = () => Object.keys(BUILDS).filter((label) => fs.existsSync(path.join(BUILDS[label], 'explorer-repository.js')));

module.exports = { buildBridge, withShells, legacyProjection, loadOldClient, availableBuilds, matcherFingerprint, leafKey, categoryOfKey, TRUTHFUL_KINDS, BUILDS, legacyMap, legacyLeaves };
