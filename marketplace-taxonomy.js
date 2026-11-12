/* LYANN — Passerelle d'affichage du référentiel de métiers V2 (phase 3.2C).
 *
 * Rôle : relier les écrans Découvrir, Lyanneurs et Annonces aux familles, métiers et spécialités V2 sans créer de seconde taxonomie.
 *  - Les CODES (famille, groupe, métier, spécialité) sont ceux de lyann_taxonomy_node / lyann_taxonomy_group (Staging V2).
 *  - La hiérarchie (groupes → métiers → spécialités) est LUE dans ces tables (lecture anonyme) ; rien n'est recopié ici.
 *  - Seule la PRÉSENTATION est portée par ce fichier : libellé court, pictogramme et regroupement des 10 entrées visuelles de Découvrir.
 *  - Sans référentiel V2 (Production non migrée, réseau coupé), load() renvoie null : les familles restent affichées et filtrent
 *    les lignes historiques par le pont minimal ci-dessous ; la navigation par métier est simplement masquée.
 * « autres » n'est jamais une compétence sélectionnable : c'est une entrée de découverte (annonces à classer), absente des profils.
 *
 * Fonctions pures + un seul accès réseau en lecture (load). Aucun drapeau, aucune écriture. */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_MARKETPLACE_TAXONOMY = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /* Pictogrammes sobres (trait 1,7, 24 × 24). Une seule définition, partagée par Découvrir, Lyanneurs et Annonces. */
    const ICONS = Object.freeze({
        wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.1 5.2L3.8 17.3a1.9 1.9 0 0 0 2.7 2.7l5.8-5.8a4 4 0 0 0 5.2-5.1l-2.6 2.6-2.4-.6-.6-2.4z"/>',
        hammer: '<path d="M12.5 6.5 16 3l5 5-3.5 3.5"/><path d="m11 8 5 5"/><path d="M13.5 10.5 4.7 19.3a1.4 1.4 0 0 1-2-2l8.8-8.8"/>',
        leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-5 6-8 10-10"/>',
        broom: '<path d="m19 3-6.5 6.5"/><path d="M9.5 9.5 14.5 14.5l-4.2 4.2a2.1 2.1 0 0 1-3 0L5.3 16.7a2.1 2.1 0 0 1 0-3z"/><path d="M8 17l-3 3M11 18l-2 2"/>',
        flower: '<path d="M12 20c-4 0-7.5-2.5-8-6.5 3-.2 5.5 1 8 3.5 2.5-2.5 5-3.7 8-3.5-.5 4-4 6.5-8 6.5z"/><path d="M12 17c-2-2-3-4-3-6.5a3 3 0 0 1 6 0c0 2.5-1 4.5-3 6.5z"/>',
        truck: '<path d="M3 6.5h11V16H3z"/><path d="M14 9.5h4l3 3.2V16h-7"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
        family: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17.5" cy="9.5" r="2.3"/><path d="M16.2 14.3c3 0 4.8 2 4.8 4.7"/>',
        toque: '<path d="M7.5 13.5A4 4 0 1 1 9 5.8a3.8 3.8 0 0 1 6 0 4 4 0 1 1 1.5 7.7"/><path d="M7.5 13.5V20h9v-6.5"/><path d="M7.5 17h9"/>',
        laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
        dots: '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>',
        all: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>'
    });

    /* Les 8 familles de métiers (codes = lyann_taxonomy_node.family_code). `short` = libellé d'écran. */
    const FAMILIES = Object.freeze([
        { code: 'maison', short: 'Maison & travaux', icon: 'wrench' },
        { code: 'jardin', short: 'Jardin & extérieur', icon: 'leaf' },
        { code: 'entretien', short: 'Ménage & entretien', icon: 'broom' },
        { code: 'beaute', short: 'Beauté & bien-être', icon: 'flower' },
        { code: 'transport', short: 'Transport & véhicules', icon: 'truck' },
        { code: 'famille', short: 'Famille & assistance', icon: 'family' },
        { code: 'evenement', short: 'Événementiel & cuisine', icon: 'toque' },
        { code: 'numerique', short: 'Numérique & services pros', icon: 'laptop' }
    ]);
    const FAMILY_CODES = FAMILIES.map((f) => f.code);

    /* Les 10 entrées visuelles de Découvrir (codes de tuile = taxonomy-v2.json › discoverTiles).
     * Deux entrées pour la famille « maison » (groupes de la V2) ; « autres » est une entrée de découverte, jamais une compétence. */
    const TILES = Object.freeze([
        { code: 'tile_depannage', label: 'Dépannage maison', family: 'maison', groups: ['depannage', 'equipement'], icon: 'wrench' },
        { code: 'tile_travaux', label: 'Travaux & rénovation', family: 'maison', groups: ['travaux', 'petits'], icon: 'hammer' },
        { code: 'tile_jardin', label: 'Jardin & extérieur', family: 'jardin', groups: null, icon: 'leaf' },
        { code: 'tile_menage', label: 'Ménage & entretien', family: 'entretien', groups: null, icon: 'broom' },
        { code: 'tile_beaute', label: 'Beauté & bien-être', family: 'beaute', groups: null, icon: 'flower' },
        { code: 'tile_transport', label: 'Transport & véhicules', family: 'transport', groups: null, icon: 'truck' },
        { code: 'tile_famille', label: 'Famille & assistance', family: 'famille', groups: null, icon: 'family' },
        { code: 'tile_fetes', label: 'Événementiel & cuisine', family: 'evenement', groups: null, icon: 'toque' },
        { code: 'tile_numerique', label: 'Numérique & services pros', family: 'numerique', groups: null, icon: 'laptop' },
        { code: 'tile_autres', label: 'Autres', family: 'autres', groups: null, icon: 'dots', discoveryOnly: true }
    ]);

    /* Pont minimal pour les lignes HISTORIQUES sans code V2 (anciennes annonces / services). Les familles visuelles de la carte
     * (needs-map-category-families.js) sont plus grossières que la V2 : « quotidien » est un fourre-tout, il ne se rattache à rien. */
    const LEGACY_FAMILY_BRIDGE = Object.freeze({
        plomberie: 'maison', electricite: 'maison', bricolage: 'maison', jardinage: 'jardin', menage: 'entretien', beaute: 'beaute', numerique: 'numerique'
    });

    const iconSvg = (name, cls = 'lyann-icon') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="${cls}">${ICONS[name] || ICONS.dots}</svg>`;
    const familyMeta = (code) => FAMILIES.find((f) => f.code === code) || null;
    const tileByCode = (code) => TILES.find((t) => t.code === code) || null;
    const isFamilyCode = (code) => FAMILY_CODES.includes(code);

    /** Ancien identifiant de famille (liens existants : family=jardinage) → code V2 ; un code V2 reste inchangé ; inconnu → ''. */
    function normalizeFamilyParam(value) {
        const v = String(value || '').trim();
        if (!v) return '';
        if (isFamilyCode(v) || v === 'autres') return v;
        return LEGACY_FAMILY_BRIDGE[v] || '';
    }

    /** Lien d'une entrée de Découvrir. « Autres » mène aux annonces (jamais à un annuaire de compétences). */
    function tileHref(tile) {
        const params = new URLSearchParams({ mode: tile.discoveryOnly ? 'annonces' : 'lyanneurs', family: tile.family });
        if (tile.groups && tile.groups.length) params.set('groups', tile.groups.join(','));
        return `results.html?${params.toString().replace(/%2C/g, ',')}`;
    }

    /* ── Index du référentiel (lignes lyann_taxonomy_node actives + lyann_taxonomy_group) ── */
    function buildIndex(nodeRows, groupRows) {
        const rows = Array.isArray(nodeRows) ? nodeRows.filter((r) => r && r.code && r.active !== false) : [];
        if (!rows.length) return null;
        const byCode = new Map(rows.map((r) => [r.code, r]));
        const groupLabel = new Map((Array.isArray(groupRows) ? groupRows : []).map((g) => [`${g.family_code}/${g.code}`, g]));
        const order = (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || String(a.label_fr).localeCompare(String(b.label_fr), 'fr');
        const trades = rows.filter((r) => r.kind === 'trade').sort(order);
        const specialties = rows.filter((r) => r.kind === 'specialty').sort(order);
        const families = {};
        for (const family of FAMILY_CODES) {
            const familyTrades = trades.filter((t) => t.family_code === family);
            const groups = [];
            for (const trade of familyTrades) {
                let group = groups.find((g) => g.code === trade.group_code);
                if (!group) {
                    group = { code: trade.group_code, label: groupLabel.get(`${family}/${trade.group_code}`)?.label_fr || '', order: Number(groupLabel.get(`${family}/${trade.group_code}`)?.sort_order) || 0, trades: [] };
                    groups.push(group);
                }
                group.trades.push({
                    code: trade.code, label: trade.label_fr, selectable: trade.selectable !== false,
                    specialties: specialties.filter((s) => s.parent_code === trade.code).map((s) => ({ code: s.code, label: s.label_fr, selectable: s.selectable !== false }))
                });
            }
            groups.sort((a, b) => a.order - b.order);
            families[family] = { code: family, groups, trades: familyTrades.length };
        }
        return { byCode, families };
    }

    /** Code V2 d'une ligne (annonce ou service) : code posé sur la ligne, sinon code porté par la feuille historique. */
    function nodeCodeOf(row, leaves) {
        if (!row) return '';
        if (row.taxonomy_node_code) return String(row.taxonomy_node_code);
        if (row.taxonomy_id && Array.isArray(leaves)) {
            const leaf = leaves.find((t) => t && t.id === row.taxonomy_id);
            if (leaf && leaf.node_code) return String(leaf.node_code);
        }
        return '';
    }

    /** Famille V2 d'une ligne : '' si elle ne se rattache à aucune famille (ligne historique ambiguë). */
    function familyOf(row, ctx) {
        const { index, leaves, legacyFamilyForRow } = ctx || {};
        const node = index && index.byCode.get(nodeCodeOf(row, leaves));
        if (node) return node.family_code || '';
        if (typeof legacyFamilyForRow === 'function') return LEGACY_FAMILY_BRIDGE[legacyFamilyForRow(row, leaves)] || '';
        return '';
    }

    /** Code du métier (« trade ») d'un nœud : le nœud lui-même s'il est un métier, son parent s'il est une spécialité. */
    function tradeOfNode(node) {
        if (!node) return '';
        return node.kind === 'specialty' ? (node.parent_code || '') : (node.kind === 'trade' ? node.code : '');
    }

    /** La ligne répond-elle au filtre { family, groups[], job, specialty } ? Chaque critère posé doit être vrai. */
    function rowMatches(row, filter, ctx) {
        const f = filter || {};
        const { index, leaves } = ctx || {};
        const node = index && index.byCode.get(nodeCodeOf(row, leaves));
        if (f.family) {
            const family = familyOf(row, ctx);
            // « Autres » réunit aussi les lignes sans famille V2 reconnue (annonces à classer).
            if (f.family === 'autres' ? !(family === 'autres' || family === '') : family !== f.family) return false;
        }
        if (f.groups && f.groups.length && !(node && f.groups.includes(node.group_code))) return false;
        if (f.job && tradeOfNode(node) !== f.job) return false;
        if (f.specialty && !(node && node.code === f.specialty)) return false;
        return true;
    }

    /** Nombre de lignes par métier (code de « trade »), pour n'ouvrir d'abord que les métiers réellement présents. */
    function countByTrade(rows, ctx) {
        const counts = {};
        const { index, leaves } = ctx || {};
        if (!index) return counts;
        for (const row of rows || []) {
            const trade = tradeOfNode(index.byCode.get(nodeCodeOf(row, leaves)));
            if (trade) counts[trade] = (counts[trade] || 0) + 1;
        }
        return counts;
    }

    /* ── Chargement (lecture anonyme ; ne lève jamais) ── */
    let pending = null;
    function load(supabase, force = false) {
        if (!supabase || typeof supabase.from !== 'function') return Promise.resolve(null);
        if (pending && !force) return pending;
        pending = (async () => {
            try {
                const [nodes, groups] = await Promise.all([
                    supabase.from('lyann_taxonomy_node').select('code,kind,parent_code,family_code,group_code,label_fr,sort_order,selectable,active').eq('active', true).order('sort_order').limit(2000),
                    supabase.from('lyann_taxonomy_group').select('code,family_code,label_fr,sort_order').order('sort_order').limit(500)
                ]);
                if (nodes.error || !Array.isArray(nodes.data) || !nodes.data.length) return null;
                return buildIndex(nodes.data, groups.error ? [] : groups.data);
            } catch (_) {
                return null;
            }
        })();
        return pending.then((index) => { if (!index) pending = null; return index; });
    }

    return Object.freeze({
        ICONS, FAMILIES, FAMILY_CODES, TILES, LEGACY_FAMILY_BRIDGE,
        iconSvg, familyMeta, tileByCode, isFamilyCode, normalizeFamilyParam, tileHref,
        buildIndex, nodeCodeOf, familyOf, tradeOfNode, rowMatches, countByTrade, load
    });
});
