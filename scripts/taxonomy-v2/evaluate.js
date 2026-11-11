#!/usr/bin/env node
'use strict';
/*
 * Banc d'évaluation de la classification (lecture seule, local, aucune donnée de production).
 * Usage :
 *   node scripts/taxonomy-v2/evaluate.js                      → jeux du dépôt, tableau par jeu et par région
 *   node scripts/taxonomy-v2/evaluate.js --cases fichier.json → échantillon externe [{ q, accept:[métiers], region?, family? }]
 *   (l'échantillon réel est produit par census-coverage.js ; voir docs/taxonomy/10-product-review.md §8)
 * Mesures : strict (CLASSIFIED + bon métier), sûr (strict, ou clarification contenant le bon métier),
 *           erreur silencieuse (CLASSIFIED avec un mauvais métier), non résolu (UNCLASSIFIED).
 */
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const DATA = lib.DATA_DIR;
const ctx = lib.build();
const tradeOfNode = (code) => { const n = ctx.byCode.get(code); return n ? lib.tradeOf(n, ctx.byCode).code : null; };

function judge(c) {
    const r = lib.classify(c.q, ctx);
    const top = r.ranked[0];
    const accept = [].concat(c.accept || c.trade || []);
    const classified = r.status === 'CLASSIFIED';
    const strict = classified && accept.includes(top.trade);
    const clarifies = r.status === 'NEEDS_CLARIFICATION' && r.ranked.slice(0, 3).some((x) => accept.includes(x.trade));
    return {
        q: c.q, region: c.region || 'tous', set: c.set, status: r.status, top: top && top.trade, accept,
        strict, safe: strict || clarifies, silentError: classified && !accept.includes(top.trade), unresolved: r.status === 'UNCLASSIFIED',
        top3: r.ranked.slice(0, 3).some((x) => accept.includes(x.trade)), family: top ? tradeOfNode(top.node) && ctx.byCode.get(top.node).family : null
    };
}

function summarize(rows, key) {
    const groups = new Map();
    for (const r of rows) { const k = key(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    return [...groups].map(([k, g]) => ({
        group: k, n: g.length,
        strict: g.filter((r) => r.strict).length / g.length,
        top3: g.filter((r) => r.top3).length / g.length,
        safe: g.filter((r) => r.safe).length / g.length,
        silentErrors: g.filter((r) => r.silentError).length,
        unresolved: g.filter((r) => r.unresolved).length / g.length
    }));
}

function loadRepoSets() {
    const territorial = require(path.join(DATA, 'classification-territorial.js'));
    const heldout = require(path.join(DATA, 'classification-heldout.js'));
    return [
        ...heldout.filter((c) => !c.status).map((c) => ({ ...c, set: 'général (hors échantillon)', region: 'tous' })),
        ...territorial.tuned.map((c) => ({ ...c, set: 'territorial (réglé)' })),
        ...territorial.heldout.map((c) => ({ ...c, set: 'territorial (hors échantillon)' }))
    ];
}

function run(argv = process.argv.slice(2)) {
    const i = argv.indexOf('--cases');
    const cases = i >= 0 ? JSON.parse(fs.readFileSync(argv[i + 1], 'utf8')).map((c) => ({ ...c, set: 'externe' })) : loadRepoSets();
    const rows = cases.map(judge);
    return { rows, bySet: summarize(rows, (r) => r.set), byRegion: summarize(rows, (r) => `${r.set} · ${r.region}`) };
}

if (require.main === module) {
    const { rows, bySet, byRegion } = run();
    const pct = (x) => `${(x * 100).toFixed(0)} %`;
    for (const [title, list] of [['Par jeu', bySet], ['Par jeu et région', byRegion]]) {
        console.log(`\n${title}\n${'-'.repeat(title.length)}`);
        for (const s of list) console.log(`${s.group.padEnd(48)} n=${String(s.n).padStart(3)}  strict ${pct(s.strict).padStart(5)}  top-3 ${pct(s.top3).padStart(5)}  sûr ${pct(s.safe).padStart(5)}  erreurs silencieuses ${s.silentErrors}  non résolu ${pct(s.unresolved)}`);
    }
    console.log('\nÉchecs :');
    for (const r of rows.filter((x) => !x.safe)) console.log(`  [${r.set} · ${r.region}] « ${r.q} » → ${r.status} ${r.top || '-'} (attendu ${r.accept.join('/')})`);
}

module.exports = { run, judge, summarize, loadRepoSets };
