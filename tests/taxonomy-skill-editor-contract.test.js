'use strict';
/*
 * Contrat de la FUTURE interface d'édition des compétences (précision des 52 compétences historiques sans nœud), sur les données réelles de Staging
 * (rapport généré docs/taxonomy/generated/unattached-skills.json, sans donnée personnelle). Hors ligne, aucun réseau, aucune écriture.
 * L'interface n'existe pas encore : ces tests fixent ce qu'elle devra respecter pour que S10 reste sûre.
 *   1. l'intitulé historique est affiché tel qu'écrit tant qu'aucune précision n'est faite, et n'est jamais réécrit ;
 *   2. une précision = exactement un appel lyann_resolve_legacy_skill(p_service, p_node), jamais d'autre argument (titre, catégorie, prix…) ;
 *   3. seuls des nœuds proposables sont offerts (4 au plus) ; aucune valeur libre, aucun choix à la place du membre (pas de présélection) ;
 *   4. drapeau éteint : aucune précision demandée, comportement actuel ;
 *   5. chaque candidat du rapport est accepté par les gardes de S10 (nœud actif, sélectionnable, ni famille ni « autres »).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ux = require('../taxonomy-ux.js');
const report = require('../docs/taxonomy/generated/unattached-skills.json');
const nodes = fs.readFileSync(path.join(__dirname, '..', 'docs', 'taxonomy', 'generated', 'nodes.csv'), 'utf8');

const ON = { taxonomySkills: true };
const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const items = report.items;

test('éditeur : 52 compétences en 23 titres, chacune avec ses candidats issus du référentiel (aucun choix par défaut)', () => {
    assert.equal(report.totals.unattached, 52);
    assert.equal(items.length, 23);
    assert.equal(items.reduce((s, i) => s + i.rows, 0), 52);
    for (const i of items) {
        assert.ok(i.candidates.length >= 2, `${i.title} : au moins deux candidats (sinon 05 l'aurait rattachée)`);
        assert.equal(new Set(i.candidates.map((c) => c.code)).size, i.candidates.length, `${i.title} : candidats sans doublon`);
    }
});

test('éditeur, drapeau éteint : aucune précision demandée, le titre exact est affiché (comportement actuel)', () => {
    for (const i of items) {
        const d = ux.describeSkill({ title: i.title, taxonomy_node_code: null }, { features: {}, candidates: i.candidates });
        assert.equal(d.needsPrecision, false, i.title);
        assert.equal(d.mode, 'none', i.title);
        assert.deepEqual(d.candidates, [], i.title);
        assert.equal(d.label, i.title.trim(), i.title);
    }
});

test('éditeur, drapeau allumé : l\'intitulé historique reste affiché, la précision est demandée, au plus 4 candidats proposables, jamais de présélection', () => {
    const forbiddenLabel = /^Général$|k7mq|^[0-9a-f]{8}-[0-9a-f]{4}-|UNCLASSIFIED|_/i;
    for (const i of items) {
        const skill = Object.freeze({ id: ID(1), title: i.title, taxonomy_node_code: null });   // gelé : describeSkill ne doit rien réécrire
        const d = ux.describeSkill(skill, { features: ON, candidates: i.candidates });
        assert.equal(d.status, 'unclassified', i.title);
        assert.equal(d.needsPrecision, true, i.title);
        assert.equal(d.mode, 'pick', i.title);
        assert.equal(d.label.toLowerCase(), i.title.trim().toLowerCase(), `${i.title} : intitulé historique conservé à l'affichage`);
        assert.doesNotMatch(d.label, forbiddenLabel, i.title);
        assert.ok(d.candidates.length >= 1 && d.candidates.length <= 4, `${i.title} : ${d.candidates.length} candidats`);
        const allowed = new Set(i.candidates.map((c) => c.code));
        for (const c of d.candidates) { assert.ok(allowed.has(c.code), `${i.title} : ${c.code} hors rapport`); assert.doesNotMatch(c.label, /_|^[0-9a-f]{8}-/, `${i.title} : libellé technique`); assert.ok(!('selected' in c) && !('default' in c), 'aucune présélection'); }
        assert.equal(skill.title, i.title, 'le titre n\'est pas modifié');
    }
});

test('éditeur : une précision = un seul appel à lyann_resolve_legacy_skill avec (p_service, p_node) ; aucune valeur libre, aucun autre champ', () => {
    let n = 0;
    for (const i of items) for (const c of i.candidates) {
        const id = ID(++n);
        const call = ux.resolveSkillArgs({ id, title: i.title, category: i.category, taxonomy_node_code: null }, c.code);
        assert.deepEqual(call, { rpc: 'lyann_resolve_legacy_skill', args: { p_service: id, p_node: c.code } }, `${i.title} → ${c.code}`);
        assert.deepEqual(Object.keys(call.args), ['p_service', 'p_node'], 'aucun titre, catégorie, prix ni description dans l\'appel');
    }
    const id = ID(999);
    for (const bad of ['', null, undefined, 'Courses', 'courses commissions', "a'b", 'a'.repeat(81), 'x']) assert.equal(ux.resolveSkillArgs({ id, taxonomy_node_code: null }, bad), null, `valeur libre refusée : ${String(bad)}`);
    assert.equal(ux.resolveSkillArgs({ id: 'pas-un-uuid', taxonomy_node_code: null }, 'plomberie'), null);
    assert.equal(ux.resolveSkillArgs({ id, taxonomy_node_code: 'plomberie' }, 'electricite'), null, 'une compétence déjà classée ne passe pas par cette fonction (S10 refuserait : 22023)');
});

test('éditeur : après précision, la compétence est classée, sans nouvelle demande, et l\'objet source n\'est pas modifié', () => {
    const nodeMap = new Map(items.flatMap((i) => i.candidates.map((c) => [c.code, { label: c.label }])));
    for (const i of items) {
        const c = i.candidates[0];
        const after = ux.describeSkill({ id: ID(1), title: i.title, taxonomy_node_code: c.code, taxonomy_node_source: 'user' }, { features: ON, ctx: { nodes: nodeMap }, candidates: i.candidates });
        assert.equal(after.status, 'classified', i.title);
        assert.equal(after.needsPrecision, false, i.title);
        assert.equal(after.mode, 'none', i.title);
        assert.ok(after.label.length > 0 && !/_/.test(after.label), `${i.title} : libellé lisible`);
    }
});

test('éditeur : chaque candidat du rapport est proposable pour S10 (actif, sélectionnable, ni famille ni « autres »)', () => {
    const lines = nodes.trim().split('\n');
    const header = lines[0].split(',').map((h) => h.replace(/"/g, ''));
    const col = (name) => header.indexOf(name);
    assert.ok(col('code') >= 0, `colonnes de nodes.csv : ${header.join(',')}`);
    const byCode = new Map(lines.slice(1).map((l) => { const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')); return [cells[col('code')], cells]; }));
    for (const i of items) for (const c of i.candidates) {
        const row = byCode.get(c.code);
        assert.ok(row, `${i.title} : nœud ${c.code} absent du référentiel généré`);
        if (col('kind') >= 0) assert.notEqual(row[col('kind')], 'family', `${c.code}`);
        if (col('family_code') >= 0) assert.notEqual(row[col('family_code')], 'autres', `${c.code}`);
        if (col('selectable') >= 0) assert.match(row[col('selectable')], /^(t|true|1)$/i, `${c.code} sélectionnable`);
        if (col('active') >= 0) assert.match(row[col('active')], /^(t|true|1)$/i, `${c.code} actif`);
        assert.equal(c.selectable, true, `${c.code} : sélectionnable dans le rapport`);
    }
});

test('éditeur : le rapport ne contient aucune donnée personnelle ni identifiant (partageable avec l\'équipe produit)', () => {
    const raw = JSON.stringify(report);
    assert.doesNotMatch(raw, /owner_id|user_id|@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i);
});
