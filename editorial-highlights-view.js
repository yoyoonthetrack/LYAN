/* LYANN — cartes « À la une près de chez vous » : rendu partagé (Découvrir + aperçu du back-office).
 * Texte uniquement (échappé), destination = cible autorisée, jamais une URL libre. */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LYANN_HIGHLIGHTS = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const TARGETS = Object.freeze({
        lyanneurs: () => 'results.html?mode=lyanneurs',
        lyanneurs_category: (v) => `results.html?mode=lyanneurs&category=${encodeURIComponent(v || '')}`,
        annonces: () => 'results.html?mode=annonces',
        annonces_category: (v) => `results.html?mode=annonces&category=${encodeURIComponent(v || '')}`,
        annonces_map: () => 'results.html?mode=annonces&view=map'
    });
    const TERRITORY_LABEL = Object.freeze({ all: 'Tous les territoires', guadeloupe: 'Guadeloupe', martinique: 'Martinique', guyane: 'Guyane', reunion: 'La Réunion' });

    const escapeText = (value) => String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function hrefFor(row) {
        const build = row && TARGETS[row.cta_target];
        return build ? build(row.cta_value) : null;
    }

    /** Same rule as the RLS policy, so a stale cache can never show an expired card. */
    function isLive(row, now = new Date()) {
        if (!row) return false;
        if (row.starts_at && new Date(row.starts_at) > now) return false;
        if (row.ends_at && new Date(row.ends_at) <= now) return false;
        return true;
    }

    /** Cards for one reader: its territory first, then every territory, then priority; at most `limit`. */
    function select(rows, territoryKey, limit = 3, now = new Date()) {
        const key = territoryKey && territoryKey !== 'all' ? territoryKey : '';
        return (Array.isArray(rows) ? rows : [])
            .filter((row) => row && row.title && row.teaser && hrefFor(row) && isLive(row, now)
                && (!key ? true : row.territory === 'all' || row.territory === key))
            .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0)
                || String(b.published_at || '').localeCompare(String(a.published_at || '')))
            .slice(0, limit);
    }

    /** `asLink:false` renders the same card without navigation (admin preview). */
    function renderCard(row, { asLink = true } = {}) {
        const href = hrefFor(row);
        const tag = asLink && href ? 'a' : 'div';
        const attrs = tag === 'a' ? ` href="${escapeText(href)}" data-highlight-id="${escapeText(row.id || '')}"` : '';
        const label = row.label ? `<span class="lyann-highlight-label">${escapeText(row.label)}</span>` : '';
        const image = row.image_url
            ? `<img src="${escapeText(row.image_url)}" alt="${escapeText(row.image_alt || '')}" width="240" height="150" loading="lazy" decoding="async">`
            : '';
        const media = `<span class="lyann-highlight-media${row.image_url ? '' : ' is-empty'}">${image}${label}</span>`;
        return `<${tag} class="lyann-highlight-card"${attrs}>${media}<span class="lyann-highlight-body"><strong class="lyann-highlight-title">${escapeText(row.title)}</strong><span class="lyann-highlight-teaser">${escapeText(row.teaser)}</span></span><i class="ph ph-caret-right lyann-highlight-chevron" aria-hidden="true"></i></${tag}>`;
    }

    return Object.freeze({ TARGETS, TERRITORY_LABEL, hrefFor, isLive, select, renderCard, escapeText });
});
