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

    function territoryKeyFromLabel(value) {
        const resolver = window.LYANN_BOKANTAJ_QUERY?.territoryKeyFromLabel;
        return typeof resolver === 'function' ? resolver(value) : '';
    }

    async function resolveDiscoverTerritoryKey() {
        try {
            await window.LYANN_BOKANTAJ_PLACE?.ready?.();
            const key = window.LYANN_BOKANTAJ_PLACE?.current?.();
            if (key && key !== 'all') return key;
        } catch (_) {}
        return '';
    }

    function profileTerritoryKey(profile) {
        return territoryKeyFromLabel(profile?.territory) || '';
    }

    function requestTerritoryKey(row) {
        return territoryKeyFromLabel(row?.territory || row?.location) || '';
    }

    function prioritizeTerritory(items, territoryKey, keyFn) {
        if (!territoryKey || !items.length) return { items, localCount: 0 };
        const local = items.filter(item => keyFn(item) === territoryKey);
        const rest = items.filter(item => keyFn(item) !== territoryKey);
        return { items: local.concat(rest), localCount: local.length };
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
        return `<button type="button" class="discover-need-row" data-request-id="${escapeText(row.id)}">
            <span class="discover-need-icon" aria-hidden="true"><i class="ph ph-map-pin"></i></span>
            <span class="discover-need-text">
                <strong>${escapeText(title)}</strong>
                <span>${escapeText(placeLabel(row))}${price ? ` · ${escapeText(price)}` : ''}</span>
            </span>
            <i class="ph ph-caret-right" aria-hidden="true"></i>
        </button>`;
    }

    function talentCard(profile) {
        const format = window.LYANN_ANNONCE_FORMAT;
        const name = window.formatPublicName?.(profile, null, 'Lyanneur') || profile.name || 'Lyanneur';
        const activity = talentActivity(profile);
        const rating = format?.ratingLabel?.(profile) || '';
        const avatar = window.getLyannAvatarUrl?.(profile.avatar_url) || profile.avatar || '';
        const photo = avatar
            ? `<img src="${escapeText(avatar)}" alt="" width="52" height="52" loading="lazy">`
            : '<span class="discover-avatar-fallback" aria-hidden="true"></span>';
        const ratingHtml = rating
            ? `<span class="discover-talent-rating"><i class="ph-fill ph-star" aria-hidden="true"></i><span>${escapeText(rating)}</span></span>`
            : '';
        return `<button type="button" class="discover-talent-mini" data-member-id="${escapeText(profile.id)}">
            <span class="discover-talent-photo">${photo}</span>
            <span class="discover-talent-body">
                <h3>${escapeText(name)}</h3>
                ${activity ? `<span class="discover-talent-skill">${escapeText(activity)}</span>` : ''}
                ${ratingHtml}
            </span>
        </button>`;
    }

    const OFFER_AFTER_LOGIN_KEY = 'lyann_discover_offer_after_login';

    function profileHasOfferSkills(profile) {
        const services = profile?.services;
        if (Array.isArray(services) && services.length > 0) return true;
        const skills = profile?.skills;
        if (Array.isArray(skills) && skills.filter(Boolean).length > 0) return true;
        if (typeof skills === 'string' && skills.trim()) return true;
        return false;
    }

    function goOfferTalents(event) {
        if (event) event.preventDefault();
        const missionsUrl = 'results.html?mode=annonces';
        const auth = window.LYANN_AUTH_STATE;

        if (knownLoggedOut()) {
            try { sessionStorage.setItem(OFFER_AFTER_LOGIN_KEY, missionsUrl); } catch (_) {}
            document.querySelector('.open-login-trigger')?.click();
            return;
        }

        Promise.resolve(auth?.ready?.()).then(() => {
            const snapshot = auth?.getSnapshot?.();
            const profile = snapshot?.profile || snapshot?.user || null;
            const needsSkills = window.LYANN_SUPABASE_LOCK === 'tdktfbtqceldlaeqjtow'
                && profile
                && !profileHasOfferSkills(profile);
            if (needsSkills) {
                if (typeof window.openCompleteProfileModal === 'function') {
                    window.openCompleteProfileModal();
                    return;
                }
                if (window.LYANN_SUPABASE_LOCK === 'tdktfbtqceldlaeqjtow') {
                    window.location.href = 'professional.html';
                    return;
                }
            }
            window.location.href = missionsUrl;
        }).catch(() => {
            window.location.href = missionsUrl;
        });
    }

    function knownLoggedOut() {
        return !window.LYANN_AUTH_STATE?.isAuthenticated?.();
    }

    // « À la une près de chez vous » : cartes publiées par la rédaction (RLS : publiées et dans leurs dates uniquement).
    // Aucune carte de démonstration : sans carte réelle, ou si la table est indisponible, la section reste masquée.
    const HIGHLIGHT_COLUMNS = 'id,title,teaser,label,image_url,image_alt,territory,theme,cta_target,cta_value,starts_at,ends_at,priority,published_at';
    async function loadHighlights(territoryKey) {
        const section = document.getElementById('discoverHighlights');
        const rail = document.getElementById('discoverHighlightsRail');
        const view = window.LYANN_HIGHLIGHTS;
        const supabase = (window.LYANN_API_CLIENT || window.apiClient)?.supabase;
        if (!section || !rail || !view || !supabase) return;
        try {
            const { data, error } = await supabase.from('editorial_highlights').select(HIGHLIGHT_COLUMNS).order('priority', { ascending: true }).limit(12);
            if (error) throw error;
            const cards = view.select(data || [], territoryKey, 3);
            if (!cards.length) { section.hidden = true; return; }
            rail.classList.toggle('is-few', cards.length < 3);
            rail.innerHTML = cards.map((card) => view.renderCard(card)).join('');
            section.hidden = false;
        } catch (_) {
            section.hidden = true;
        }
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
            const submitterMode = event.submitter?.dataset.mode;
            const mode = submitterMode === 'annonces' ? 'annonces' : 'lyanneurs';
            const params = new URLSearchParams({ mode });
            const text = query?.value.trim();
            if (text) params.set('query', text);
            window.location.href = `results.html?${params.toString()}`;
        });

        document.getElementById('discoverOfferTalents')?.addEventListener('click', goOfferTalents);

        window.addEventListener('lyann:auth-state', (event) => {
            if (!event.detail?.authenticated) return;
            let next = null;
            try { next = sessionStorage.getItem(OFFER_AFTER_LOGIN_KEY); } catch (_) {}
            if (!next) return;
            try { sessionStorage.removeItem(OFFER_AFTER_LOGIN_KEY); } catch (_) {}
            const authState = window.LYANN_AUTH_STATE;
            authState?.ready?.().then(() => {
                const snapshot = authState.getSnapshot?.();
                const profile = snapshot?.profile || snapshot?.user || null;
                if (profile && !profileHasOfferSkills(profile) && typeof window.openCompleteProfileModal === 'function') {
                    window.openCompleteProfileModal();
                    return;
                }
                window.location.href = next;
            }).catch(() => {
                window.location.href = next;
            });
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
            const territoryKey = await resolveDiscoverTerritoryKey();
            loadHighlights(territoryKey);
            const [requestResult, talentResult] = await Promise.allSettled([repo.loadRequests(), repo.load()]);
            if (requestResult.status === 'fulfilled') {
                const eligible = requestResult.value.filter(eligibleRequest);
                const rankedNeeds = prioritizeTerritory(eligible, territoryKey, requestTerritoryKey);
                requests = rankedNeeds.items.slice(0, 4);
                needs.innerHTML = requests.length
                    ? requests.map(requestCard).join('')
                    : state('Aucune annonce ouverte pour le moment.', 'Revenez bientôt ou consultez toutes les annonces.');
            } else {
                requests = [];
                needs.innerHTML = state('Les annonces n\'ont pas pu être chargées.', 'Vérifiez votre connexion, puis réessayez.', 'retry-needs');
            }
            if (talentResult.status === 'fulfilled') {
                const rankedProfiles = talentResult.value
                    .filter(profile => talentActivity(profile))
                    .sort((a, b) => (Number(b.reviews_count) || 0) - (Number(a.reviews_count) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
                const rankedTalents = prioritizeTerritory(rankedProfiles, territoryKey, profileTerritoryKey);
                profiles = rankedTalents.items.slice(0, 3);
                talents.innerHTML = profiles.length
                    ? profiles.map(talentCard).join('')
                    : state('Aucun talent à afficher pour le moment.', 'Explorez l\'annuaire Lyanneurs.');
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
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { eligibleRequest, territoryName, prioritizeTerritory, profileTerritoryKey, requestTerritoryKey };
    }
})();
