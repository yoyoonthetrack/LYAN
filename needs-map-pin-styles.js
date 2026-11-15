/* LYANN — couleurs et icônes des repères de carte.
 * Présentation seulement : les identifiants métier (familles V2, catégories) ne changent pas.
 * Les tracés viennent de Lucide (ISC), redessinés en trait blanc. */
(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;

    const normalize = (value) => String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const hasStem = (key, stem) => key.split(/[^a-z0-9]+/).filter(Boolean)
        .some((word) => word === stem || word.startsWith(stem));

    /* from = nuance claire, to = nuance du corps. Le dégradé reste dans une seule teinte. */
    const STYLES = Object.freeze({
        jardinage: { id: 'jardinage', label: 'Jardinage', from: '#C8EBC4', to: '#6FB584', icon: 'sprout' },
        plomberie: { id: 'plomberie', label: 'Plomberie', from: '#C8E8F8', to: '#5AABD4', icon: 'droplet' },
        electricite: { id: 'electricite', label: 'Électricité', from: '#FFF3C4', to: '#E8C56A', icon: 'zap' },
        bricolage: { id: 'bricolage', label: 'Bricolage', from: '#F8E0CC', to: '#D4A888', icon: 'hammer' },
        menage: { id: 'menage', label: 'Ménage', from: '#F8EBC4', to: '#E2B86A', icon: 'brush-cleaning' },
        beaute: { id: 'beaute', label: 'Beauté', from: '#F3DCF4', to: '#C9A4CC', icon: 'scissors' },
        transport: { id: 'transport', label: 'Transport', from: '#F6D0D2', to: '#E08B90', icon: 'car-front' },
        famille: { id: 'famille', label: 'Famille', from: '#D4F0EC', to: '#6BB8B0', icon: 'users' },
        evenement: { id: 'evenement', label: 'Événementiel', from: '#F8E2D0', to: '#E2B08A', icon: 'utensils' },
        numerique: { id: 'numerique', label: 'Numérique', from: '#DDE4F8', to: '#95A4D8', icon: 'laptop' },
        autres: { id: 'autres', label: 'Autres', from: '#E2E8EA', to: '#A8B6BA', icon: 'shapes' }
    });

    const MIXED = Object.freeze({
        id: 'mixed', label: 'Plusieurs métiers', from: '#C5E8D0', to: '#4EAA78', icon: ''
    });

    const FAMILY_STYLE = Object.freeze({
        maison: 'bricolage',
        jardin: 'jardinage',
        entretien: 'menage',
        beaute: 'beaute',
        transport: 'transport',
        famille: 'famille',
        evenement: 'evenement',
        numerique: 'numerique',
        autres: 'autres'
    });

    const ICONS = Object.freeze({
        sprout: '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
        droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
        zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
        hammer: '<path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
        'brush-cleaning': '<path d="m16 22-1-4"/><path d="M19 13.99a1 1 0 0 0 1-1V12a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v.99a1 1 0 0 0 1 1"/><path d="M5 14h14l1.973 6.767A1 1 0 0 1 20 22H4a1 1 0 0 1-.973-1.233z"/><path d="m8 22 1-4"/>',
        scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
        'car-front': '<path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>',
        shapes: '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
        utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
        laptop: '<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/>',
        all: '<circle cx="12" cy="12" r="7.5"/>'
    });

    const CATALOG = Object.freeze(['jardinage', 'plomberie', 'electricite', 'bricolage', 'menage', 'beaute', 'transport', 'famille', 'evenement', 'numerique', 'autres']);

    function categoryOf(row, leaves) {
        if (row && row.taxonomy_id && Array.isArray(leaves)) {
            const leaf = leaves.find((item) => item && item.id === row.taxonomy_id);
            if (leaf && leaf.category) return leaf.category;
        }
        return (row && (row.category || row.title)) || '';
    }

    function maisonStyle(category) {
        const key = normalize(category);
        if (hasStem(key, 'plomb')) return 'plomberie';
        if (hasStem(key, 'electr') || hasStem(key, 'eclair')) return 'electricite';
        return 'bricolage';
    }

    function styleIdForRow(row, leaves) {
        const families = root.LYANN_MAP_CATEGORY_FAMILIES;
        const family = families && typeof families.familyForRow === 'function' ? families.familyForRow(row, leaves) : '';
        if (family === 'maison') return maisonStyle(categoryOf(row, leaves));
        return FAMILY_STYLE[family] || 'autres';
    }

    function styleIdForItems(items, leaves) {
        const list = Array.isArray(items) ? items : [];
        const ids = list.map((row) => styleIdForRow(row, leaves));
        const unique = new Set(ids);
        if (list.length > 1 && unique.size !== 1) return 'mixed';
        return ids[0] || 'autres';
    }

    function specFor(styleId) {
        if (styleId === 'mixed') return MIXED;
        return STYLES[styleId] || STYLES.autres;
    }

    function iconSvg(name) {
        const body = ICONS[name] || ICONS.shapes;
        return `<svg class="needs-map-pin-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
    }

    function filterRows(rows, styleId, leaves) {
        const list = Array.isArray(rows) ? rows : [];
        if (!styleId || !STYLES[styleId]) return list;
        return list.filter((row) => styleIdForRow(row, leaves) === styleId);
    }

    /** Sélection unique : recliquer ou « Toutes » revient à l'ensemble. */
    function nextStyle(current, clicked) {
        if (!clicked || clicked === 'all' || clicked === current) return '';
        return STYLES[clicked] ? clicked : (current || '');
    }

    function faceHtml(styleId, count) {
        const n = Math.max(1, Number(count) || 1);
        const spec = specFor(styleId);
        const cluster = n > 1;
        const mark = cluster
            ? `<span class="needs-map-pin-count">${n}</span>`
            : iconSvg(spec.icon);
        return `<span class="needs-map-pin-face is-pin-${spec.id}${cluster ? ' has-count' : ''}" style="--pin-from:${spec.from};--pin-to:${spec.to}" data-pin="${spec.id}" aria-hidden="true"><span class="needs-map-pin-glyph">${mark}</span></span>`;
    }

    const api = Object.freeze({
        STYLES,
        MIXED,
        CATALOG,
        FAMILY_STYLE,
        styleIdForRow,
        styleIdForItems,
        specFor,
        filterRows,
        nextStyle,
        faceHtml,
        iconSvg
    });

    root.LYANN_MAP_PIN_STYLES = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
