/* LYANN — Aides d'affichage et de saisie de la taxonomie (phase 3.2B, intégration Staging).
 *
 * INERTE PAR DÉFAUT : aucune fonction ne change le comportement existant tant que le drapeau correspondant n'est pas posé
 * (window.LYANN_FEATURES.taxonomyResolver / taxonomyNoPreselect === true). Les drapeaux ne sont posés par aucun fichier du dépôt ;
 * ils seront injectés par la configuration Staging lors d'une phase ultérieure.
 *
 *  1. Résolveur de libellé : une seule règle pour afficher la catégorie d'une annonce, jamais de valeur technique
 *     (« Général », identifiant, UUID, résidu de test, statut de classification).
 *       taxonomy_node_code → libellé v2 · sinon taxonomy_id → feuille historique · sinon category SI elle est lisible · sinon rien.
 *  2. Assistant de publication sans présélection métier : aucune catégorie n'est cochée « parce qu'elle est première » ;
 *     seule une proposition du classifieur (statut CLASSIFIED, valeurs réellement présentes dans la taxonomie) est présélectionnée.
 *
 * Aucune dépendance, aucun accès réseau, aucune écriture : fonctions pures. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_TAXONOMY_UX = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const FLAGS = Object.freeze({ resolver: 'taxonomyResolver', noPreselect: 'taxonomyNoPreselect', skills: 'taxonomySkills' });
    const OTHER_CATEGORY = 'Autre / Je ne trouve pas';
    const OTHER_LABEL = 'Autre besoin';
    const EMPTY_LABEL = 'Besoin à préciser';

    // `features` est facultatif : par défaut window.LYANN_FEATURES ; les appelants dans un autre contexte (tests) peuvent le fournir.
    function isEnabled(flag, features) {
        const source = features || (root && root.LYANN_FEATURES);
        return Boolean(source && source[FLAGS[flag] || flag] === true);
    }

    const fold = (value) => String(value == null ? '' : value)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const STATUS_WORDS = new Set(['unclassified', 'needs review', 'classified', 'pending', 'undefined', 'null', 'none', 'n a', 'nan']);
    const OTHER_WORDS = new Set(['autre', 'autres', 'autre besoin', 'autres besoins', 'autre je ne trouve pas', 'other']);

    /**
     * Nature d'une valeur de catégorie stockée.
     *   empty | technical | placeholder | other | readable
     * « Général » n'est pas une catégorie : c'est la valeur de repli du code d'écriture historique.
     */
    function classifyCategoryValue(raw) {
        const value = String(raw == null ? '' : raw).trim();
        if (!value) return 'empty';
        if (UUID.test(value)) return 'technical';
        const folded = fold(value);
        if (!folded) return 'empty';
        if (STATUS_WORDS.has(folded)) return 'technical';
        if (folded === 'general') return 'placeholder';
        if (OTHER_WORDS.has(folded)) return 'other';
        // Identifiant : snake_case / kebab technique, ou jeton opaque mêlant lettres et chiffres sans espace (ex. résidu de recette).
        if (/^[a-z0-9]+(_[a-z0-9]+)+$/i.test(value)) return 'technical';
        if (!/\s/.test(value) && value.length >= 8 && /[0-9]/.test(value) && /[a-z]/i.test(value) && !/[^\x00-\x7f]/.test(value)) return 'technical';
        return 'readable';
    }

    const capitalise = (value) => (value === value.toLowerCase() ? value.charAt(0).toUpperCase() + value.slice(1) : value);

    function nodeParts(record, ctx) {
        const code = record && record.taxonomy_node_code;
        const nodes = (ctx && ctx.nodes) || (root && root.LYANN_TAXONOMY_NODES);
        if (!code || !nodes) return null;
        const node = typeof nodes.get === 'function' ? nodes.get(code) : nodes[code];
        if (!node || !node.label) return null;
        // Un nœud « spécialité » se lit « Métier · Spécialité » ; un métier seul se lit seul.
        return node.parent && node.parent.label ? [node.parent.label, node.label] : [node.label];
    }

    /**
     * Résolution d'une annonce → { parts, source } ; parts est vide quand il n'y a rien de fiable à afficher.
     * source : node | leaf | category | other | none
     */
    function resolveCategory(record, leaves, ctx) {
        const fromNode = nodeParts(record, ctx);
        if (fromNode) return { parts: fromNode, source: 'node' };
        const leaf = record && record.taxonomy_id && Array.isArray(leaves) ? leaves.find((c) => c.id === record.taxonomy_id) : null;
        if (leaf) {
            const parts = [String(leaf.category || '').trim(), String(leaf.subcategory || '').trim()].filter(Boolean);
            if (parts.length) return { parts, source: 'leaf' };
        }
        const kind = classifyCategoryValue(record && record.category);
        if (kind === 'readable') return { parts: [capitalise(String(record.category).trim())], source: 'category' };
        if (kind === 'other') return { parts: [OTHER_LABEL], source: 'other' };
        return { parts: [], source: 'none' };
    }

    function categoryLine(record, leaves, ctx) {
        const { parts } = resolveCategory(record, leaves, ctx);
        return parts.length ? parts.join(' · ') : null;
    }

    /**
     * Point d'entrée des écrans : drapeau désactivé → valeur historique à l'identique ; activé → résolveur.
     * `legacy` est ce que l'écran affichait avant (souvent `Général` ou `Besoin`), `whenEmpty` ce qu'il affichera à la place.
     */
    function displayCategory(record, leaves, options) {
        const opts = options || {};
        if (!isEnabled('resolver', opts.features)) return (record && record.category) || opts.legacy || '';
        return categoryLine(record, leaves, opts.ctx) || (opts.whenEmpty === undefined ? EMPTY_LABEL : opts.whenEmpty);
    }

    // ---------------------------------------------------------------------------------------------
    // Assistant de publication : aucune présélection métier
    // ---------------------------------------------------------------------------------------------

    /** Proposition du classifieur, retenue seulement si elle existe réellement dans la taxonomie chargée. */
    function suggestionFrom(taxonomyList, result) {
        const none = { universe: '', category: '', subcategory: '' };
        if (!result || result.classification_status !== 'CLASSIFIED' || !Array.isArray(taxonomyList)) return none;
        const universe = taxonomyList.some((t) => t.universe === result.universe) ? result.universe : '';
        if (!universe) return none;
        const category = taxonomyList.some((t) => t.universe === universe && t.category === result.category) ? result.category : '';
        if (!category) return { universe, category: '', subcategory: '' };
        const subcategory = taxonomyList.some((t) => t.universe === universe && t.category === category && t.subcategory === result.subcategory) ? result.subcategory : '';
        return { universe, category, subcategory };
    }

    /** Options d'un <select> : toujours une première option vide ; `selected` n'est appliqué que s'il figure dans la liste. */
    function optionsHtml(values, placeholder, selected, escape) {
        const esc = typeof escape === 'function' ? escape : (v) => String(v);
        const list = Array.from(new Set((values || []).filter(Boolean)));
        const choice = list.includes(selected) ? selected : '';
        return [`<option value=""${choice === '' ? ' selected' : ''}>${esc(placeholder)}</option>`]
            .concat(list.map((v) => `<option value="${esc(v)}"${v === choice ? ' selected' : ''}>${esc(v)}</option>`)).join('');
    }

    const FREE_SUBCATEGORY = 'Demande libre';
    const OTHER_UNIVERSE = 'Autres Besoins';
    const unique = (values) => Array.from(new Set(values.filter(Boolean)));

    /**
     * État en cascade des trois listes. Une valeur n'est retenue que si elle figure dans la liste correspondante ;
     * changer l'univers vide la catégorie et la sous-catégorie, changer la catégorie vide la sous-catégorie.
     * Aucune valeur n'est jamais « la première de la liste ».
     */
    function wizardState(taxonomyList, selection) {
        const list = Array.isArray(taxonomyList) ? taxonomyList : [];
        const sel = selection || {};
        const universes = unique(list.map((t) => t.universe));
        if (!universes.includes(OTHER_UNIVERSE)) universes.push(OTHER_UNIVERSE);
        const universe = universes.includes(sel.universe) ? sel.universe : '';
        const categories = universe ? unique(list.filter((t) => t.universe === universe).map((t) => t.category)) : [];
        if (universe && !categories.includes(OTHER_CATEGORY)) categories.push(OTHER_CATEGORY);
        const category = categories.includes(sel.category) ? sel.category : '';
        const subcategories = category ? unique(list.filter((t) => t.universe === universe && t.category === category).map((t) => t.subcategory)) : [];
        if (category && !subcategories.includes(FREE_SUBCATEGORY)) subcategories.push(FREE_SUBCATEGORY);
        const subcategory = subcategories.includes(sel.subcategory) ? sel.subcategory : '';
        return { universes, universe, categories, category, subcategories, subcategory };
    }

    /** Publication : une catégorie explicite est exigée (« Autre / Je ne trouve pas » en est une, assumée par l'auteur). */
    function validateSelection(selection) {
        const category = String((selection && selection.category) || '').trim();
        if (!category) return { ok: false, field: 'category', message: 'Choisissez une catégorie, ou « Autre / Je ne trouve pas » si aucune ne convient.' };
        return { ok: true };
    }


    // ---------------------------------------------------------------------------------------------
    // Compétences sans nœud (P4/P5) : affichage et précision par le membre. Drapeau `taxonomySkills`, éteint par défaut.
    // Les données historiques ne changent jamais : le titre reste affiché tel qu'écrit ; seul le nœud peut être ajouté, par le membre (RPC
    // lyann_resolve_legacy_skill, brouillon 10). Aucun métier n'est jamais choisi à sa place.
    // ---------------------------------------------------------------------------------------------
    const SKILL_FALLBACK = 'Compétence à préciser';
    const NODE_CODE = /^[a-z0-9_]{2,80}$/;
    const MAX_CANDIDATES = 4;

    /**
     * Affichage d'une compétence : { label, status, needsPrecision, mode, candidates }.
     *   status : legacy (drapeau éteint) | classified | classified_parent | unclassified
     *   mode   : none | pick (liste de candidats connus) | search (recherche libre : aucun candidat fiable)
     * `options.candidates` : nœuds proposés par l'appelant (résultat de la recherche v2 ou liste de correspondance) ; seuls les nœuds
     * sélectionnables, actifs et à code valide sont retenus, 4 au plus, dans l'ordre fourni.
     */
    function describeSkill(service, options) {
        const opts = options || {};
        const title = String((service && service.title) == null ? '' : service.title).trim();
        if (!isEnabled('skills', opts.features)) return { label: title, status: 'legacy', needsPrecision: false, mode: 'none', candidates: [] };
        const parts = nodeParts(service, opts.ctx);
        const source = String((service && service.taxonomy_node_source) || '');
        if (parts) {
            const parentOnly = /_parent$/.test(source);
            return { label: parts.join(' · '), status: parentOnly ? 'classified_parent' : 'classified', needsPrecision: parentOnly, mode: parentOnly ? 'pick' : 'none', candidates: [] };
        }
        const readable = classifyCategoryValue(title) === 'readable';
        const candidates = (Array.isArray(opts.candidates) ? opts.candidates : [])
            .filter((c) => c && NODE_CODE.test(String(c.code || '')) && c.selectable !== false && c.active !== false && c.kind !== 'family' && c.family_code !== 'autres')
            .slice(0, MAX_CANDIDATES)
            .map((c) => ({ code: c.code, label: String(c.label || '').trim() }));
        return { label: readable ? capitalise(title) : SKILL_FALLBACK, status: 'unclassified', needsPrecision: true, mode: candidates.length ? 'pick' : 'search', candidates };
    }

    /** Arguments de la RPC de précision ; null si le code ou l'identifiant est invalide (jamais d'appel avec une valeur libre). */
    function resolveSkillArgs(service, nodeCode) {
        const id = service && service.id;
        if (!UUID.test(String(id || '')) || !NODE_CODE.test(String(nodeCode || ''))) return null;
        if (service.taxonomy_node_code) return null;
        return { rpc: 'lyann_resolve_legacy_skill', args: { p_service: id, p_node: nodeCode } };
    }

    return Object.freeze({
        FLAGS, OTHER_CATEGORY, OTHER_LABEL, EMPTY_LABEL,
        isEnabled, classifyCategoryValue, resolveCategory, categoryLine, displayCategory,
        suggestionFrom, optionsHtml, wizardState, validateSelection,
        describeSkill, resolveSkillArgs, SKILL_FALLBACK
    });
});
