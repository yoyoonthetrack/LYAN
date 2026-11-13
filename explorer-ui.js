(() => {
    'use strict';
    function init() {
        const root = document.getElementById('explorer');
        if (!root) return;
        const $ = id => document.getElementById(id);
        const repo = window.LYANN_EXPLORER_REPOSITORY;
        const escape = value => window.escapeHtmlAttr(String(value ?? ''));
        const params = new URLSearchParams(location.search);
        const V2 = () => window.LYANN_MARKETPLACE_TAXONOMY;
        const cleanGroups = value => String(value || '').split(',').map(g => g.trim()).filter(g => /^[a-z0-9_]+$/.test(g)).join(',');
        /** Référentiel V2 chargé en lecture ; null tant qu'il n'est pas disponible (lignes historiques : pont minimal). */
        let v2Index = null;
        let mode = params.get('mode') === 'annonces' ? 'annonces' : 'lyanneurs';
        let filters = { query: params.get('query') || params.get('searchInput') || '',
            category: params.get('category') || '', service: params.get('service') || '',
            area: params.get('area') ?? params.get('citySelect') ?? params.get('locationSelect') ?? '',
            territory: params.get('territory') || '', commune: params.get('commune') || '', urgency: params.get('urgency') || '', budget: params.get('budget') || '',
            // Référentiel V2 : family = code de famille, groups = groupes (liste), job = code de métier, specialty = code de spécialité.
            family: V2().normalizeFamilyParam(params.get('family')), groups: cleanGroups(params.get('groups')), job: params.get('job') || '', specialty: params.get('specialty') || '' };
        const explicitFilter = ['query','searchInput','category','service','area','citySelect','locationSelect','territory','commune','urgency','budget','family','groups','job','specialty'].some(key => params.has(key));
        if (!explicitFilter) {
            try {
                const saved = JSON.parse(sessionStorage.getItem('lyann-explorer-filters:' + mode) || 'null');
                if (saved && typeof saved === 'object') {
                    filters = {
                        query: saved.query || '', category: saved.category || '', service: saved.service || '',
                        area: saved.area || '', territory: saved.territory || '', commune: saved.commune || '',
                        urgency: saved.urgency || '', budget: saved.budget || '', family: V2().normalizeFamilyParam(saved.family),
                        groups: cleanGroups(saved.groups), job: saved.job || '', specialty: saved.specialty || ''
                    };
                }
            } catch (_) {}
        }
        // "Liste / Carte" only exists for annonces; the same filters feed both.
        let view = params.get('view') === 'map' ? 'map' : 'list';
        let needsMap = null;
        let revealMap = view === 'map';
        let leaves = [], records = [], revision = 0, savedArea = '', viewerTerritory = '';
        let listScrollY = 0;
        let lastSearchArea = filters.area;
        /** @type {string[]|null} null = toutes les familles visuelles */
        let mapFamilyFilter = null;
        let mapFamilyDraft = null;
        let mapCategorySheetOpen = false;
        // The delay filter offers the same date modes the cards display, so a chosen
        // option always matches what a reader sees on the results.
        const dateModeLabel = value => window.LYANN_ANNONCE_FORMAT?.dateModeLabel(value) || value;
        const name = profile => window.formatPublicName(profile || {}, null, 'Lyanneur');
        const avatar = profile => escape(window.getLyannAvatarUrl(profile?.avatar_url));
        const currentUserId = () => window.LYANN_AUTH_STATE?.getSnapshot?.().userId || window.LYANN_API_CLIENT?.getCurrentUserId?.();
        function favorite(type, id) {
            return `<button type="button" class="lyann-favorite-btn btn-fav-toggle" data-favorite-type="${type}" data-favorite-id="${escape(id)}" data-fav-type="${type}" data-fav-id="${escape(id)}" data-surface="search-explorer" aria-label="Ajouter aux favoris"><i class="ph ph-bookmark-simple" aria-hidden="true"></i></button>`;
        }
        // The avatar and name zone opens the canonical public profile. A heading must
        // stay a real heading, so the whole zone is covered by one overlay control
        // instead of wrapping the markup. The anonymous discovery contract withholds
        // the author identifier, so no affordance is rendered without one.
        function profileZoneTrigger(memberId, label) {
            if (memberId) return `<button type="button" class="explorer-person-overlay" data-action="profile" data-id="${escape(memberId)}" aria-label="Voir le profil de ${escape(label)}"></button>`;
            if (currentUserId()) return '';
            return `<button type="button" class="explorer-person-overlay" data-action="profile" aria-label="Se connecter pour voir le profil de ${escape(label)}"></button>`;
        }
        const format = () => window.LYANN_ANNONCE_FORMAT;
        // One fact per line, each icon decorative and each line labelled for
        // screen readers. A missing fact drops its line instead of showing a filler.
        function factLine(icon, label, text, hint, extraClass = '') {
            if (!text) return '';
            const cls = extraClass ? ` class="explorer-annonce-fact ${extraClass}"` : ' class="explorer-annonce-fact"';
            return `<li${cls}${hint ? ` title="${escape(hint)}"` : ''}><span class="explorer-fact-icon" aria-hidden="true">${icon}</span><span class="sr-only">${escape(label)} : </span><span class="explorer-fact-text">${escape(text)}</span></li>`;
        }
        function annonceFact(phIcon, label, text, hint, extraClass = '') {
            if (!text) return '';
            const cls = extraClass ? ` class="explorer-annonce-fact ${extraClass}"` : ' class="explorer-annonce-fact"';
            return `<li${cls}${hint ? ` title="${escape(hint)}"` : ''}><i class="ph ${phIcon} explorer-fact-icon" aria-hidden="true"></i><span class="sr-only">${escape(label)} : </span><span class="explorer-fact-text">${escape(text)}</span></li>`;
        }
        // Annonce locations are municipality-level, so the distance is an
        // approximation between commune centres and is only shown when the viewer's
        // own commune or an opted-in precise position is known.
        function placeText(r) {
            const place = String(r.location || '').replace(/\s*\([^)]*\)\s*/g, '').trim();
            const distance = window.LYANN_GEO?.describeDistanceTo?.(r.location) || null;
            return [place || 'Lieu non précisé', distance].filter(Boolean).join(' · ');
        }
        function typePill(kind) {
            const label = kind === 'annonce' ? 'Annonce' : 'Profil';
            return `<span class="explorer-type-pill is-${kind}">${label}</span>`;
        }
        // Petit avatar rond de l'auteur, à gauche du titre. Il ouvre le profil public ; sans identifiant (contrat visiteur) il invite à se connecter.
        function authorAvatar(r, label) {
            const memberId = r.requester_id || r.profiles?.id;
            const img = `<img src="${avatar(r.profiles)}" alt="" width="36" height="36" loading="lazy" onerror="window.handleAvatarError(this)">`;
            if (!memberId && currentUserId()) return `<span class="explorer-annonce-avatar" aria-hidden="true">${img}</span>`;
            return `<button type="button" class="explorer-annonce-avatar" data-action="profile"${memberId ? ` data-id="${escape(memberId)}"` : ''} aria-label="${memberId ? `Voir le profil de ${escape(label)}` : `Se connecter pour voir le profil de ${escape(label)}`}">${img}</button>`;
        }
        function requestCard(r, showType = false) {
            const own = Boolean(currentUserId()) && r.requester_id === currentUserId();
            const authorName = name(r.profiles);
            const taxonomy = format()?.categoryLine(r, leaves);
            const age = format()?.relativeAge(r.created_at);
            const badge = format()?.verifiedLabel(r.profiles);
            const rating = format()?.ratingLabel(r.profiles);
            const distanceKnown = Boolean(window.LYANN_GEO?.referencePoint?.());
            // The card carries the short title only; the full description the author
            // wrote is the payload of the Détails surface.
            return `<article class="explorer-card explorer-annonce explorer-annonce-compact" data-request-id="${escape(r.id)}">
                <div class="explorer-card-top explorer-annonce-head">
                    <div class="explorer-annonce-labels">
                        ${showType ? typePill('annonce') : ''}
                        ${taxonomy ? `<span class="explorer-annonce-taxonomy" title="${escape(taxonomy)}">${escape(taxonomy)}</span>` : ''}
                        ${age ? `<span class="explorer-annonce-age">${escape(age)}</span>` : ''}
                    </div>
                    ${favorite('REQUEST', r.id)}
                </div>
                <div class="explorer-annonce-titlerow">
                    ${authorAvatar(r, authorName)}
                    <h2 class="explorer-annonce-title">${escape(format()?.shortTitle(r.title) || r.title)}</h2>
                </div>
                <ul class="explorer-annonce-facts">
                    ${annonceFact('ph-map-pin', 'Lieu', placeText(r), distanceKnown ? 'Distance approximative entre communes' : '', 'explorer-fact-location')}
                    ${annonceFact('ph-currency-eur', 'Prix', format()?.priceLabel(r), '', 'explorer-fact-price')}
                    ${annonceFact('ph-calendar-blank', 'Date', format()?.dateLabel(r), '', 'explorer-fact-date')}
                </ul>
                <div class="explorer-person explorer-person-zone explorer-annonce-author">${profileZoneTrigger(r.requester_id || r.profiles?.id, authorName)}<span class="explorer-person-name">${escape(authorName)}${own ? ' · Votre annonce' : ''}</span>${badge ? `<span class="explorer-person-badge"><i class="ph-fill ph-seal-check" aria-hidden="true"></i>${escape(badge)}</span>` : ''}${rating ? `<span class="explorer-person-rating"><i class="ph-fill ph-star" aria-hidden="true"></i><span class="sr-only">Note : </span>${escape(rating)}</span>` : ''}</div>
                <div class="explorer-card-actions explorer-annonce-actions"><button class="btn btn-primary" data-action="detail" data-id="${escape(r.id)}">Voir l'annonce →</button>${!own && r.status === 'OPEN' ? `<button class="btn btn-outline explorer-btn-lyanner" data-action="help" data-id="${escape(r.id)}">Lyanner</button>` : ''}</div>
            </article>`;
        }
        function formatDisplayName(p) {
            if (!p) return 'Lyanneur';
            if (typeof window.formatPublicName === 'function') {
                return window.formatPublicName(p, null, 'Lyanneur');
            }
            const first = window.capitalizeLyannName ? window.capitalizeLyannName(p.first_name || '') : String(p.first_name || '').trim();
            const last = p.last_name ? String(p.last_name).trim() : '';
            const initial = last.match(/[A-Za-zÀ-ÿ]/);
            if (first && initial) return `${first} ${initial[0].toUpperCase()}.`;
            if (first) return first;
            return String(p.name || 'Lyanneur').trim();
        }

        function getSeedProfileMetadata(p) {
            const catalog = window.LYANN_MAISON_CATALOG || [];
            if (p && catalog.length) {
                const match = catalog.find(m => 
                    (p.first_name && m.first_name.toLowerCase() === p.first_name.toLowerCase() && p.last_name && m.last_name.toLowerCase() === p.last_name.toLowerCase()) ||
                    (p.name && m.first_name && p.name.toLowerCase().includes(m.first_name.toLowerCase()) && m.last_name && p.name.toLowerCase().includes(m.last_name.substring(0, 1).toLowerCase()))
                );
                if (match) return match;
            }
            return null;
        }

        function formatRadiusText(p) {
            const seed = getSeedProfileMetadata(p);
            const raw = seed?.intervention_radius_km ?? p.intervention_radius_km ?? p.radius ?? p.intervention_radius;
            if (raw === null || raw === undefined) return "Se déplace jusqu'à 20 km";
            const str = String(raw).toLowerCase();
            if (str.includes('toute') || str.includes('territoire') || str.includes('île') || str.includes('ile') || Number(raw) >= 50) {
                return "Se déplace dans toute l'île";
            }
            const num = parseInt(str.replace(/\D/g, ''), 10);
            if (!isNaN(num) && num > 0) {
                return `Se déplace jusqu'à ${num} km`;
            }
            return `Se déplace jusqu'à 20 km`;
        }

        function formatBioQuote(p, skillsText) {
            const seed = getSeedProfileMetadata(p);
            let bio = (seed?.bio || p.bio || p.short_bio || p.headline || '').trim();
            if (bio) {
                bio = bio.replace(/^["«“'\s]+|["»”'\s]+$/g, '');
            } else {
                const city = p.city || 'Guadeloupe';
                const skillsSnippet = skillsText ? skillsText.split(' · ').slice(0, 2).join(' & ') : 'services de proximité';
                bio = `Disponible sur ${city} et aux alentours pour vos besoins en ${skillsSnippet}.`;
            }
            return `« ${bio} »`;
        }

        function formatStatsLine(p) {
            const seed = getSeedProfileMetadata(p);
            const ratingNum = Number(seed?.rating ?? p.rating ?? p.average_rating ?? p.avg_rating);
            const reviewsCount = Number(seed?.reviews_count ?? p.reviews_count ?? p.reviewsCount ?? 0);
            const speed = seed?.response_speed || p.response_speed || p.response_rate_text || '';
            const parts = [];
            if (reviewsCount > 0 && ratingNum > 0) {
                parts.push(`⭐ ${ratingNum.toFixed(1).replace('.', ',')}`, `${reviewsCount} avis`);
            } else {
                parts.push('Nouveau sur LYANN');
            }
            if (speed) parts.push(`⚡ ${speed}`);
            return parts.join(' · ');
        }

        // Compact row: photo, public name, main skill, rating only when it is real, approximate zone, favourite and chevron.
        function profileCard(p, showType = false) {
            const displayName = formatDisplayName(p);
            const place = (window.formatProfileLocation
                ? window.formatProfileLocation(p.city, p.territory)
                : ([p.city, p.territory].filter(Boolean).join(' · ') || ''))
                // Some profiles store the territory in lower case ("martinique"): show it as a proper name.
                .replace(/( · )(\p{Ll})/u, (_, sep, first) => sep + first.toUpperCase());
            const rawSkills = Array.isArray(p.skills) && p.skills.length ? p.skills : (Array.isArray(p.intervention_zone) && p.intervention_zone.length ? p.intervention_zone : (p.services || []).map(s => s.title || s.name).filter(Boolean));
            const primarySkill = rawSkills[0] || '';
            const seed = getSeedProfileMetadata(p);
            const ratingLabel = format()?.ratingLabel({
                ...p,
                average_rating: seed?.rating ?? p.average_rating ?? p.rating ?? p.avg_rating,
                reviews_count: seed?.reviews_count ?? p.reviews_count ?? p.reviewsCount
            });
            return `<article class="explorer-card explorer-profile-card explorer-profile-row" data-member-id="${escape(p.id)}">
                ${showType ? typePill('profile') : ''}
                ${profileZoneTrigger(p.id, displayName)}
                <img class="explorer-profile-avatar" src="${avatar(p)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)">
                <div class="explorer-profile-main">
                    <h2 class="explorer-profile-name">${escape(displayName)}</h2>
                    ${primarySkill ? `<p class="explorer-profile-primary-skill">${escape(primarySkill)}</p>` : ''}
                    <p class="explorer-profile-meta">${ratingLabel ? `<span class="explorer-profile-rating"><i class="ph-fill ph-star" aria-hidden="true"></i><span class="sr-only">Note : </span>${escape(ratingLabel)}</span>` : ''}${place ? `<span class="explorer-profile-place"><i class="ph ph-map-pin" aria-hidden="true"></i><span>${escape(place)}</span></span>` : ''}</p>
                </div>
                ${favorite('PROFILE', p.id)}
                <i class="ph ph-caret-right explorer-row-chevron" aria-hidden="true"></i>
            </article>`;
        }
        const territories = () => Object.keys(window.LYANN_TERRITORY_DATASET || {});
        function inferGeography(value, territoryHint = '') {
            const clean = v => window.LyanAI.normalizeText(String(v || '').replace(/\s*\(\d+\)/g, ''));
            const territory = territories().find(t => clean(t) === clean(territoryHint || value));
            const matches = (territory ? [territory] : territories()).flatMap(t => Object.values(window.LYANN_TERRITORY_DATASET[t]).flat().filter(c => clean(c) === clean(value)).map(c => ({territory:t, commune:c})));
            return matches.length === 1 ? matches[0] : {territory:territory || '', commune:''};
        }
        function syncCommunes(territory, selected = '') {
            const communes = [...new Set(Object.values(window.LYANN_TERRITORY_DATASET?.[territory] || {}).flat())].sort((a,b) => a.localeCompare(b, 'fr'));
            $('explorerCommune').innerHTML = '<option value="">Toutes les communes</option>' + communes.map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
            $('explorerCommune').disabled = !territory;
            $('explorerCommune').value = communes.includes(selected) ? selected : '';
        }
        $('explorerTerritory').addEventListener('change', () => syncCommunes($('explorerTerritory').value, $('explorerCommune').value));
        function syncUrl() {
            const next = new URLSearchParams();
            next.set('mode', mode);
            if (mode === 'annonces' && view === 'map') next.set('view', 'map');
            Object.entries(filters).forEach(([key, value]) => {
                if (value || key === 'area') next.set(key, value);
            });
            history.replaceState(null, '', `${location.pathname}?${next}`);
            try { sessionStorage.setItem('lyann-explorer-filters:' + mode, JSON.stringify(filters)); } catch (_) {}
        }
        const mapAvailable = () => mode === 'annonces' && view === 'map' && Boolean(window.LYANN_NEEDS_MAP);
        function setSurface(showMap) {
            const host = $('explorerMap');
            if (host) host.hidden = !showMap;
            $('explorerResults').hidden = showMap;
            $('explorerRanking').hidden = showMap;
        }
        function destroyNeedsMap() {
            needsMap?.destroy();
            needsMap = null;
        }
        const mapFamiliesApi = () => window.LYANN_MAP_CATEGORY_FAMILIES;
        function mapFamiliesActive() {
            const api = mapFamiliesApi();
            if (!api || !Array.isArray(mapFamilyFilter) || !mapFamilyFilter.length) return false;
            return mapFamilyFilter.length < api.FAMILIES.length;
        }
        function rowsForMapFamilies(results) {
            const api = mapFamiliesApi();
            if (!api || !mapFamiliesActive()) return results;
            return api.filterRowsByFamilies(results, mapFamilyFilter, leaves);
        }
        function closeMapCategorySheet() {
            mapCategorySheetOpen = false;
            document.body.classList.remove('explorer-map-category-sheet-open');
            $('explorerMapCategorySheet')?.close();
        }
        function openMapCategorySheet() {
            const api = mapFamiliesApi();
            if (!api) return;
            // Brouillon = liste explicite ; vide = « Toutes » (aucun filtre).
            mapFamilyDraft = api.canonicalFamilySelection(mapFamilyFilter || []);
            mapCategorySheetOpen = true;
            document.body.classList.add('explorer-map-category-sheet-open');
            renderMapCategoryGrid();
            const sheet = $('explorerMapCategorySheet');
            sheet?.showModal();
            render({ quiet: true });
        }
        function renderMapCategoryGrid() {
            const api = mapFamiliesApi();
            const host = $('explorerMapCategoryGrid');
            if (!api || !host) return;
            const draft = api.canonicalFamilySelection(mapFamilyDraft || []);
            const allOn = draft.length === 0 || draft.length >= api.FAMILIES.length;
            const familyIcon = {
                maison: 'ph-wrench', jardin: 'ph-plant', entretien: 'ph-broom', beaute: 'ph-flower',
                transport: 'ph-truck', famille: 'ph-users', evenement: 'ph-cooking-pot', numerique: 'ph-laptop'
            };
            // Chaque puce reflète uniquement sa propre famille : « Toutes » n'allume jamais les autres puces.
            host.innerHTML = `<button type="button" class="explorer-map-category-chip${allOn ? ' is-active' : ''}" data-family="__all__" aria-pressed="${allOn ? 'true' : 'false'}">Toutes</button>`
                + api.FAMILIES.map((family) => {
                    const active = draft.includes(family.id);
                    const tone = family.tone === 'yellow' ? 'is-tone-yellow' : 'is-tone-green';
                    const icon = familyIcon[family.id] || 'ph-calendar-blank';
                    return `<button type="button" class="explorer-map-category-chip ${tone}${active ? ' is-active' : ''}" data-family="${escape(family.id)}" aria-pressed="${active ? 'true' : 'false'}"><i class="ph ${icon}" aria-hidden="true"></i><span>${escape(family.label)}</span></button>`;
                }).join('');
        }
        // Un seul écouteur délégué (jamais rattaché aux puces recréées) : état lu au moment du clic, pas capturé au rendu.
        function onMapCategoryGridClick(event) {
            const button = event.target.closest('[data-family]');
            if (!button) return;
            const api = mapFamiliesApi();
            if (!api) return;
            event.preventDefault();
            event.stopPropagation();
            const id = button.dataset.family;
            mapFamilyDraft = id === '__all__'
                ? []
                : api.toggleFamilySelection(mapFamilyDraft || [], id);
            renderMapCategoryGrid();
        }
        function applyMapCategoryFilter() {
            const api = mapFamiliesApi();
            if (!api) return;
            mapFamilyFilter = api.effectiveFamilyFilter(mapFamilyDraft || []);
            if (mapFamilyFilter && mapFamilyFilter.length === 1) {
                filters.family = mapFamilyFilter[0];
                filters.groups = '';
                filters.job = '';
                filters.specialty = '';
            } else {
                clearTaxonomy();
            }
            closeMapCategorySheet();
            render({ quiet: true });
        }
        function clearMapCategoryFilter() {
            mapFamilyFilter = null;
            mapFamilyDraft = [];
            renderMapCategoryGrid();
            render({ quiet: true });
        }
        function ensureNeedsMap() {
            if (!needsMap) {
                needsMap = window.LYANN_NEEDS_MAP.mount($('explorerMap'), {
                    onOpen: row => window.openLyannDetailModal(row.id, row),
                    onShowList: () => setView('list'),
                    onReset: () => reset(),
                    onCategoriesOpen: () => openMapCategorySheet(),
                    onClearCategoryFilter: () => { mapFamilyFilter = null; closeMapCategorySheet(); render({ quiet: true }); }
                });
            }
            return needsMap;
        }
        function applyMapViewLayout() {
            document.body.classList.toggle('explorer-annonces-map-view', mapAvailable());
            root.dataset.explorerView = mode === 'annonces' ? view : 'list';
        }
        function setView(next) {
            const target = next === 'map' && window.LYANN_NEEDS_MAP ? 'map' : 'list';
            if (mode !== 'annonces' || target === view) return;
            if (view === 'list') listScrollY = window.scrollY;
            view = target;
            revealMap = false;
            syncControls();
            syncUrl();
            render({ quiet: true });
            if (view === 'list' && listScrollY) {
                requestAnimationFrame(() => window.scrollTo({ top: listScrollY, behavior: 'auto' }));
            }
        }
        function syncControls() {
            root.dataset.mode = mode;
            const toggle = $('explorerViewToggle');
            if (toggle) {
                toggle.hidden = mode !== 'annonces' || !window.LYANN_NEEDS_MAP;
                toggle.querySelectorAll('button[data-view]').forEach(button => {
                    const active = button.dataset.view === (mapAvailable() ? 'map' : 'list');
                    button.classList.toggle('is-active', active);
                    button.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
            }
            document.body.dataset.explorerMode = mode;
            const title = $('explorerTitle');
            const subtitle = $('explorerSubtitle');
            const copy = mode === 'annonces'
                ? { title: 'Annonces', subtitle: 'Des besoins réels autour de vous', art: 'annonces' }
                : { title: 'Lyanneurs', subtitle: 'Des talents et des pros près de chez vous', art: 'lyanneurs' };
            if (title) title.textContent = copy.title;
            if (subtitle) subtitle.textContent = copy.subtitle;
            const filterTitle = $('explorerFilterTitle');
            const filterSub = $('explorerFilterSub');
            if (filterTitle) filterTitle.textContent = mode === 'annonces' ? 'Filtrer les annonces' : 'Filtrer les Lyanneurs';
            if (filterSub) filterSub.textContent = mode === 'annonces'
                ? 'Affinez le service, le lieu ou le budget.'
                : 'Affinez le métier, le territoire ou la commune.';
            root.dataset.universe = copy.art;
            const header = root.querySelector('.lyann-universe-header');
            if (header) header.dataset.universe = copy.art;
            const wide = $('universeArtWide');
            const tall = $('universeArtTall');
            if (wide) wide.src = `assets/universe/${copy.art}-landscape.webp`;
            if (tall) tall.src = `assets/universe/${copy.art}-portrait.webp`;
            document.querySelectorAll('[data-explorer-nav]').forEach(link => {
                link.classList.toggle('active', link.getAttribute('data-explorer-nav') === mode);
            });
            $('explorerPanel').setAttribute('aria-labelledby', 'explorerTitle');
            $('explorerSearchInput').placeholder = mode === 'annonces' ? 'Rechercher une annonce, un besoin…' : 'Rechercher un talent, un service…';
            const publishBtn = root.querySelector('.explorer-results-heading .explorer-publish');
            if (publishBtn) publishBtn.hidden = mode === 'lyanneurs';
            root.querySelector('label[for="explorerSearchInput"]').textContent = `Rechercher dans les ${mode}`;
            $('explorerSearchInput').value = filters.query;
            const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const tradeFirst = ['plomb', 'electr', 'macon', 'menuis', 'peint', 'clim', 'jardin', 'couvr', 'carrel', 'serrur', 'chauff', 'bricol'];
            const rank = label => {
                const name = fold(label);
                const index = tradeFirst.findIndex(key => name.includes(key));
                return index === -1 ? tradeFirst.length : index;
            };
            const categories = [...new Set(leaves.map(t => t.category))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'fr'));
            $('explorerCategory').innerHTML = '<option value="">Toutes les catégories</option>' + categories.map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
            $('explorerCategory').value = filters.category;
            renderCategoryPills();
            $('explorerRequestFilters').hidden = mode !== 'annonces';
            $('explorerAreaLabel').hidden = mode !== 'annonces';
            $('explorerProfileGeography').hidden = mode !== 'lyanneurs';
            $('explorerSavedArea').hidden = mode !== 'annonces' || !savedArea;
            // A refresh must not discard a territory the reader has chosen but not applied yet.
            if (!$('explorerFilters')?.open) {
                $('explorerService').innerHTML = '<option value="">Tous les services</option>' + leaves.filter(t => !filters.category || t.category === filters.category).map(t => `<option value="${escape(t.id)}">${escape(t.category)} — ${escape(t.subcategory)}</option>`).join('');
                $('explorerService').value = filters.service;
                for (const key of ['area','urgency','budget']) $('explorer' + key[0].toUpperCase() + key.slice(1)).value = filters[key];
                $('explorerTerritory').innerHTML = '<option value="">Tous les territoires</option>' + territories().map(t => `<option value="${escape(t)}">${escape(t.replace(/\s*\(\d+\)/, '').replace('La Réunion', 'Réunion'))}</option>`).join('');
                $('explorerTerritory').value = filters.territory;
                syncCommunes(filters.territory, filters.commune);
            }
            const chips = [];
            const territoryName = value => String(value || '').replace(/\s*\(\d+\)/, '').replace('La Réunion', 'Réunion');
            for (const key of ['query','service','area','territory','commune','urgency','budget']) {
                if (!filters[key] || mode === 'lyanneurs' && ['area','urgency','budget'].includes(key) || mode === 'annonces' && key === 'commune') continue;
                const label = key === 'service' ? leaves.find(t => t.id === filters.service)?.subcategory : key === 'budget' ? `Budget ≤ ${filters.budget} €` : key === 'urgency' ? dateModeLabel(filters[key]) : key === 'territory' ? territoryName(filters[key]) : filters[key];
                chips.push(`<button data-remove="${key}" aria-label="Retirer le filtre ${escape(label)}">${escape(label)} ×</button>`);
            }
            // Métier V2 : famille, métier et spécialité sont portés par la barre compacte (renderTaxoBar), pas par des pastilles.
            // Territoire rapide, à côté de la recherche
            const quick = $('explorerTerritoryQuick');
            if (quick) {
                quick.innerHTML = '<option value="">Tous les territoires</option>' + territories().map(t => `<option value="${escape(t)}">${escape(territoryName(t))}</option>`).join('');
                quick.value = filters.territory;
            }
            $('explorerActiveFilters').innerHTML = chips.join('');
            const filterIcon = $('explorerFiltersIcon');
            if (filterIcon) {
                const active = Boolean(filters.service || filters.urgency || filters.budget || (mode === 'annonces' ? filters.area : filters.commune));
                filterIcon.classList.toggle('has-active-filters', active);
                filterIcon.hidden = false;
            }
        }
        // Familles de métiers V2 : huit pastilles rondes, puis un panneau « métiers » (et spécialités) sous la famille choisie.
        // La carte utilise les mêmes huit familles. Les codes viennent du référentiel lu en base.
        let refineOpen = false;
        let refineTrigger = null;
        let lastResultCount = null;
        const legacyFamilyForRow = (row, list) => {
            const api = mapFamiliesApi();
            if (!api) return '';
            const category = String(row?.category || '').trim();
            if (mode === 'annonces' || row?.taxonomy_id || (category && category.toLowerCase() !== 'general')) return api.familyForRow(row, list);
            return api.familyForCategory(row?.title);
        };
        const v2Ctx = () => ({ index: v2Index, leaves, legacyFamilyForRow });
        const taxonomyFilter = () => ({ family: filters.family, groups: filters.groups ? filters.groups.split(',') : [], job: filters.job, specialty: filters.specialty });
        const taxonomyActive = () => Boolean(filters.family || filters.groups || filters.job || filters.specialty);
        const recordRows = record => (mode === 'annonces' ? [record] : (record.services || []));
        const recordMatchesTaxonomy = (record, filter = taxonomyFilter()) => recordRows(record).some(row => V2().rowMatches(row, filter, v2Ctx()));
        const nodeLabel = code => v2Index?.byCode.get(code)?.label_fr || '';
        const groupsLabel = () => {
            const wanted = (filters.groups || '').split(',').filter(Boolean).sort().join(',');
            const tile = V2().TILES.find(t => t.family === filters.family && t.groups && [...t.groups].sort().join(',') === wanted);
            if (tile) return tile.label;
            return (v2Index?.families[filters.family]?.groups || []).filter(g => wanted.split(',').includes(g.code)).map(g => g.label).filter(Boolean).join(' · ');
        };
        function renderCategoryPills() {
            const host = $('explorerCategoryPills');
            if (!host || !V2()) return;
            // Le focus clavier survit au rendu : on le rend à la famille qui l'avait.
            const focused = host.contains(document.activeElement) ? document.activeElement.dataset.family : null;
            host.innerHTML = V2().FAMILIES.map(f => {
                const active = filters.family === f.code;
                return `<button type="button" class="lyann-family${active ? ' is-active' : ''}" data-family="${escape(f.code)}" aria-pressed="${active ? 'true' : 'false'}">`
                    + `<span class="lyann-family-disc">${V2().iconSvg(f.icon, 'lyann-family-icon')}</span><span class="lyann-family-label">${escape(f.short)}</span></button>`;
            }).join('');
            if (focused) host.querySelector(`[data-family="${focused}"]`)?.focus({ preventScroll: true });
            // Mobile : la rangée défile ; la famille choisie reste visible (rien à faire quand la grille tient en largeur).
            const activeTile = host.querySelector('.lyann-family.is-active');
            if (activeTile && host.scrollWidth > host.clientWidth + 1) {
                const left = activeTile.offsetLeft - (host.clientWidth - activeTile.offsetWidth) / 2;
                host.scrollLeft = Math.max(0, left);
            }
            renderTaxoBar();
            renderRefine();
        }
        // Métiers et spécialités d'une famille (limités aux sous-groupes d'une entrée de Découvrir) ; null si la famille n'a pas de métiers (« Autres »).
        function familyScope() {
            const family = v2Index?.families[filters.family];
            if (!family || !family.trades) return null;
            const allowed = new Set(taxonomyFilter().groups);
            const groups = family.groups.filter(g => !allowed.size || allowed.has(g.code));
            return { family, groups, total: groups.reduce((n, g) => n + g.trades.length, 0) };
        }
        const taxoName = () => groupsLabel() || V2()?.familyMeta(filters.family)?.short || (filters.family === 'autres' ? 'Autres besoins' : 'Métiers');
        // Barre compacte : famille, métier choisi, puis le nombre de résultats. Pas le nombre de métiers du référentiel.
        function renderTaxoBar() {
            const bar = $('explorerTaxoBar');
            if (!bar) return;
            if (!taxonomyActive() || !V2()) { bar.hidden = true; closeRefine({ restoreFocus: false }); return; }
            const scope = familyScope();
            let detail = '';
            if (filters.specialty) detail = [nodeLabel(filters.job), nodeLabel(filters.specialty)].filter(Boolean).join(' › ');
            else if (filters.job) detail = nodeLabel(filters.job);
            else if (lastResultCount != null) {
                const noun = mode === 'annonces' ? (lastResultCount > 1 ? 'annonces' : 'annonce') : (lastResultCount > 1 ? 'Lyanneurs' : 'Lyanneur');
                detail = `${lastResultCount} ${noun}`;
            }
            bar.querySelector('.explorer-taxo-label').innerHTML = `<strong>${escape(taxoName())}</strong>${detail ? `<span class="sep" aria-hidden="true">&nbsp;·&nbsp;</span><span>${escape(detail)}</span>` : ''}`;
            $('explorerRefineBtn').hidden = !scope;
            bar.hidden = false;
        }
        // Panneau « Affiner » : feuille basse sur mobile, popover ancré à la barre sur ordinateur. Les résultats restent derrière ; un appui sur un métier
        // ou une spécialité est l'action explicite qui change le filtre (rien n'est choisi automatiquement).
        function renderRefine() {
            const host = $('explorerRefine');
            if (!host || !refineOpen) return;
            const scope = familyScope();
            if (!scope) { closeRefine({ restoreFocus: false }); return; }
            const body = $('explorerRefineBody');
            const scrollTop = body.scrollTop;
            const focusedKey = body.contains(document.activeElement)
                ? (document.activeElement.dataset.job !== undefined ? `[data-job="${document.activeElement.dataset.job}"]` : document.activeElement.dataset.specialty !== undefined ? `[data-specialty="${document.activeElement.dataset.specialty}"]` : '') : '';
            // Comptes calculés sur les mêmes résultats que la liste, hors critères de métier. Un profil compte une fois par métier.
            const base = repo.discover(records, leaves, { ...filters, family: '', groups: '', job: '', specialty: '' }, mode)
                .filter(record => recordMatchesTaxonomy(record, { family: filters.family, groups: taxonomyFilter().groups, job: '', specialty: '' }));
            const counts = {};
            base.forEach(record => {
                const seen = new Set();
                recordRows(record).forEach(row => {
                    const node = v2Index?.byCode.get(V2().nodeCodeOf(row, leaves));
                    if (!node) return;
                    const trade = V2().tradeOfNode(node);
                    if (trade && !seen.has(trade)) { counts[trade] = (counts[trade] || 0) + 1; seen.add(trade); }
                    if (node.kind === 'specialty' && !seen.has(node.code)) { counts[node.code] = (counts[node.code] || 0) + 1; seen.add(node.code); }
                });
            });
            const chip = (attrs, label, active, count) => `<button type="button" class="explorer-job-chip${active ? ' is-active' : ''}${!active && !count ? ' is-empty' : ''}" ${attrs} aria-pressed="${active ? 'true' : 'false'}"><span>${escape(label)}</span>${count ? `<span class="explorer-job-count">${count}</span>` : ''}</button>`;
            $('explorerRefineTitle').textContent = `Affiner · ${taxoName()}`;
            body.innerHTML = scope.groups.map(group => {
                if (!group.trades.length) return '';
                const selected = group.trades.find(t => t.code === filters.job);
                const specialties = selected && selected.specialties.length
                    ? `<div class="explorer-job-specialties" role="group" aria-label="Spécialités : ${escape(selected.label)}">${selected.specialties.map(sp => chip(`data-specialty="${escape(sp.code)}"`, sp.label, filters.specialty === sp.code, counts[sp.code] || 0)).join('')}</div>` : '';
                return `<section class="explorer-job-group">${group.label ? `<h3 class="explorer-job-group-title">${escape(group.label)}</h3>` : ''}<div class="explorer-job-chips">${group.trades.map(t => chip(`data-job="${escape(t.code)}"`, t.label, filters.job === t.code, counts[t.code] || 0)).join('')}</div>${specialties}</section>`;
            }).join('') || '<p class="explorer-job-empty">Aucun métier de cette famille n\'est encore proposé ici.</p>';
            body.scrollTop = scrollTop;
            if (focusedKey) body.querySelector(focusedKey)?.focus({ preventScroll: true });
            syncRefineFooter();
        }
        function syncRefineFooter() {
            const btn = $('explorerRefineDone');
            if (!btn) return;
            const n = lastResultCount;
            const noun = mode === 'annonces' ? 'annonce' : 'Lyanneur';
            btn.textContent = n === null ? 'Voir les résultats' : n === 0 ? 'Aucun résultat pour l\'instant' : `Voir ${n} ${noun}${n > 1 ? 's' : ''}`;
        }
        const refineSheetMode = () => Boolean(window.matchMedia?.('(max-width: 899.98px)').matches);
        function openRefine(trigger) {
            const host = $('explorerRefine');
            if (!host || !familyScope()) return;
            refineOpen = true;
            refineTrigger = trigger || $('explorerRefineBtn');
            host.classList.remove('is-expanded');
            host.style.transform = '';
            host.hidden = false;
            host.setAttribute('aria-modal', refineSheetMode() ? 'true' : 'false');
            $('explorerRefineBackdrop').hidden = !refineSheetMode();
            $('explorerRefineBtn').setAttribute('aria-expanded', 'true');
            renderRefine();
            void host.offsetWidth;
            host.classList.add('is-open');
            host.querySelector('[data-action="refine-close"]')?.focus({ preventScroll: true });
        }
        function closeRefine({ restoreFocus = true } = {}) {
            const host = $('explorerRefine');
            if (!host || !refineOpen) return;
            refineOpen = false;
            host.classList.remove('is-open', 'is-expanded');
            host.style.transform = '';
            $('explorerRefineBackdrop').hidden = true;
            $('explorerRefineBtn')?.setAttribute('aria-expanded', 'false');
            const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (calm) host.hidden = true; else setTimeout(() => { if (!refineOpen) host.hidden = true; }, 260);
            if (restoreFocus) (refineTrigger && !refineTrigger.hidden ? refineTrigger : document.querySelector('#explorerCategoryPills button'))?.focus?.({ preventScroll: true });
        }
        function clearTaxonomy() { filters.family = ''; filters.groups = ''; filters.job = ''; filters.specialty = ''; }
        // Choisir une famille l'active et filtre tout de suite les résultats ; aucun panneau ne s'ouvre. Rappuyer sur la famille active la désactive.
        function chooseFamily(code) {
            const same = filters.family === code && !filters.groups;
            clearTaxonomy();
            if (!same) { filters.family = code; filters.category = ''; filters.service = ''; }
            mapFamilyFilter = filters.family ? [filters.family] : null;
            render({ quiet: true });
        }
        function chooseJob(code) {
            filters.job = filters.job === code ? '' : code;
            filters.specialty = '';
            render({ quiet: true });
        }
        function chooseSpecialty(code) {
            filters.specialty = filters.specialty === code ? '' : code;
            render({ quiet: true });
        }
        const cleanTerritory = value => window.LyanAI.normalizeText(String(value || '').replace(/\s*\(\d+\)/g, ''));
        function annonceInTerritory(record) {
            const wanted = cleanTerritory(filters.territory);
            const geo = inferGeography(record.location);
            if (geo.territory) return cleanTerritory(geo.territory) === wanted;
            return cleanTerritory(record.location).includes(wanted);
        }
        function render(options = {}) {
            syncControls();
            syncUrl();
            applyMapViewLayout();
            // Non-enumerable: read by the Lyanneurs ordering only, never written to the URL or the stored filters.
            Object.defineProperty(filters, 'viewerTerritory', { value: viewerTerritory, enumerable: false, writable: true, configurable: true });
            let results = repo.discover(records, leaves, filters, mode);
            if (taxonomyActive()) results = results.filter(record => recordMatchesTaxonomy(record));
            const queryMatch = filters.query && v2Index ? V2().matchQuery(v2Index, filters.query) : null;
            if (queryMatch && queryMatch.level !== 'none' && queryMatch.level !== 'text') {
                results = results.filter(record => V2().rowMatchesQuery(recordRows(record), queryMatch, v2Ctx(), [record.name, record.title, record.description, record.bio].filter(Boolean).join(' ')));
            }
            if (mode === 'annonces' && filters.territory) results = results.filter(annonceInTerritory);
            const stamped = mode === 'annonces' ? results.map(row => {
                const family = v2Index ? V2().familyOf(row, v2Ctx()) : '';
                return family ? Object.assign({}, row, { _v2Family: family }) : row;
            }) : results;
            if (mode === 'annonces' && mapFamiliesActive()) results = rowsForMapFamilies(stamped);
            const mapScoped = mode === 'annonces' ? (mapFamiliesActive() ? results : stamped) : results;
            const countLabel = mode === 'annonces'
                ? (mapScoped.length <= 1 ? 'annonce' : 'annonces')
                : (results.length <= 1 ? 'Lyanneur' : 'Lyanneurs');
            const displayCount = mode === 'annonces' && mapAvailable() ? mapScoped.length : results.length;
            lastResultCount = displayCount;
            syncRefineFooter();
            renderTaxoBar();
            $('explorerSummary').textContent = `${displayCount} ${countLabel} · ${(mode === 'annonces' ? filters.area : [filters.commune, filters.territory].filter(Boolean).join(' · ')) || 'Tous les lieux'}`;
            $('explorerRanking').textContent = queryMatch && queryMatch.question
                ? queryMatch.question
                : (mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.');
            const container = $('explorerResults');
            window.LYANN_SKELETON?.clear(container);
            if (mapAvailable()) {
                // Same filtered, already-authorised results as the list: the map never widens them.
                setSurface(true);
                container.replaceChildren();
                ensureNeedsMap().update({
                    rows: mapScoped,
                    leaves,
                    area: filters.area,
                    reframe: options.reframe === true,
                    mapFamilyFilter: mapFamilyFilter || undefined,
                    categorySheetOpen: mapCategorySheetOpen
                });
                if (revealMap && !document.body.classList.contains('explorer-annonces-map-view')) {
                    revealMap = false;
                    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
                    requestAnimationFrame(() => $('explorerMap')?.scrollIntoView({
                        block: 'start',
                        behavior: calm ? 'auto' : 'smooth'
                    }));
                } else if (revealMap) {
                    revealMap = false;
                }
                return;
            }
            setSurface(false);
            container.dataset.state = results.length ? 'SUCCESS' : 'EMPTY';
            if (!results.length) {
                container.innerHTML = `<div class="explorer-state"><h2>${mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.'}</h2><p>Essayez un autre service ou élargissez votre zone.</p><button class="btn btn-outline" data-action="reset">Modifier les filtres</button>${(mode === 'annonces' ? filters.area : filters.territory) ? `<button class="btn btn-outline" data-remove="${mode === 'annonces' ? 'area' : 'territory'}">Élargir la zone</button>` : ''}${mode === 'annonces' ? '<button class="btn btn-primary explorer-publish"><i class="ph ph-plus" aria-hidden="true"></i> Publier une annonce</button>' : ''}</div>`;
            } else {
                const cards = results.map(record => (mode === 'annonces' ? requestCard(record) : profileCard(record)));
                container.innerHTML = cards.join('');
            }
            window.syncFavoriteButtonStates?.();
        }
        async function search(force = false, quiet = false) {
            const token = ++revision;
            const areaChanged = filters.area !== lastSearchArea;
            if (!quiet) lastSearchArea = filters.area;
            syncControls();
            $('explorerResults').setAttribute('aria-busy', 'true');
            if (!quiet && mapAvailable()) {
                setSurface(true);
                ensureNeedsMap().setLoading();
                $('explorerSummary').textContent = '';
            } else if (!quiet) {
                setSurface(false);
                $('explorerResults').dataset.state = 'LOADING';
                window.LYANN_SKELETON?.show($('explorerResults'), mode === 'annonces' ? 'annonce' : 'profile', 4);
                $('explorerSummary').textContent = '';
                $('explorerRanking').textContent = mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.';
            }
            try {
                await window.LYANN_AUTH_STATE?.ready?.();
                const [data, taxonomy, index] = await Promise.all([mode === 'annonces' ? repo.loadRequests({force}) : repo.load({force}), repo.taxonomy(force), V2().load(window.LYANN_API_CLIENT?.supabase, force)]);
                if (token !== revision) return;
                records = data; leaves = taxonomy; v2Index = index;
                if (mode === 'annonces') $('explorerUrgency').innerHTML = '<option value="">Tous les délais</option>' + [...new Set(data.map(r => format()?.dateMode(r)).filter(Boolean))].map(u => `<option value="${escape(u)}">${escape(dateModeLabel(u))}</option>`).join('');
                render({ quiet, reframe: !quiet && areaChanged });
            } catch (error) {
                if (token !== revision) return;
                // A failed load is reported by the list surface, with its retry button.
                destroyNeedsMap();
                setSurface(false);
                window.LYANN_SKELETON?.clear($('explorerResults'));
                $('explorerResults').dataset.state = 'ERROR';
                $('explorerResults').innerHTML = '<div class="explorer-state" role="alert"><h2>Impossible de charger les résultats.</h2><p>La recherche est momentanément indisponible. Réessayez dans un instant.</p><button class="btn btn-primary" data-action="retry">Réessayer</button></div>';
                $('explorerSummary').textContent = 'Recherche indisponible';
                console.warn('[Explorer] Discovery failed', error);
            } finally {
                if (token === revision) $('explorerResults').setAttribute('aria-busy', 'false');
            }
        }
        function reset() {
            filters = {query:'',category:'',service:'',area:'',territory:'',commune:'',urgency:'',budget:'',family:'',groups:'',job:'',specialty:''};
            closeRefine({ restoreFocus: false });
            mapFamilyFilter = null;
            mapFamilyDraft = null;
            closeMapCategorySheet();
            search();
        }
        root.addEventListener('click', event => {
            const profileCard = event.target.closest('.explorer-profile-card');
            if (profileCard && !event.target.closest('button, a, input, select, textarea')) {
                const memberId = profileCard.dataset.memberId;
                if (memberId) window.openPublicMemberProfile?.(memberId);
                return;
            }
            const button = event.target.closest('button');
            if (!button) return;
            if (button.classList.contains('lyann-family')) { chooseFamily(button.dataset.family); return; }
            if (button.dataset.job !== undefined) { chooseJob(button.dataset.job); return; }
            if (button.dataset.specialty !== undefined) { chooseSpecialty(button.dataset.specialty); return; }
            if (button.dataset.action === 'taxo-refine') { refineOpen ? closeRefine() : openRefine(button); return; }
            if (button.dataset.action === 'refine-close') { closeRefine(); return; }
            if (button.dataset.action === 'refine-expand') {
                const expanded = $('explorerRefine').classList.toggle('is-expanded');
                button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
                button.setAttribute('aria-label', expanded ? 'Réduire le panneau' : 'Agrandir le panneau');
                return;
            }
            if (button.dataset.action === 'taxo-reset') {
                closeRefine({ restoreFocus: false });
                clearTaxonomy();
                render({ quiet: true });
                document.querySelector('#explorerCategoryPills button')?.focus({ preventScroll: true });
                return;
            }
            if (button.dataset.view && button.closest('#explorerViewToggle')) { setView(button.dataset.view); return; }
            if (button.dataset.mode) {
                const nextMode = button.dataset.mode;
                if (nextMode !== mode && (nextMode === 'annonces' || nextMode === 'lyanneurs')) {
                    syncUrl();
                    const carried = { territory: filters.territory, commune: filters.commune, area: filters.area };
                    if (mode === 'annonces' && nextMode !== 'annonces') {
                        destroyNeedsMap();
                        view = 'list';
                        applyMapViewLayout();
                    }
                    mode = nextMode;
                    let saved = null;
                    try { saved = JSON.parse(sessionStorage.getItem('lyann-explorer-filters:' + mode) || 'null'); } catch (_) {}
                    filters = V2().filtersAcrossModes(carried, saved);
                    mapFamilyFilter = filters.family ? [filters.family] : null;
                    closeRefine({ restoreFocus: false });
                    search();
                }
                return;
            }
            if (button.dataset.remove) {
                filters[button.dataset.remove] = '';
                if (button.dataset.remove === 'territory') filters.commune = '';
                if (button.dataset.remove === 'category') filters.service = '';
                if (['groups', 'family'].includes(button.dataset.remove)) clearTaxonomy();
                if (button.dataset.remove === 'job') filters.specialty = '';
                if (['groups', 'family', 'job', 'specialty'].includes(button.dataset.remove)) { render({ quiet: true }); return; }
                search(); return;
            }
            if (button.classList.contains('explorer-publish')) { window.openLyannWizard(filters.query); return; }
            const row = records.find(r => r.id === button.dataset.id);
            switch (button.dataset.action) {
                case 'retry': search(true); break;
                case 'reset': reset(); break;
                case 'refine':
                    syncControls();
                    $('explorerFilters').showModal();
                    $('explorerSearchInput')?.focus();
                    break;
                case 'detail': if (row) window.openLyannDetailModal(row.id, row); break;
                case 'profile':
                    if (button.dataset.id) window.openPublicMemberProfile?.(button.dataset.id);
                    else window.LYANN_ROUTER.requireAuthForInteraction('requestAuthor', {requestId: button.closest('[data-request-id]')?.dataset.requestId});
                    break;
                // origin: 'explorer' sends the back arrow to the list the member
                // came from instead of the inbox.
                case 'contact': if (row) window.LYANN_ROUTER.go('messages', {contactId:row.id, name:row.name, direct:true, origin:'explorer'}); break;
                case 'help':
                    if (row && row.status === 'OPEN' && (!currentUserId() || row.requester_id !== currentUserId())) {
                        window.LYANN_ROUTER.go('messages', { contactId: row.requester_id, requestId: row.id, origin: 'explorer',
                            name: name(row.profiles), initialNeed: {requestId:row.id, requesterId:row.requester_id, helperId:currentUserId(), title:row.title} });
                    }
                    break;
            }
        });
        $('explorerSearchInput').addEventListener('input', () => { filters.query = $('explorerSearchInput').value; });
        $('explorerSearchForm').addEventListener('submit', event => {
            event.preventDefault();
            filters.query = $('explorerSearchInput').value.trim();
            $('explorerFilters')?.close();
            search();
        });
        $('explorerCategory').addEventListener('change', () => { filters.category = $('explorerCategory').value; filters.family = ''; filters.service = ''; search(); });
        // Panneau Affiner : fermeture (Échap, fond, clic extérieur sur ordinateur), piège de focus en feuille, glissé vers le bas pour fermer / vers le haut pour agrandir.
        $('explorerRefineBackdrop')?.addEventListener('click', () => closeRefine());
        document.addEventListener('keydown', event => {
            if (!refineOpen) return;
            const host = $('explorerRefine');
            if (event.key === 'Escape') { event.preventDefault(); closeRefine(); return; }
            if (event.key !== 'Tab' || !refineSheetMode()) return;
            const items = [...host.querySelectorAll('button:not([hidden]):not([disabled])')].filter(el => el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === host)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        });
        document.addEventListener('click', event => {
            if (!refineOpen || refineSheetMode()) return;
            // composedPath : le chemin est figé à l'envoi, même si un rendu a retiré la cible du DOM entre-temps.
            if (event.composedPath().some(node => node.id === 'explorerRefine' || node.id === 'explorerTaxoBar')) return;
            closeRefine({ restoreFocus: false });
        });
        (() => {
            const host = $('explorerRefine');
            let drag = null;
            if (!host) return;
            host.addEventListener('pointerdown', event => {
                if (!refineSheetMode() || event.target.closest('button') || !event.target.closest('.explorer-refine-grab, .explorer-refine-head')) return;
                drag = { y: event.clientY, t: Date.now(), dy: 0 };
                host.setPointerCapture?.(event.pointerId);
                host.style.transition = 'none';
            });
            host.addEventListener('pointermove', event => {
                if (!drag) return;
                drag.dy = event.clientY - drag.y;
                if (drag.dy > 0) host.style.transform = `translateY(${drag.dy}px)`;
            });
            const end = () => {
                if (!drag) return;
                const { dy, t } = drag;
                drag = null;
                host.style.transition = '';
                const speed = dy / Math.max(1, Date.now() - t);
                if (dy > 90 || (dy > 30 && speed > 0.6)) closeRefine();
                else if (dy < -50) {
                    host.style.transform = '';
                    host.classList.add('is-expanded');
                    host.querySelector('[data-action="refine-expand"]')?.setAttribute('aria-pressed', 'true');
                } else host.style.transform = '';
            };
            host.addEventListener('pointerup', end);
            host.addEventListener('pointercancel', end);
        })();
        const openFilters = () => { syncControls(); $('explorerFilters').showModal(); };
        $('explorerFiltersButton').addEventListener('click', openFilters);
        $('explorerFiltersIcon')?.addEventListener('click', openFilters);
        $('explorerFiltersClose').addEventListener('click', () => $('explorerFilters').close());
        const readFilterSheet = () => {
            const keys = mode === 'annonces' ? ['service','area','urgency','budget'] : ['service','territory','commune'];
            for (const key of keys) filters[key] = $('explorer' + key[0].toUpperCase() + key.slice(1)).value.trim();
        };
        // Read the sheet on click, before the dialog closes and can restore the
        // values from when it opened. Otherwise the applied territory is stale.
        document.querySelector('#explorerFilterForm button[value="apply"]')?.addEventListener('click', readFilterSheet, true);
        $('explorerFilterForm').addEventListener('submit', event => {
            event.preventDefault();
            if (event.submitter?.value === 'apply') {
                readFilterSheet();
                search();
            }
            $('explorerFilters').close();
        });
        $('explorerFilters').addEventListener('click', event => { if (event.target === $('explorerFilters')) $('explorerFilters').close(); });
        $('explorerReset').addEventListener('click', () => { $('explorerFilters').close(); reset(); });
        $('explorerTerritoryQuick')?.addEventListener('change', () => {
            filters.territory = $('explorerTerritoryQuick').value;
            filters.commune = '';
            render({ quiet: true, reframe: true });
        });
        $('explorerMapCategoryGrid')?.addEventListener('click', onMapCategoryGridClick);
        $('explorerMapCategoryClose')?.addEventListener('click', closeMapCategorySheet);
        $('explorerMapCategoryApply')?.addEventListener('click', applyMapCategoryFilter);
        $('explorerMapCategoryClear')?.addEventListener('click', clearMapCategoryFilter);
        $('explorerMapCategorySheet')?.addEventListener('click', (event) => {
            if (event.target === $('explorerMapCategorySheet')) closeMapCategorySheet();
        });
        $('explorerMapCategorySheet')?.addEventListener('close', () => {
            mapCategorySheetOpen = false;
            document.body.classList.remove('explorer-map-category-sheet-open');
            render({ quiet: true });
        });
        $('explorerSavedArea').addEventListener('click', () => {
            if (!savedArea) return;
            filters.area = savedArea;
            search();
        });
        window.addEventListener('lyann_request_created', () => { mode = 'annonces'; search(true); });
        document.addEventListener('click', event => {
            const link = event.target.closest && event.target.closest('[data-explorer-nav]');
            if (!link) return;
            const nextMode = link.getAttribute('data-explorer-nav');
            if (nextMode !== 'annonces' && nextMode !== 'lyanneurs' || nextMode === mode) return;
            syncUrl();
            let saved = null;
            try { saved = JSON.parse(sessionStorage.getItem('lyann-explorer-filters:' + nextMode) || 'null'); } catch (_) {}
            try {
                sessionStorage.setItem('lyann-explorer-filters:' + nextMode, JSON.stringify(V2().filtersAcrossModes({
                    territory: filters.territory, commune: filters.commune, area: filters.area
                }, saved)));
            } catch (_) {}
        }, true);
        window.addEventListener('pageshow', event => { if (event.persisted) search(true); });
        // Leaving the page (tab, back swipe, app switch into the page cache) always releases the Carte lock;
        // a restored page re-applies it from its own state through search() above.
        window.addEventListener('pagehide', () => {
            document.body.classList.remove('explorer-annonces-map-view', 'explorer-map-category-sheet-open');
        });
        async function refreshSavedArea(id) {
            savedArea = '';
            viewerTerritory = '';
            $('explorerSavedArea').hidden = true;
            if (!id) return;
            try {
                const { data, error } = await window.LYANN_API_CLIENT.getProfile(id);
                if (id !== currentUserId()) return;
                if (!error) {
                    savedArea = data?.city || data?.territory || '';
                    viewerTerritory = data?.territory || '';
                    // The commune already collected by the profile gives a distance
                    // reference without ever prompting for device location.
                    window.LYANN_GEO?.setViewerLocation(data?.city, data?.territory);
                }
                $('explorerSavedArea').hidden = !savedArea;
            } catch (_) { /* Optional saved location must not block public discovery. */ }
        }
        (async () => {
            await window.LYANN_AUTH_STATE?.ready?.();
            let identity = currentUserId() || null;
            window.LYANN_AUTH_STATE?.subscribe(state => {
                if (state.status !== 'ready' || state.userId === identity) return;
                identity = state.userId;
                refreshSavedArea(identity);
                search(true);
            }, {immediate:false});
            if (!params.has('territory') && !params.has('commune') && filters.area) Object.assign(filters, inferGeography(filters.area));
            await refreshSavedArea(identity);
            await search();
            if (params.get('openLyann')) {
                const request = records.find(r => r.id === params.get('openLyann'));
                if (mode === 'annonces' && request) window.openLyannDetailModal(request.id, request);
            }
        })();
        if (window.LYANN_PULL_TO_REFRESH) {
            window.LYANN_PULL_TO_REFRESH.attach(document, () => {
                const box = $('explorerResults');
                if (box && box.getAttribute('aria-busy') === 'true') return;
                return search(true, true);
            });
        }
        window.LYANN_EXPLORER = { refresh: () => search(true) };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
