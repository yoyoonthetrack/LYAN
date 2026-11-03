/* LYANN — Découvrir V1.
 * Assemble les annonces et les profils déjà fournis par l'explorateur.
 * Aucun nouveau moteur de recherche et aucune donnée inventée.
 */
(function () {
    'use strict';

    const ADVICE = Object.freeze([]);

    function escapeText(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function eligibleRequest(row) {
        if (!row || !row.id) return false;
        if (row.visibility && row.visibility !== 'PUBLIC') return false;
        if (row.status && row.status !== 'OPEN') return false;
        if (row.safety_status && row.safety_status !== 'SAFE') return false;
        if (row.target_user_id) return false;
        if (row.classification_status && !['CLASSIFIED', 'UNCLASSIFIED'].includes(row.classification_status)) return false;
        if (row.public_moderation_status != null && row.public_moderation_status !== 'approved') return false;
        return true;
    }

    function territoryName(value) {
        const key = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (key.includes('guadeloupe')) return 'Guadeloupe';
        if (key.includes('martinique')) return 'Martinique';
        if (key.includes('guyane')) return 'Guyane';
        if (key.includes('reunion')) return 'La Réunion';
        return String(value || '').trim();
    }

    function placeLabel(row) {
        const raw = String(row.city || row.location || '').trim();
        if (!raw) return 'Lieu non précisé';
        const readable = raw.split(/\s*[·,]\s*/).map(territoryName).filter(Boolean).join(' · ');
        if (/\d/.test(raw)) {
            const parts = readable.split(' · ');
            const last = parts[parts.length - 1] || '';
            if (last && !/\d/.test(last)) return last;
            return 'Lieu indiqué sur l\'annonce';
        }
        return readable;
    }

    function talentActivity(profile) {
        const service = (profile.services || []).find(item => item && (item.title || item.name));
        return service ? String(service.title || service.name).trim() : '';
    }

    function talentPlace(profile) {
        const territory = territoryName(profile.territory);
        if (territory && typeof window.formatProfileLocation === 'function') {
            return window.formatProfileLocation(profile.city, territory);
        }
        return [profile.city, territory].filter(Boolean).join(' · ');
    }

    function openRequest(row) {
        if (typeof window.openLyannDetailModal === 'function') {
            window.openLyannDetailModal(row.id, row);
            return;
        }
        window.location.href = `results.html?mode=annonces&openLyann=${encodeURIComponent(row.id)}`;
    }

    function openTalent(profile) {
        if (typeof window.openPublicMemberProfile === 'function') {
            window.openPublicMemberProfile(profile.id);
            return;
        }
        window.location.href = `results.html?mode=lyanneurs&action=member&id=${encodeURIComponent(profile.id)}`;
    }

    function state(title, text, action) {
        const button = action
            ? `<button type="button" class="btn btn-outline" data-discover-action="${action}">Réessayer</button>`
            : '';
        return `<div class="discover-state"><h3>${escapeText(title)}</h3><p>${escapeText(text)}</p>${button}</div>`;
    }

    function requestCard(row) {
        const format = window.LYANN_ANNONCE_FORMAT;
        const title = format?.shortTitle?.(row.title) || row.title || 'Annonce';
        const price = format?.priceLabel?.(row) || '';
        const category = String(row.category || '').trim();
        const badge = category || 'Annonce';
        return `<button type="button" class="discover-card discover-need-card" data-request-id="${escapeText(row.id)}">
            <span class="discover-card-badge">${escapeText(badge)}</span>
            <h3>${escapeText(title)}</h3>
            <p class="discover-meta">${escapeText(placeLabel(row))}${price ? ` · ${escapeText(price)}` : ''}</p>
        </button>`;
    }

    function talentCard(profile) {
        const format = window.LYANN_ANNONCE_FORMAT;
        const name = window.formatPublicName?.(profile, null, 'Lyanneur') || profile.name || 'Lyanneur';
        const activity = talentActivity(profile);
        const place = talentPlace(profile);
        const rating = format?.ratingLabel?.(profile) || '';
        const verified = format?.verifiedLabel?.(profile) || '';
        const avatar = window.getLyannAvatarUrl?.(profile.avatar_url) || profile.avatar || '';
        const photo = avatar
            ? `<img src="${escapeText(avatar)}" alt="" width="52" height="52" loading="lazy">`
            : '<span class="discover-avatar-fallback" aria-hidden="true"></span>';
        return `<button type="button" class="discover-card discover-talent" data-member-id="${escapeText(profile.id)}">
            ${photo}
            <span class="discover-talent-body">
                <div class="discover-talent-head">
                    <h3>${escapeText(name)}</h3>
                    ${verified ? `<span class="discover-verified">${escapeText(verified)}</span>` : ''}
                </div>
                ${activity ? `<p class="discover-activity">${escapeText(activity)}</p>` : ''}
                <p class="discover-meta">${escapeText(place || 'Commune non renseignée')}${rating ? ` · ${escapeText(rating)}` : ''}</p>
            </span>
        </button>`;
    }

    function renderAdvice() {
        const section = document.getElementById('discoverAdvice');
        const list = document.getElementById('discoverAdviceList');
        if (!section || !list) return;
        const items = ADVICE.filter(item => item && item.title && item.text && !item.author);
        if (!items.length) {
            section.remove();
            return;
        }
        list.innerHTML = items.map(item => `<article class="discover-card"><h3>${escapeText(item.title)}</h3><p>${escapeText(item.text)}</p></article>`).join('');
        section.hidden = false;
    }

    function init() {
        const root = document.getElementById('discover');
        if (!root || root.dataset.ready === '1') return;
        root.dataset.ready = '1';
        const needs = document.getElementById('discoverNeeds');
        const talents = document.getElementById('discoverTalents');
        const form = document.getElementById('discoverSearchForm');
        const query = document.getElementById('discoverQuery');
        let requests = [];
        let profiles = [];

        form?.addEventListener('submit', event => {
            event.preventDefault();
            const mode = event.submitter?.dataset.mode === 'lyanneurs' ? 'lyanneurs' : 'annonces';
            const params = new URLSearchParams({ mode });
            const text = query?.value.trim();
            if (text) params.set('query', text);
            window.location.href = `results.html?${params.toString()}`;
        });

        needs?.addEventListener('click', event => {
            const retry = event.target.closest('[data-discover-action="retry-needs"]');
            if (retry) { load(); return; }
            const card = event.target.closest('[data-request-id]');
            if (!card) return;
            const row = requests.find(item => item.id === card.dataset.requestId);
            if (row) openRequest(row);
        });

        talents?.addEventListener('click', event => {
            const retry = event.target.closest('[data-discover-action="retry-talents"]');
            if (retry) { load(); return; }
            const card = event.target.closest('[data-member-id]');
            if (!card) return;
            const row = profiles.find(item => item.id === card.dataset.memberId);
            if (row) openTalent(row);
        });

        async function load() {
            const repo = window.LYANN_EXPLORER_REPOSITORY;
            renderAdvice();
            if (!repo) {
                needs.innerHTML = state('Découvrir est indisponible.', 'Rechargez la page dans un instant.', 'retry-needs');
                talents.innerHTML = state('Les talents ne peuvent pas être affichés.', 'Rechargez la page dans un instant.', 'retry-talents');
                needs.setAttribute('aria-busy', 'false');
                talents.setAttribute('aria-busy', 'false');
                return;
            }
            needs.setAttribute('aria-busy', 'true');
            talents.setAttribute('aria-busy', 'true');
            needs.innerHTML = state('Chargement des annonces', 'Les besoins publics arrivent.');
            talents.innerHTML = state('Chargement des talents', 'Les profils publics arrivent.');
            const [requestResult, talentResult] = await Promise.allSettled([repo.loadRequests(), repo.load()]);
            if (requestResult.status === 'fulfilled') {
                requests = requestResult.value.filter(eligibleRequest).slice(0, 6);
                needs.innerHTML = requests.length
                    ? requests.map(requestCard).join('')
                    : state('Aucune annonce pour le moment.', 'Les besoins publics apparaîtront ici dès qu\'ils seront disponibles.');
            } else {
                requests = [];
                needs.innerHTML = state('Les annonces n\'ont pas pu être chargées.', 'Vérifiez votre connexion, puis réessayez.', 'retry-needs');
            }
            if (talentResult.status === 'fulfilled') {
                profiles = talentResult.value
                    .filter(profile => talentActivity(profile))
                    .sort((a, b) => (Number(b.reviews_count) || 0) - (Number(a.reviews_count) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'fr'))
                    .slice(0, 6);
                talents.innerHTML = profiles.length
                    ? profiles.map(talentCard).join('')
                    : state('Aucun talent à afficher.', 'Les lyanneurs visibles apparaîtront ici.');
            } else {
                profiles = [];
                talents.innerHTML = state('Les talents n\'ont pas pu être chargés.', 'Vérifiez votre connexion, puis réessayez.', 'retry-talents');
            }
            needs.setAttribute('aria-busy', 'false');
            talents.setAttribute('aria-busy', 'false');
        }

        const start = () => load().catch(() => {
            needs.innerHTML = state('Les annonces n\'ont pas pu être chargées.', 'Vérifiez votre connexion, puis réessayez.', 'retry-needs');
            talents.innerHTML = state('Les talents n\'ont pas pu être chargés.', 'Vérifiez votre connexion, puis réessayez.', 'retry-talents');
        });
        if (window.LYANN_AUTH_STATE?.ready) window.LYANN_AUTH_STATE.ready().then(start, start);
        else start();
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.LYANN_DISCOVER = { eligibleRequest, init };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { eligibleRequest, territoryName };
})();
