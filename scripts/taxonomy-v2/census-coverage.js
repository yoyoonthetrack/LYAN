'use strict';
/*
 * Mesure la couverture de la taxonomie v2 sur un export de recensement (voir docs/taxonomy/sql/readonly-census.sql).
 * Entrée : un JSON { "services": [[titre, nombre], ...], "requests": [[titre, nombre], ...] } (agrégats, minuscules).
 *   node scripts/taxonomy-v2/census-coverage.js export.json
 * N'accède à aucune base. Sortie : parts couvertes par la table de correspondance, par le classifieur, et titres à traiter en priorité.
 */
const fs = require('node:fs');
const lib = require('./lib');
const legacy = require('../../docs/taxonomy/data/legacy-map.data.js');

function main(file) {
    const input = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ctx = lib.build();
    const mapped = new Map(legacy.SKILL_TITLES.map((s) => [lib.normalize(s.title), s]));
    const total = (rows) => rows.reduce((a, r) => a + Number(r[1] || 0), 0);
    const report = {};
    const skills = input.services || [];
    let viaMap = 0; let viaResolver = 0; let none = 0; const todo = [];
    for (const [title, n] of skills) {
        const count = Number(n || 0);
        if (mapped.has(lib.normalize(title))) { viaMap += count; continue; }
        const r = lib.classify(title, ctx);
        if (r.status === 'CLASSIFIED') viaResolver += count; else { none += count; todo.push([title, count, r.status]); }
    }
    report.skills = { rows: total(skills), viaMapping: viaMap, viaResolver, unresolved: none };
    const reqs = input.requests || [];
    const by = { CLASSIFIED: 0, NEEDS_CLARIFICATION: 0, UNCLASSIFIED: 0 };
    const unresolved = [];
    for (const [title, n] of reqs) {
        const r = lib.classify(title, ctx);
        by[r.status] += Number(n || 0);
        if (r.status !== 'CLASSIFIED') unresolved.push([title, Number(n || 0), r.status]);
    }
    report.requests = { rows: total(reqs), ...by };
    report.topUnresolvedSkills = todo.sort((a, b) => b[1] - a[1]).slice(0, 40);
    report.topUnresolvedRequests = unresolved.sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) {
    if (!process.argv[2]) { console.error('usage: node scripts/taxonomy-v2/census-coverage.js export.json'); process.exit(1); }
    main(process.argv[2]);
}
module.exports = { main };
