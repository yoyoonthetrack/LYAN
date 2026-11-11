'use strict';
/*
 * Compétences que le rétro-remplissage (05) ne rattache PAS à un nœud v2 : analyse déterministe, hors application, aucun accès réseau.
 *
 * Entrées : l'agrégat Staging committé (docs/taxonomy/data/staging-snapshot.json : titre normalisé, catégorie normalisée, nombre de lignes),
 * la table de correspondance (legacy-map.data.js) et le référentiel (generated/taxonomy-v2.json). Aucune donnée personnelle, aucun identifiant.
 *
 * La règle de rattachement REPRODUIT celle de 05 (`lyann_legacy_certain_node`) : un titre n'est rattaché que si la correspondance est certaine
 * (exact/broad, ou toutes ses cibles sous un même métier). Le reste est réparti en trois groupes :
 *
 *   recoverable             Récupérable sans ambiguïté : le titre ne désigne qu'UN métier. Par construction c'est déjà rattaché par 05 : ce groupe est donc
 *                           vide parmi les non rattachées (théorème vérifié par le test) ; il n'existe ici que pour que la règle soit explicite et testée.
 *   needs_member_precision  Précision du membre : le titre est un vrai besoin mais désigne 2 à 4 métiers possibles. La liste des candidats vient de la table
 *                           de correspondance (jamais d'une devinette) ; le membre choisit.
 *   out_of_reference        Hors référentiel ou trop général : texte libre énumérant plusieurs intentions, ou mot qui recouvre 5 métiers ou plus
 *                           (« Dépannage »). Aucun choix de métier n'est suggéré : recherche libre guidée, ou conserver tel quel.
 *
 * Aucune donnée historique n'est modifiée : le titre, la catégorie, le prix et la description d'une compétence ne changent jamais ; seul le nœud
 * (taxonomy_node_code) peut être renseigné, par le membre.
 *
 *   node scripts/taxonomy-v2/unattached-skills.js            affiche le résumé
 *   node scripts/taxonomy-v2/unattached-skills.js --write    régénère docs/taxonomy/generated/unattached-skills.{json,csv}
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const DATA = path.join(ROOT, 'docs', 'taxonomy', 'data');
const GENERATED = path.join(ROOT, 'docs', 'taxonomy', 'generated');

const MANY_TRADES = 5;
const key = (s) => String(s == null ? '' : s).trim().toLowerCase();
const fold = (s) => key(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

function load() {
    const snapshot = JSON.parse(fs.readFileSync(path.join(DATA, 'staging-snapshot.json'), 'utf8'));
    const legacy = require(path.join(DATA, 'legacy-map.data.js'));
    const taxonomy = JSON.parse(fs.readFileSync(path.join(GENERATED, 'taxonomy-v2.json'), 'utf8'));
    return { snapshot, legacy, taxonomy };
}

/** Reproduit lyann_legacy_certain_node pour un titre : { node, precisionNeeded, trades } (node null = plusieurs métiers). */
function certainNode(entry, nodes) {
    const tradeOf = (code) => { const n = nodes.get(code); if (!n) throw new Error(`nœud inconnu dans la correspondance : ${code}`); return n.kind === 'specialty' ? n.parent : n.code; };
    const all = [entry.node, ...(entry.alt || [])];
    const trades = [...new Set(all.map(tradeOf))];
    if (entry.kind === 'exact' || entry.kind === 'broad' || !(entry.alt || []).length) return { node: entry.node, precisionNeeded: false, trades };
    if (trades.length === 1) return { node: trades[0], precisionNeeded: true, trades };
    return { node: null, precisionNeeded: false, trades };
}

/** Groupe d'un titre non rattaché. Pur : testé sur des cas synthétiques. */
function bucketFor(title, trades) {
    if (trades.length <= 1) return 'recoverable';
    if (/[,;]/.test(title) || trades.length >= MANY_TRADES) return 'out_of_reference';
    return 'needs_member_precision';
}

