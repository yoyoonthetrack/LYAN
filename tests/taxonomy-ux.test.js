'use strict';
/*
 * Taxonomie — résolveur de libellé et assistant sans présélection (phase 3.2B, intégration Staging, local uniquement).
 * Tout est derrière un drapeau désactivé par défaut : ces tests prouvent à la fois que l'ancien comportement est strictement
 * identique drapeau éteint, et que le nouveau est correct drapeau allumé.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const ux = require('../taxonomy-ux.js');
const snapshot = require('../docs/taxonomy/data/staging-snapshot.json');
const LEAVES = require('../docs/taxonomy/data/legacy-taxonomy-staging.js').LEAVES;

const STAGING_VALUES = snapshot.request_categories.map((row) => row[0]);

function withFlags(flags, fn) {
    const previous = globalThis.LYANN_FEATURES;
    globalThis.LYANN_FEATURES = flags;
    try { return fn(); } finally { if (previous === undefined) delete globalThis.LYANN_FEATURES; else globalThis.LYANN_FEATURES = previous; }
}

const FORBIDDEN = [/^Général$/i, /^general$/i, /k7mq/i, /^[0-9a-f]{8}-[0-9a-f]{4}-/i, /UNCLASSIFIED/, /_/, /^autre$/, /^jardin$/];

test('drapeaux : désactivés par défaut, et seul `true` strict les active', () => {
    assert.equal(globalThis.LYANN_FEATURES, undefined);
    assert.equal(ux.isEnabled('resolver'), false);
    assert.equal(ux.isEnabled('noPreselect'), false);
    for (const value of ['true', 1, 'yes', {}, null]) withFlags({ taxonomyResolver: value, taxonomyNoPreselect: value }, () => { assert.equal(ux.isEnabled('resolver'), false); assert.equal(ux.isEnabled('noPreselect'), false); });
    withFlags({ taxonomyResolver: true }, () => { assert.equal(ux.isEnabled('resolver'), true); assert.equal(ux.isEnabled('noPreselect'), false); });
});

test('drapeau éteint : l\'affichage est strictement celui d\'avant (valeur brute ou repli historique)', () => {
    for (const value of [...STAGING_VALUES, '', null, undefined]) {
        const record = { category: value };
        assert.equal(ux.displayCategory(record, LEAVES, { legacy: 'Général' }), value || 'Général', `valeur ${JSON.stringify(value)}`);
        assert.equal(ux.displayCategory(record, LEAVES, { legacy: 'Besoin' }), value || 'Besoin');
    }
});

test('drapeau allumé : aucune des 15 valeurs de catégorie de Staging n\'est affichée brute', () => {
    withFlags({ taxonomyResolver: true }, () => {
        const shown = Object.fromEntries(STAGING_VALUES.map((v) => [v, ux.displayCategory({ category: v }, LEAVES, { legacy: 'Général' })]));
        for (const [raw, label] of Object.entries(shown)) {
            assert.ok(label && label.length > 1, `${raw} → libellé non vide`);
            for (const pattern of FORBIDDEN) assert.doesNotMatch(label, pattern, `${raw} → « ${label} » ne doit pas être une valeur technique`);
        }
        assert.equal(shown['Général'], 'Besoin à préciser');
        assert.equal(shown['k7mqp4lyannrc'], 'Besoin à préciser');
        assert.equal(shown['Autre / Je ne trouve pas'], 'Autre besoin');
        assert.equal(shown['autre'], 'Autre besoin');
        assert.equal(shown['jardin'], 'Jardin');
        assert.equal(shown['Jardinage'], 'Jardinage');
        assert.equal(shown['Mécanique Automobile'], 'Mécanique Automobile');
    });
});

test('classification des valeurs stockées', () => {
    const cases = {
        '': 'empty', '   ': 'empty', Général: 'placeholder', general: 'placeholder', GÉNÉRAL: 'placeholder',
        'Autre / Je ne trouve pas': 'other', Autre: 'other', autre: 'other',
        UNCLASSIFIED: 'technical', NEEDS_REVIEW: 'technical', 'a8ea53d0-48ee-445c-89d5-041034344ae3': 'technical',
        plomberie_fuite: 'technical', k7mqp4lyannrc: 'technical', undefined: 'technical',
        Plomberie: 'readable', 'Électroménager': 'readable', 'Wi-Fi': 'readable', '3D': 'readable', 'Mécanique Automobile': 'readable', jardin: 'readable'
    };
    for (const [value, expected] of Object.entries(cases)) assert.equal(ux.classifyCategoryValue(value), expected, JSON.stringify(value));
    assert.equal(ux.classifyCategoryValue(null), 'empty');
});

test('chaîne du résolveur : nœud v2 > feuille historique > catégorie lisible > rien', () => {
    withFlags({ taxonomyResolver: true }, () => {
        const nodes = new Map([['plomberie_fuite', { label: 'Fuite & recherche de fuite', parent: { label: 'Plomberie' } }], ['plomberie', { label: 'Plomberie', parent: null }]]);
        const leaf = LEAVES.find((l) => l.category === 'Plomberie' && l.subcategory === 'Fuite & Dépannage');
        const ctx = { nodes };
        assert.equal(ux.categoryLine({ taxonomy_node_code: 'plomberie_fuite', taxonomy_id: leaf.id, category: 'Général' }, LEAVES, ctx), 'Plomberie · Fuite & recherche de fuite');
        assert.equal(ux.categoryLine({ taxonomy_node_code: 'plomberie', category: 'Général' }, LEAVES, ctx), 'Plomberie');
        assert.equal(ux.categoryLine({ taxonomy_node_code: 'inconnu', taxonomy_id: leaf.id, category: 'Général' }, LEAVES, ctx), 'Plomberie · Fuite & Dépannage', 'nœud absent du catalogue chargé → on retombe sur la feuille');
        assert.equal(ux.categoryLine({ taxonomy_id: leaf.id, category: 'Général' }, LEAVES, ctx), 'Plomberie · Fuite & Dépannage');
        assert.equal(ux.categoryLine({ taxonomy_id: 'uuid-inconnu', category: 'Piscine' }, LEAVES, ctx), 'Piscine');
        assert.equal(ux.categoryLine({ category: 'Général' }, LEAVES, ctx), null);
        assert.equal(ux.categoryLine({}, LEAVES, ctx), null);
        assert.equal(ux.categoryLine(null, LEAVES, ctx), null);
        assert.equal(ux.resolveCategory({ category: 'k7mqp4lyannrc' }, LEAVES, ctx).source, 'none');
    });
});

test('ancien code d\'écriture : une annonce v2 reste lisible par le résolveur sans catalogue de nœuds', () => {
    withFlags({ taxonomyResolver: true }, () => {
        assert.equal(ux.categoryLine({ taxonomy_node_code: 'piscine_bassin', category: 'Piscine & bassin' }, LEAVES, {}), 'Piscine & bassin');
    });
});

test('assistant : la proposition du classifieur n\'est retenue que si elle existe dans la taxonomie', () => {
    const ok = { classification_status: 'CLASSIFIED', universe: 'Maison & Travaux', category: 'Plomberie', subcategory: 'Fuite & Dépannage' };
    assert.deepEqual(ux.suggestionFrom(LEAVES, ok), { universe: 'Maison & Travaux', category: 'Plomberie', subcategory: 'Fuite & Dépannage' });
    assert.deepEqual(ux.suggestionFrom(LEAVES, { ...ok, subcategory: 'Inventée' }), { universe: 'Maison & Travaux', category: 'Plomberie', subcategory: '' });
    assert.deepEqual(ux.suggestionFrom(LEAVES, { ...ok, category: 'Inventée' }), { universe: 'Maison & Travaux', category: '', subcategory: '' });
    assert.deepEqual(ux.suggestionFrom(LEAVES, { ...ok, universe: 'Inventé' }), { universe: '', category: '', subcategory: '' });
    assert.deepEqual(ux.suggestionFrom(LEAVES, { ...ok, classification_status: 'UNCLASSIFIED' }), { universe: '', category: '', subcategory: '' }, 'non classé → aucune suggestion');
    assert.deepEqual(ux.suggestionFrom(LEAVES, { classification_status: 'CLASSIFIED', universe: 'Autres Besoins', category: 'Général', subcategory: 'Demande libre' }), { universe: '', category: '', subcategory: '' }, '« Autres Besoins » répondu par le classifieur n\'est pas une proposition métier : l\'auteur choisit lui-même');
    assert.deepEqual(ux.suggestionFrom(LEAVES, null), { universe: '', category: '', subcategory: '' });
});

test('assistant : aucune présélection, jamais « la première de la liste »', () => {
    const empty = ux.wizardState(LEAVES, {});
    assert.equal(empty.universe, '');
    assert.equal(empty.category, '');
    assert.equal(empty.subcategory, '');
    assert.deepEqual(empty.categories, []);
    assert.ok(empty.universes.includes('Autres Besoins'));

    // Changer d'univers : catégorie et sous-catégorie sont vidées, pas remplacées par la première option.
    const afterUniverse = ux.wizardState(LEAVES, { universe: 'Maison & Travaux', category: 'Plomberie', subcategory: 'Fuite & Dépannage' });
    assert.equal(afterUniverse.subcategory, 'Fuite & Dépannage');
    const switched = ux.wizardState(LEAVES, { universe: 'Jardin & Extérieur', category: 'Plomberie', subcategory: 'Fuite & Dépannage' });
    assert.equal(switched.universe, 'Jardin & Extérieur');
    assert.equal(switched.category, '', 'une catégorie d\'un autre univers n\'est pas conservée');
    assert.equal(switched.subcategory, '');
    assert.ok(switched.categories.length > 1 && switched.categories.includes('Autre / Je ne trouve pas'));
    assert.notEqual(switched.categories[0], switched.category);

    const catOnly = ux.wizardState(LEAVES, { universe: 'Maison & Travaux', category: 'Plomberie' });
    assert.equal(catOnly.subcategory, '');
    assert.ok(catOnly.subcategories.includes('Demande libre'));
});

test('assistant : chaque liste commence par une option vide, rien n\'est coché sans choix', () => {
    const html = ux.optionsHtml(['A', 'B'], 'Choisir…', '', (v) => v);
    assert.equal(html, '<option value="" selected>Choisir…</option><option value="A">A</option><option value="B">B</option>');
    assert.match(ux.optionsHtml(['A', 'B'], 'Choisir…', 'B', (v) => v), /<option value="B" selected>B<\/option>/);
    assert.doesNotMatch(ux.optionsHtml(['A', 'B'], 'Choisir…', 'B', (v) => v), /<option value="" selected>/);
    assert.match(ux.optionsHtml(['A', 'B'], 'Choisir…', 'Z', (v) => v), /<option value="" selected>/, 'valeur inconnue → option vide');
});

test('publication : une catégorie explicite est exigée, « Autre » est un choix assumé', () => {
    assert.equal(ux.validateSelection({ category: '' }).ok, false);
    assert.equal(ux.validateSelection({}).ok, false);
    assert.equal(ux.validateSelection(null).ok, false);
    assert.equal(ux.validateSelection({ category: 'Plomberie' }).ok, true);
    assert.equal(ux.validateSelection({ category: 'Autre / Je ne trouve pas' }).ok, true);
    assert.match(ux.validateSelection({ category: '' }).message, /Choisissez une catégorie/);
});

// ---------------------------------------------------------------------------------------------------------------
// Câblage dans le code existant : le comportement drapeau éteint doit être inchangé
// ---------------------------------------------------------------------------------------------------------------
function loadAnnonceFormat(flags, uxModule) {
    const window = { LYANN_FEATURES: flags, LYANN_TAXONOMY_UX: uxModule };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'annonce-format.js'), 'utf8'), { window, Intl, Date, console }, { filename: 'annonce-format.js' });
    return window.LYANN_ANNONCE_FORMAT;
}

test('annonce-format.categoryLine : drapeau éteint (ou module absent) = comportement historique octet pour octet', () => {
    const leaf = LEAVES.find((l) => l.category === 'Plomberie' && l.subcategory === 'Fuite & Dépannage');
    const samples = [{ taxonomy_id: leaf.id, category: 'Général' }, { category: 'Général' }, { category: 'k7mqp4lyannrc' }, { category: '' }, {}, { taxonomy_id: 'x', category: 'jardin' }];
    const legacy = loadAnnonceFormat(undefined, undefined);
    const withModuleOff = loadAnnonceFormat({}, ux);
    const withModuleOffExplicit = loadAnnonceFormat({ taxonomyResolver: false }, ux);
    for (const record of samples) {
        const expected = legacy.categoryLine(record, LEAVES);
        assert.equal(withModuleOff.categoryLine(record, LEAVES), expected);
        assert.equal(withModuleOffExplicit.categoryLine(record, LEAVES), expected);
    }
    assert.equal(legacy.categoryLine({ category: 'Général' }, LEAVES), 'Général', 'repère : le code historique affiche bien la valeur brute');
});

test('annonce-format.categoryLine : drapeau allumé = résolveur (aucune valeur technique)', () => {
    const on = loadAnnonceFormat({ taxonomyResolver: true }, ux);
    assert.equal(on.categoryLine({ category: 'Général' }, LEAVES), null);
    assert.equal(on.categoryLine({ category: 'k7mqp4lyannrc' }, LEAVES), null);
    assert.equal(on.categoryLine({ category: 'Piscine' }, LEAVES), 'Piscine');
    const leaf = LEAVES.find((l) => l.category === 'Plomberie' && l.subcategory === 'Fuite & Dépannage');
    assert.equal(on.categoryLine({ taxonomy_id: leaf.id, category: 'Général' }, LEAVES), 'Plomberie · Fuite & Dépannage');
});

test('le module est inerte au chargement : aucun accès réseau, aucune écriture, aucun effet sur le DOM', () => {
    const source = fs.readFileSync(path.join(ROOT, 'taxonomy-ux.js'), 'utf8');
    assert.doesNotMatch(source, /\b(fetch|XMLHttpRequest|localStorage|sessionStorage|document\.|supabase|\bfrom\s*\(\s*['"])/);
    assert.doesNotMatch(source, /(gzispjfoywklpqatjyop)/);
});

// ---------------------------------------------------------------------------------------------------------------
// Assistant de publication réel (script.js) : fonction extraite et exécutée sur de faux <select>
// ---------------------------------------------------------------------------------------------------------------
function sliceFunction(source, header) {
    const start = source.indexOf(header);
    assert.ok(start >= 0, `${header} introuvable dans script.js`);
    let i = source.indexOf('{', source.indexOf(')', start));
    let depth = 0;
    for (; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    }
    throw new Error(`${header} non fermée`);
}

class FakeSelect {
    constructor(html = '') { this.innerHTML = html; this.onchange = null; }
    set innerHTML(html) {
        this._options = [...String(html).matchAll(/<option value="([^"]*)"( selected)?>/g)].map((m) => ({ value: m[1].replace(/&amp;/g, '&').replace(/&#039;/g, "'"), selected: Boolean(m[2]) }));
        const chosen = this._options.find((o) => o.selected);
        this._value = chosen ? chosen.value : (this._options[0] ? this._options[0].value : '');
    }
    get options() { return this._options.map((o) => ({ ...o, text: o.value })); }
    get value() { return this._value; }
    set value(v) { this._value = v; }
}

function runWizardSync(flags, result, list = LEAVES) {
    const source = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    const code = [sliceFunction(source, 'function escapeSearchHtml'), sliceFunction(source, 'function setSelectValueSafely'), sliceFunction(source, 'async function syncWizardTaxonomyDropdowns'),
        'this.__sync = syncWizardTaxonomyDropdowns;'].join('\n');
    const selects = { wizardDomain: new FakeSelect(), wizardCategory: new FakeSelect(), wizardSubCat: new FakeSelect() };
    const window = { LYANN_FEATURES: flags, LYANN_TAXONOMY_UX: ux, LyanAI: { fetchTaxonomyFromDB: async () => list } };
    const context = { window, document: { getElementById: (id) => selects[id] || null }, console: { trace() {}, log() {}, warn() {} } };
    vm.runInNewContext(code, context, { filename: 'script.js#wizard' });
    return context.__sync(result).then(() => ({ selects, window }));
}

const CLASSIFIED = { classification_status: 'CLASSIFIED', universe: 'Maison & Travaux', category: 'Plomberie', subcategory: 'Fuite & Dépannage' };

test('assistant réel, drapeau éteint : comportement historique (présélection de la première valeur) inchangé', async () => {
    const { selects } = await runWizardSync(undefined, { classification_status: 'UNCLASSIFIED' });
    assert.equal(selects.wizardDomain.value, 'Autres Besoins');
    assert.equal(selects.wizardCategory.value, 'Autre / Je ne trouve pas', 'repère : la catégorie « Autre » est cochée d\'office');
    assert.equal(selects.wizardSubCat.value, 'Demande libre');
    const classified = await runWizardSync({}, CLASSIFIED);
    assert.deepEqual([classified.selects.wizardDomain.value, classified.selects.wizardCategory.value, classified.selects.wizardSubCat.value], ['Maison & Travaux', 'Plomberie', 'Fuite & Dépannage']);
});

test('assistant réel, drapeau allumé : rien n\'est présélectionné sans proposition du classifieur', async () => {
    for (const result of [null, { classification_status: 'UNCLASSIFIED' }, { classification_status: 'NEEDS_REVIEW', universe: 'Maison & Travaux', category: 'Plomberie' }, { classification_status: 'CLASSIFIED', universe: 'Autres Besoins', category: 'Général', subcategory: 'Demande libre' }]) {
        const { selects } = await runWizardSync({ taxonomyNoPreselect: true }, result);
        assert.equal(selects.wizardDomain.value, '', JSON.stringify(result));
        assert.equal(selects.wizardCategory.value, '');
        assert.equal(selects.wizardSubCat.value, '');
        assert.equal(selects.wizardCategory.options.length, 1, 'catégories vides tant qu\'aucun domaine n\'est choisi');
    }
});

test('assistant réel, drapeau allumé : une proposition valide est reprise, le changement en cascade vide les niveaux suivants', async () => {
    const { selects } = await runWizardSync({ taxonomyNoPreselect: true }, CLASSIFIED);
    assert.deepEqual([selects.wizardDomain.value, selects.wizardCategory.value, selects.wizardSubCat.value], ['Maison & Travaux', 'Plomberie', 'Fuite & Dépannage']);
    selects.wizardDomain.value = 'Jardin & Extérieur';
    selects.wizardDomain.onchange();
    assert.equal(selects.wizardDomain.value, 'Jardin & Extérieur');
    assert.equal(selects.wizardCategory.value, '', 'la catégorie n\'est pas remplacée par la première du nouveau domaine');
    assert.equal(selects.wizardSubCat.value, '');
    assert.ok(selects.wizardCategory.options.some((o) => o.value === 'Piscine'));
    selects.wizardCategory.value = 'Piscine';
    selects.wizardCategory.onchange();
    assert.equal(selects.wizardCategory.value, 'Piscine');
    assert.equal(selects.wizardSubCat.value, '');
    assert.ok(selects.wizardSubCat.options.some((o) => o.value === 'Demande libre'), 'la sortie « Demande libre » reste proposée');
});

test('publication réelle : la validation et la lecture des sélecteurs sont derrière le drapeau', () => {
    const source = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
    assert.match(source, /const noPreselect = Boolean\(window\.LYANN_TAXONOMY_UX\?\.isEnabled\('noPreselect', window\.LYANN_FEATURES\)\);/);
    assert.match(source, /if \(noPreselect\) \{\s*const chosen = window\.LYANN_TAXONOMY_UX\.validateSelection\(\{ category: categoryText \}\);/);
    // Le repli historique reste en place pour le drapeau éteint.
    assert.match(source, /: \(categorySelect \? \(categorySelect\.options\[categorySelect\.selectedIndex\]\?\.text \|\| categorySelect\.value\) : 'Général'\);/);
});
