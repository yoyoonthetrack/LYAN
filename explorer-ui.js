(() => {
    'use strict';
    function init() {
        const root = document.getElementById('explorer');
        if (!root) return;
        const $ = id => document.getElementById(id);
        const repo = window.LYANN_EXPLORER_REPOSITORY;
        const escape = value => window.escapeHtmlAttr(String(value ?? ''));
        const params = new URLSearchParams(location.search);
        let mode = params.get('mode') === 'annonces' ? 'annonces' : 'lyanneurs';
        let filters = { query: params.get('query') || params.get('searchInput') || '',
            category: params.get('category') || '', service: params.get('service') || '',
            area: params.get('area') ?? params.get('citySelect') ?? params.get('locationSelect') ?? '',
            territory: params.get('territory') || '', commune: params.get('commune') || '', urgency: params.get('urgency') || '', budget: params.get('budget') || '' };
        const explicitFilter = ['query','searchInput','category','service','area','citySelect','locationSelect','territory','commune','urgency','budget'].some(key => params.has(key));
        if (!explicitFilter) {
            try {
                const saved = JSON.parse(sessionStorage.getItem('lyann-explorer-filters:' + mode) || 'null');
                if (saved && typeof saved === 'object') {
                    filters = {
                        query: saved.query || '', category: saved.category || '', service: saved.service || '',
                        area: saved.area || '', territory: saved.territory || '', commune: saved.commune || '',
                        urgency: saved.urgency || '', budget: saved.budget || ''
                    };
                }
            } catch (_) {}
        }
        // "Liste / Carte" only exists for annonces; the same filters feed both.
        let view = params.get('view') === 'map' ? 'map' : 'list';
        let needsMap = null;
        let revealMap = view === 'map';
        let leaves = [], records = [], revision = 0, savedArea = '';
        let showAllTrades = false;
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
                <h2 class="explorer-annonce-title">${escape(format()?.shortTitle(r.title) || r.title)}</h2>
                <ul class="explorer-annonce-facts">
                    ${annonceFact('ph-map-pin', 'Lieu', placeText(r), distanceKnown ? 'Distance approximative entre communes' : '', 'explorer-fact-location')}
                    ${annonceFact('ph-currency-eur', 'Prix', format()?.priceLabel(r), '', 'explorer-fact-price')}
                    ${annonceFact('ph-calendar-blank', 'Date', format()?.dateLabel(r), '', 'explorer-fact-date')}
                </ul>
                <div class="explorer-person explorer-person-zone explorer-annonce-author">${profileZoneTrigger(r.requester_id || r.profiles?.id, authorName)}<img src="${avatar(r.profiles)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)"><span class="explorer-person-name">${escape(authorName)}${own ? ' · Votre annonce' : ''}</span>${badge ? `<span class="explorer-person-badge"><i class="ph-fill ph-seal-check" aria-hidden="true"></i>${escape(badge)}</span>` : ''}${rating ? `<span class="explorer-person-rating"><i class="ph-fill ph-star" aria-hidden="true"></i><span class="sr-only">Note : </span>${escape(rating)}</span>` : ''}</div>
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

        function profileCard(p, showType = false) {
            const displayName = formatDisplayName(p);
            const place = window.formatProfileLocation
                ? window.formatProfileLocation(p.city, p.territory)
                : ([p.city, p.territory].filter(Boolean).join(' · ') || 'Guadeloupe');
            const badgeText = window.LYANN_SUPABASE_LOCK === 'tdktfbtqceldlaeqjtow' ? (window.LYANN_PLANS?.badgeLabel(p) || '') : p.badge || (p.is_pro_verified ? 'PRO VÉRIFIÉ' : (p.is_verified || p.kyc_verified ? 'PROFIL VÉRIFIÉ' : ''));
            const rawSkills = Array.isArray(p.skills) && p.skills.length ? p.skills : (Array.isArray(p.intervention_zone) && p.intervention_zone.length ? p.intervention_zone : (p.services || []).map(s => s.title || s.name).filter(Boolean));
            const primarySkill = rawSkills[0] || '';
            const secondarySkills = rawSkills.slice(1, 3);
            const skillsSnippet = rawSkills.slice(0, 3).join(' · ');
            const bioPlain = formatBioQuote(p, skillsSnippet).replace(/^«\s*|\s*»$/g, '').trim();
            const radiusLine = formatRadiusText(p);
            const seed = getSeedProfileMetadata(p);
            const ratingSource = {
                ...p,
                average_rating: seed?.rating ?? p.average_rating ?? p.rating ?? p.avg_rating,
                reviews_count: seed?.reviews_count ?? p.reviews_count ?? p.reviewsCount
            };
            const ratingLabel = format()?.ratingLabel(ratingSource);
            const speed = seed?.response_speed || p.response_speed || p.response_rate_text || '';
            const isSelf = p.id === currentUserId();

            return `<article class="explorer-card explorer-profile-card" data-member-id="${escape(p.id)}">
                ${showType ? typePill('profile') : ''}
                <div class="explorer-card-top explorer-profile-head">
                    <div class="explorer-person explorer-person-zone explorer-profile-identity">
                        ${profileZoneTrigger(p.id, displayName)}
                        <img class="explorer-profile-avatar" src="${avatar(p)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)">
                        <div class="explorer-profile-id-text">
                            <h2 class="explorer-profile-name">${escape(displayName)}</h2>
                            ${badgeText ? `<span class="explorer-profile-verified">${escape(badgeText)}</span>` : ''}
                        </div>
                    </div>
                    ${favorite('PROFILE', p.id)}
                </div>
                ${primarySkill ? `<p class="explorer-skills-text explorer-profile-primary-skill">${escape(primarySkill)}</p>` : ''}
                <p class="explorer-profile-place"><i class="ph ph-map-pin" aria-hidden="true"></i><span>${escape(place)}</span></p>
                ${secondarySkills.length ? `<ul class="explorer-profile-secondary-skills" aria-label="Autres compétences">${secondarySkills.map((skill) => `<li>${escape(skill)}</li>`).join('')}</ul>` : ''}
                <div class="explorer-profile-stats">
                    ${ratingLabel ? `<span class="explorer-profile-rating"><i class="ph-fill ph-star" aria-hidden="true"></i><span class="sr-only">Note : </span>${escape(ratingLabel)}</span>` : '<span class="explorer-profile-rating is-new">Nouveau sur LYANN</span>'}
                    ${speed ? `<span class="explorer-profile-speed">${escape(speed)}</span>` : ''}
                </div>
                ${bioPlain ? `<p class="explorer-quote-text explorer-profile-bio explorer-card-description">${escape(bioPlain)}</p>` : ''}
                <p class="explorer-profile-radius">${escape(radiusLine)}</p>
                <div class="explorer-card-actions explorer-profile-actions">
                    ${!isSelf ? `<button class="btn btn-primary explorer-btn-contact" data-action="contact" data-id="${escape(p.id)}">Contacter</button>` : ''}
                </div>
            </article>`;
        }
        const territories = () => Object.keys(window.LYANN_TERRITORY_DATASET || {}).filter(t => /\((971|972|973|974)\)/.test(t));
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
            mapFamilyDraft = mapFamilyFilter ? [...mapFamilyFilter] : [...api.ALL_FAMILY_IDS];
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
            const draft = mapFamilyDraft ?? mapFamilyFilter ?? api.ALL_FAMILY_IDS;
            const allOn = draft.length >= api.FAMILIES.length;
            const toggle = (id) => {
                if (id === '__all__') {
                    mapFamilyDraft = [...api.ALL_FAMILY_IDS];
                    return;
                }
                const set = new Set(draft);
                if (set.has(id)) set.delete(id); else set.add(id);
                mapFamilyDraft = [...set];
                if (mapFamilyDraft.length >= api.FAMILIES.length) mapFamilyDraft = [...api.ALL_FAMILY_IDS];
            };
            const familyIcon = {
                plomberie: 'ph-drop', electricite: 'ph-lightning', bricolage: 'ph-hammer', jardinage: 'ph-plant',
                menage: 'ph-broom', beaute: 'ph-flower', numerique: 'ph-laptop', quotidien: 'ph-calendar-blank'
            };
            host.innerHTML = `<button type="button" class="explorer-map-category-chip${allOn ? ' is-active' : ''}" data-family="__all__" aria-pressed="${allOn ? 'true' : 'false'}">Toutes</button>`
                + api.FAMILIES.map((family) => {
                    const active = !allOn && draft.includes(family.id);
                    const tone = family.tone === 'yellow' ? 'is-tone-yellow' : 'is-tone-green';
                    const icon = familyIcon[family.id] || 'ph-calendar-blank';
                    return `<button type="button" class="explorer-map-category-chip ${tone}${active ? ' is-active' : ''}" data-family="${escape(family.id)}" aria-pressed="${active ? 'true' : 'false'}"><i class="ph ${icon}" aria-hidden="true"></i><span>${escape(family.label)}</span></button>`;
                }).join('');
            host.querySelectorAll('[data-family]').forEach((button) => {
                button.addEventListener('click', () => {
                    toggle(button.dataset.family);
                    renderMapCategoryGrid();
                });
            });
        }
        function applyMapCategoryFilter() {
            const api = mapFamiliesApi();
            if (!api) return;
            const draft = mapFamilyDraft ?? api.ALL_FAMILY_IDS;
            if (!draft.length || draft.length >= api.FAMILIES.length) mapFamilyFilter = null;
            else mapFamilyFilter = [...draft];
            closeMapCategorySheet();
            render({ quiet: true });
        }
        function clearMapCategoryFilter() {
            mapFamilyFilter = null;
            mapFamilyDraft = mapFamiliesApi()?.ALL_FAMILY_IDS ? [...mapFamiliesApi().ALL_FAMILY_IDS] : null;
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
                ? { title: 'Des voisins ont besoin de vous', subtitle: 'Parcourez les demandes des habitants et proposez vos services.', art: 'annonces' }
                : { title: 'Lyanneurs', subtitle: 'Des talents et des pros tout près de chez vous.', art: 'lyanneurs' };
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
            $('explorerSearchInput').placeholder = mode === 'annonces' ? 'Rechercher une mission…' : 'Nom, activité ou commune';
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
            for (const key of ['query','category','service','area','territory','commune','urgency','budget']) {
                if (!filters[key] || mode === 'lyanneurs' && ['area','urgency','budget'].includes(key) || mode === 'annonces' && ['territory','commune'].includes(key)) continue;
                const label = key === 'service' ? leaves.find(t => t.id === filters.service)?.subcategory : key === 'budget' ? `Budget ≤ ${filters.budget} €` : key === 'urgency' ? dateModeLabel(filters[key]) : filters[key];
                chips.push(`<button data-remove="${key}" aria-label="Retirer le filtre ${escape(label)}">${escape(label)} ×</button>`);
            }
            $('explorerActiveFilters').innerHTML = chips.join('');
            const filterIcon = $('explorerFiltersIcon');
            if (filterIcon) {
                const active = chips.length > 0 || Boolean(filters.category || filters.service || filters.urgency || filters.budget);
                filterIcon.classList.toggle('has-active-filters', active);
                filterIcon.hidden = mode !== 'annonces';
            }
        }
        function renderCategoryPills() {
            const host = $('explorerCategoryPills');
            const select = $('explorerCategory');
            if (!host || !select) return;
            const options = [...select.options];
            const selected = options.find((option) => (option.value || '') === (filters.category || ''));
            let visible = options;
            if (mode === 'annonces') {
                visible = options.slice(0, 4);
                if (selected && !visible.includes(selected)) visible = [options[0], selected].filter(Boolean);
            } else if (mode === 'lyanneurs' && !showAllTrades) {
                visible = options.slice(0, 3);
                if (selected && !visible.includes(selected)) visible = [options[0], selected].filter(Boolean);
            }
            const pills = visible.map((option) => {
                const value = option.value || '';
                const label = value ? option.textContent : 'Tout';
                const active = (filters.category || '') === value;
                return `<button type="button" class="lyann-pill${active ? ' is-active' : ''}" data-category="${escape(value)}" aria-pressed="${active ? 'true' : 'false'}">${escape(label)}</button>`;
            }).join('');
            let more = '';
            if (mode === 'annonces') {
                more = '<button type="button" class="lyann-pill lyann-pill-more" data-action="all-categories">Toutes les catégories</button>';
            } else if (mode === 'lyanneurs' && !showAllTrades && options.length > 3) {
                more = '<button type="button" class="lyann-pill lyann-pill-more" data-action="more-trades">Voir plus</button>';
            }
            host.innerHTML = pills + more;
        }
        function refineCard() {
            if (mode === 'annonces') {
                return `<article class="explorer-refine"><h2>Vous cherchez un besoin précis ?</h2><p>Affinez votre recherche par mot-clé, catégorie, commune ou budget.</p><button type="button" class="btn lyann-cta-primary" data-action="refine">Affiner ma recherche</button></article>`;
            }
            return `<article class="explorer-refine"><h2>Vous cherchez un talent en particulier ?</h2><p>Affinez votre recherche par métier, commune ou disponibilité.</p><button type="button" class="btn lyann-cta-primary" data-action="refine">Affiner ma recherche</button></article>`;
        }
        function render(options = {}) {
            syncControls();
            syncUrl();
            applyMapViewLayout();
            const results = repo.discover(records, leaves, filters, mode);
            const mapScoped = mode === 'annonces' && mapAvailable() ? rowsForMapFamilies(results) : results;
            const countLabel = mode === 'annonces'
                ? (mapScoped.length <= 1 ? 'annonce' : 'annonces')
                : (results.length <= 1 ? 'Lyanneur' : 'Lyanneurs');
            const displayCount = mode === 'annonces' && mapAvailable() ? mapScoped.length : results.length;
            $('explorerSummary').textContent = `${displayCount} ${countLabel} · ${(mode === 'annonces' ? filters.area : [filters.commune, filters.territory].filter(Boolean).join(' · ')) || 'Tous les lieux'}`;
            $('explorerRanking').textContent = mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.';
            const container = $('explorerResults');
            window.LYANN_SKELETON?.clear(container);
            if (mapAvailable()) {
                // Same filtered, already-authorised results as the list: the map never widens them.
                setSurface(true);
                container.replaceChildren();
                ensureNeedsMap().update({
                    rows: results,
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
                container.innerHTML = `<div class="explorer-state"><h2>${mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.'}</h2><p>Essayez un autre service ou élargissez votre zone.</p><button class="btn btn-outline" data-action="reset">Modifier les filtres</button>${(mode === 'annonces' ? filters.area : filters.territory) ? `<button class="btn btn-outline" data-remove="${mode === 'annonces' ? 'area' : 'territory'}">Élargir la zone</button>` : ''}${mode === 'annonces' ? '<button class="btn btn-primary explorer-publish"><i class="ph ph-plus" aria-hidden="true"></i> Publier une annonce</button>' : ''}</div>${refineCard()}`;
            } else {
                const cards = results.map(mode === 'annonces' ? requestCard : profileCard);
                if (mode !== 'annonces') cards.splice(Math.min(5, cards.length), 0, refineCard());
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
                const [data, taxonomy] = await Promise.all([mode === 'annonces' ? repo.loadRequests({force}) : repo.load({force}), repo.taxonomy(force)]);
                if (token !== revision) return;
                records = data; leaves = taxonomy;
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
            filters = {query:'',category:'',service:'',area:'',territory:'',commune:'',urgency:'',budget:''};
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
            if (button.dataset.action === 'more-trades') {
                showAllTrades = true;
                renderCategoryPills();
                return;
            }
            if (button.dataset.action === 'all-categories') {
                syncControls();
                $('explorerFilters').showModal();
                $('explorerCategory')?.focus();
                return;
            }
            if (button.dataset.view && button.closest('#explorerViewToggle')) { setView(button.dataset.view); return; }
            if (button.dataset.mode) {
                const nextMode = button.dataset.mode;
                if (mode === 'annonces' && nextMode !== 'annonces') {
                    destroyNeedsMap();
                    view = 'list';
                    applyMapViewLayout();
                }
                mode = nextMode;
                showAllTrades = false;
                search();
                return;
            }
            if (button.dataset.remove) {
                filters[button.dataset.remove] = '';
                if (button.dataset.remove === 'territory') filters.commune = '';
                if (button.dataset.remove === 'category') filters.service = '';
                search(); return;
            }
            if (button.classList.contains('lyann-pill')) {
                filters.category = button.dataset.category || '';
                filters.service = '';
                search();
                return;
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
        $('explorerCategory').addEventListener('change', () => { filters.category = $('explorerCategory').value; filters.service = ''; search(); });
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
        window.addEventListener('pageshow', event => { if (event.persisted) search(true); });
        // Leaving the page (tab, back swipe, app switch into the page cache) always releases the Carte lock;
        // a restored page re-applies it from its own state through search() above.
        window.addEventListener('pagehide', () => {
            document.body.classList.remove('explorer-annonces-map-view', 'explorer-map-category-sheet-open');
        });
        async function refreshSavedArea(id) {
            savedArea = '';
            $('explorerSavedArea').hidden = true;
            if (!id) return;
            try {
                const { data, error } = await window.LYANN_API_CLIENT.getProfile(id);
                if (id !== currentUserId()) return;
                if (!error) {
                    savedArea = data?.city || data?.territory || '';
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