function analyse(input) {
    const { snapshot, legacy, taxonomy } = input || load();
    const nodes = new Map(taxonomy.nodes.map((n) => [n.code, n]));
    const byTitle = new Map(legacy.SKILL_TITLES.map((s) => [key(s.title), s]));
    const ambiguous = taxonomy.ambiguousTerms || {};
    const attached = { rows: 0, titles: 0 };
    const unattached = [];
    let totalRows = 0;
    for (const [titleLower, categoryLower, rows] of snapshot.services) {
        totalRows += rows;
        const entry = byTitle.get(key(titleLower));
        const certain = entry ? certainNode(entry, nodes) : null;
        if (certain && certain.node) { attached.rows += rows; attached.titles += 1; continue; }
        const trades = certain ? certain.trades : [];
        const candidates = entry ? [entry.node, ...(entry.alt || [])].map((code) => {
            const n = nodes.get(code);
            const tradeCode = n.kind === 'specialty' ? n.parent : n.code;
            return { code, label: n.label, trade: tradeCode, tradeLabel: nodes.get(tradeCode).label, specialty: n.kind === 'specialty', selectable: n.selectable !== false };
        }) : [];
        const question = Object.entries(ambiguous).find(([term]) => fold(term) === fold(titleLower));
        unattached.push({
            title: titleLower, category: categoryLower, rows,
            mapping: entry ? entry.kind : 'none',
            bucket: entry ? bucketFor(titleLower, trades) : 'out_of_reference',
            candidateTrades: trades.length,
            candidates,
            suggestionFirst: entry ? entry.node : null,
            question: question ? question[1].question : null,
            note: entry && entry.note ? entry.note : null
        });
    }
    unattached.sort((a, b) => b.rows - a.rows || a.title.localeCompare(b.title, 'fr'));
    const bucketRows = (b) => unattached.filter((u) => u.bucket === b).reduce((a, u) => a + u.rows, 0);
    const bucketTitles = (b) => unattached.filter((u) => u.bucket === b).length;
    return {
        meta: {
            source: 'docs/taxonomy/data/staging-snapshot.json (agrégat Staging du 11 nov. 2026, données de recette) ; docs/taxonomy/data/legacy-map.data.js ; docs/taxonomy/generated/taxonomy-v2.json',
            rule: 'reproduit lyann_legacy_certain_node (05) ; aucune donnée personnelle ; aucune écriture',
            manyTradesThreshold: MANY_TRADES
        },
        totals: { services: totalRows, attached: attached.rows, unattached: unattached.reduce((a, u) => a + u.rows, 0), unattachedTitles: unattached.length },
        buckets: {
            recoverable: { rows: bucketRows('recoverable'), titles: bucketTitles('recoverable') },
            needs_member_precision: { rows: bucketRows('needs_member_precision'), titles: bucketTitles('needs_member_precision') },
            out_of_reference: { rows: bucketRows('out_of_reference'), titles: bucketTitles('out_of_reference') }
        },
        items: unattached
    };
}

function toCsv(report) {
    const esc = (v) => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['title', 'category', 'rows', 'bucket', 'mapping', 'candidate_trades', 'candidates', 'question'];
    const lines = report.items.map((i) => [i.title, i.category, i.rows, i.bucket, i.mapping, i.candidateTrades, i.candidates.map((c) => `${c.code}`).join('|'), i.question || ''].map(esc).join(','));
    return `${[head.join(','), ...lines].join('\n')}\n`;
}

module.exports = { analyse, bucketFor, certainNode, toCsv, load, MANY_TRADES };

if (require.main === module) {
    const report = analyse();
    if (process.argv.includes('--write')) {
        fs.writeFileSync(path.join(GENERATED, 'unattached-skills.json'), `${JSON.stringify(report, null, 1)}\n`);
        fs.writeFileSync(path.join(GENERATED, 'unattached-skills.csv'), toCsv(report));
        console.log('écrit : docs/taxonomy/generated/unattached-skills.{json,csv}');
    }
    console.log(JSON.stringify({ totals: report.totals, buckets: report.buckets }, null, 2));
    for (const i of report.items) console.log(`${String(i.rows).padStart(3)}  ${i.bucket.padEnd(22)} ${i.title}  [${i.candidateTrades} métiers]`);
}
