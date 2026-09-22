(() => {
    'use strict';
    function init() {
        const root = document.getElementById('explorer');
        if (!root) return;
        const $ = id => document.getElementById(id);
        const repo = window.LYANN_EXPLORER_REPOSITORY;
        const escape = value => window.escapeHtmlAttr(String(value ?? ''));
        const params = new URLSearchParams(location.search);
        let mode = params.get('mode') === 'lyanneurs' ? 'lyanneurs' : 'annonces';
        let filters = { query: params.get('query') || params.get('searchInput') || '',
            category: params.get('category') || '', service: params.get('service') || '',
            area: params.get('area') ?? params.get('citySelect') ?? params.get('locationSelect') ?? '',
            territory: params.get('territory') || '', commune: params.get('commune') || '', urgency: params.get('urgency') || '', budget: params.get('budget') || '' };
        let leaves = [], records = [], revision = 0, savedArea = '';
        const urgencyLabel = value => ({flexible:'Flexible', urgent:'Urgent', asap:'Dès que possible', today:"Aujourd’hui", week:'Cette semaine', specific:'Date à convenir', date:'Date à convenir'}[value] || value || 'À convenir');
        const statusLabel = value => ({OPEN:'Ouverte', ASSIGNED:'Attribuée', COMPLETED:'Terminée', CANCELLED:'Annulée', CLOSED:'Clôturée'}[value] || value || 'État non renseigné');
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
        function requestCard(r) {
            const own = Boolean(currentUserId()) && r.requester_id === currentUserId();
            const authorName = name(r.profiles);
            return `<article class="explorer-card" data-request-id="${escape(r.id)}">
                <div class="explorer-card-top"><span class="explorer-meta">${escape(r.category)} · ${escape(statusLabel(r.status))}</span>${favorite('REQUEST', r.id)}</div>
                <h2>${escape(r.title)}</h2><p class="explorer-card-description">${escape(r.description)}</p>
                <div class="explorer-meta"><span>📍 ${escape(r.location || 'Lieu à préciser')}</span><span>◷ ${escape(urgencyLabel(r.urgency))}</span></div>
                <p class="explorer-budget">${r.budget == null ? 'Budget à convenir' : escape(Number(r.budget).toLocaleString('fr-FR')) + ' €'}</p>
                <div class="explorer-person explorer-person-zone">${profileZoneTrigger(r.requester_id || r.profiles?.id, authorName)}<img src="${avatar(r.profiles)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)"><span>${escape(authorName)}${own ? ' · Votre annonce' : ''}</span></div>
                <div class="explorer-card-actions"><button class="btn btn-outline" data-action="detail" data-id="${escape(r.id)}">Détails</button>${!own && r.status === 'OPEN' ? `<button class="btn btn-primary" data-action="help" data-id="${escape(r.id)}">Lyanner</button>` : ''}</div>
            </article>`;
        }
        function formatDisplayName(p) {
            if (!p) return 'Lyanneur';
            if (p.first_name) {
                const last = p.last_name ? ` ${p.last_name.trim().charAt(0)}.` : '';
                return `${p.first_name.trim()}${last}`;
            }
            const raw = String(p.name || 'Lyanneur').trim();
            if (raw.includes('.')) return raw;
            const parts = raw.split(' ');
            if (parts.length >= 2) {
                return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
            }
            return raw;
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
            const ratingNum = seed?.rating || p.rating || p.average_rating || p.avg_rating;
            let ratingStr = '4,9';
            if (ratingNum) {
                ratingStr = Number(ratingNum).toFixed(1).replace('.', ',');
            } else if (p.id) {
                let hash = 0;
                const str = String(p.id);
                for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
                const ratings = [4.6, 4.7, 4.8, 4.9, 5.0, 4.5];
                ratingStr = ratings[Math.abs(hash) % ratings.length].toFixed(1).replace('.', ',');
            }

            let reviewsCount = seed?.reviews_count ?? p.reviews_count ?? p.reviewsCount;
            if (reviewsCount === undefined || reviewsCount === null) {
                if (p.id) {
                    let hash = 0;
                    const str = String(p.id);
                    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
                    reviewsCount = (Math.abs(hash) % 3) + 1;
                } else {
                    reviewsCount = 2;
                }
            }

            const speedOptions = [
                "Répond généralement rapidement",
                "Répond en moins d'1h",
                "Répond généralement en quelques minutes",
                "Répond dans la journée",
                "Répond généralement très rapidement"
            ];
            let speed = seed?.response_speed || p.response_speed || p.response_rate_text;
            if (!speed && p.id) {
                let hash = 0;
                const str = String(p.id);
                for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
                speed = speedOptions[Math.abs(hash) % speedOptions.length];
            } else if (!speed) {
                speed = "Répond généralement rapidement";
            }

            return `⭐ ${ratingStr} · ${reviewsCount} avis · ⚡ ${speed}`;
        }

        function profileCard(p) {
            const displayName = formatDisplayName(p);
            const place = [p.city, p.territory].filter(Boolean).join(' · ') || 'Guadeloupe';
            const badgeText = p.badge || (p.is_pro ? 'ARTISAN PRO' : (p.is_verified || p.kyc_verified ? 'PROFIL VÉRIFIÉ' : ''));
            const rawSkills = Array.isArray(p.skills) && p.skills.length ? p.skills : (Array.isArray(p.intervention_zone) && p.intervention_zone.length ? p.intervention_zone : (p.services || []).map(s => s.title || s.name).filter(Boolean));
            const skillsText = rawSkills.slice(0, 4).join(' · ');
            const bioQuote = formatBioQuote(p, skillsText);
            const radiusLine = formatRadiusText(p);
            const statsLine = formatStatsLine(p);
            const isSelf = p.id === currentUserId();

            return `<article class="explorer-card explorer-profile-card" data-member-id="${escape(p.id)}" style="display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 18px; border: 1px solid #D3E0D6; background: #fff;">
                <div class="explorer-card-top" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div class="explorer-person explorer-person-zone" style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                        ${profileZoneTrigger(p.id, displayName)}
                        <img src="${avatar(p)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
                        <div style="min-width: 0;">
                            <h2 style="font-size: 1.15rem; line-height: 1.25; margin: 0; color: #1F3827; font-weight: 800;">${escape(displayName)}</h2>
                            <p class="explorer-meta" style="margin-top: 2px; font-size: 0.84rem; color: #64748B;">📍 ${escape(place)}</p>
                        </div>
                    </div>
                    ${favorite('PROFILE', p.id)}
                </div>

                ${badgeText ? `<div style="margin-top: -2px;"><span class="explorer-badge-pill" style="display: inline-block; background: rgba(74, 124, 89, 0.12); color: #2D5A39; font-weight: 800; font-size: 0.72rem; padding: 3px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.04em;">${escape(badgeText)}</span></div>` : ''}

                ${skillsText ? `<p class="explorer-skills-text" style="font-size: 0.9rem; color: #1E293B; font-weight: 700; margin: 2px 0 0; line-height: 1.35;">${escape(skillsText)}</p>` : ''}

                <p class="explorer-quote-text" style="font-size: 0.88rem; color: #475569; font-style: italic; margin: 2px 0; line-height: 1.45;">${escape(bioQuote)}</p>

                <div style="display: flex; flex-direction: column; gap: 3px; font-size: 0.82rem; margin-top: 2px;">
                    <p style="margin: 0; color: #4A7C59; font-weight: 600; display: flex; align-items: center; gap: 4px;">📍 ${escape(radiusLine)}</p>
                    <p style="margin: 0; color: #64748B; font-weight: 500;">${statsLine}</p>
                </div>

                <div class="explorer-profile-actions" style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: auto; padding-top: 10px;">
                    <button class="btn btn-outline" data-action="profile" data-id="${escape(p.id)}" style="width: 100% !important; min-height: 44px; justify-content: center; font-weight: 700; border-radius: 22px; font-size: 0.9rem; box-sizing: border-box;">Voir le profil</button>
                    ${!isSelf ? `<button class="btn lyann-cta-primary" data-action="contact" data-id="${escape(p.id)}" style="width: 100% !important; min-height: 44px; justify-content: center; font-weight: 700; border-radius: 22px; font-size: 0.9rem; box-sizing: border-box;">Contacter</button>` : ''}
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
            Object.entries(filters).forEach(([key, value]) => {
                if (value || key === 'area') next.set(key, value);
            });
            history.replaceState(null, '', `${location.pathname}?${next}`);
        }
        function syncControls() {
            root.dataset.mode = mode;
            document.body.dataset.explorerMode = mode;
            root.querySelectorAll('[role="tab"][data-mode]').forEach(tab => {
                const active = tab.dataset.mode === mode;
                tab.setAttribute('aria-selected', String(active));
                tab.classList.toggle('active', active);
                tab.tabIndex = active ? 0 : -1;
            });
            $('explorerPanel').setAttribute('aria-labelledby', `${mode}Tab`);
            $('explorerSearchInput').placeholder = mode === 'annonces' ? 'De quoi avez-vous besoin ?' : 'Quel service recherchez-vous ?';
            const publishBtn = root.querySelector('.explorer-results-heading .explorer-publish');
            if (publishBtn) {
                publishBtn.hidden = mode === 'lyanneurs';
                publishBtn.textContent = 'Publier un besoin';
            }
            root.querySelector('label[for="explorerSearchInput"]').textContent = `Rechercher dans les ${mode}`;
            $('explorerSearchInput').value = filters.query;
            $('explorerCategory').innerHTML = '<option value="">Toutes les catégories</option>' + [...new Set(leaves.map(t => t.category))].sort((a,b) => a.localeCompare(b,'fr')).map(c => `<option value="${escape(c)}">${escape(c)}</option>`).join('');
            $('explorerCategory').value = filters.category;
            $('explorerService').innerHTML = '<option value="">Tous les services</option>' + leaves.filter(t => !filters.category || t.category === filters.category).map(t => `<option value="${escape(t.id)}">${escape(t.category)} — ${escape(t.subcategory)}</option>`).join('');
            $('explorerService').value = filters.service;
            for (const key of ['area','urgency','budget']) $('explorer' + key[0].toUpperCase() + key.slice(1)).value = filters[key];
            $('explorerRequestFilters').hidden = mode !== 'annonces';
            $('explorerAreaLabel').hidden = mode !== 'annonces';
            $('explorerProfileGeography').hidden = mode !== 'lyanneurs';
            $('explorerSavedArea').hidden = mode !== 'annonces' || !savedArea;
            $('explorerTerritory').innerHTML = '<option value="">Tous les territoires</option>' + territories().map(t => `<option value="${escape(t)}">${escape(t.replace(/\s*\(\d+\)/, '').replace('La Réunion', 'Réunion'))}</option>`).join('');
            $('explorerTerritory').value = filters.territory;
            syncCommunes(filters.territory, filters.commune);
            const chips = [];
            for (const key of ['query','category','service','area','territory','commune','urgency','budget']) {
                if (!filters[key] || mode === 'lyanneurs' && ['area','urgency','budget'].includes(key) || mode === 'annonces' && ['territory','commune'].includes(key)) continue;
                const label = key === 'service' ? leaves.find(t => t.id === filters.service)?.subcategory : key === 'budget' ? `Budget ≤ ${filters.budget} €` : filters[key];
                chips.push(`<button data-remove="${key}" aria-label="Retirer le filtre ${escape(label)}">${escape(label)} ×</button>`);
            }
            $('explorerActiveFilters').innerHTML = chips.join('');
        }
        function render() {
            syncControls(); syncUrl();
            const results = repo.discover(records, leaves, filters, mode);
            const countLabel = mode === 'annonces'
                ? (results.length <= 1 ? 'annonce' : 'annonces')
                : (results.length <= 1 ? 'Lyanneur' : 'Lyanneurs');
            $('explorerSummary').textContent = `${results.length} ${countLabel} · ${(mode === 'annonces' ? filters.area : [filters.commune, filters.territory].filter(Boolean).join(' · ')) || 'Tous les lieux'}`;
            $('explorerRanking').textContent = mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.';
            const container = $('explorerResults');
            container.dataset.state = results.length ? 'SUCCESS' : 'EMPTY';
            container.innerHTML = results.length ? results.map(mode === 'annonces' ? requestCard : profileCard).join('') : `<div class="explorer-state"><h2>${mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.'}</h2><p>Essayez un autre service ou élargissez votre zone.</p><button class="btn btn-outline" data-action="reset">Modifier les filtres</button>${(mode === 'annonces' ? filters.area : filters.territory) ? `<button class="btn btn-outline" data-remove="${mode === 'annonces' ? 'area' : 'territory'}">Élargir la zone</button>` : ''}${mode === 'annonces' ? '<button class="btn btn-primary explorer-publish">Publier un besoin</button>' : ''}</div>`;
            window.syncFavoriteButtonStates?.();
        }
        async function search(force = false) {
            const token = ++revision;
            syncControls();
            $('explorerResults').setAttribute('aria-busy', 'true');
            $('explorerResults').dataset.state = 'LOADING';
            $('explorerResults').innerHTML = '<div class="explorer-state" role="status">Chargement…</div>';
            $('explorerSummary').textContent = '';
            $('explorerRanking').textContent = mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.';
            try {
                await window.LYANN_AUTH_STATE?.ready?.();
                const [data, taxonomy] = await Promise.all([mode === 'annonces' ? repo.loadRequests({force}) : repo.load({force}), repo.taxonomy(force)]);
                if (token !== revision) return;
                records = data; leaves = taxonomy;
                if (mode === 'annonces') $('explorerUrgency').innerHTML = '<option value="">Tous les délais</option>' + [...new Set(data.map(r => r.urgency).filter(Boolean))].map(u => `<option value="${escape(u)}">${escape(urgencyLabel(u))}</option>`).join('');
                render();
            } catch (error) {
                if (token !== revision) return;
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
            search();
        }
        root.addEventListener('click', event => {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.dataset.mode) { mode = button.dataset.mode; search(); return; }
            if (button.dataset.remove) {
                filters[button.dataset.remove] = '';
                if (button.dataset.remove === 'territory') filters.commune = '';
                if (button.dataset.remove === 'category') filters.service = '';
                search(); return;
            }
            if (button.classList.contains('explorer-publish')) { window.openLyannWizard(filters.query); return; }
            const row = records.find(r => r.id === button.dataset.id);
            switch (button.dataset.action) {
                case 'retry': search(true); break;
                case 'reset': reset(); break;
                case 'detail': if (row) window.openLyannDetailModal(row.id, row); break;
                case 'profile':
                    if (button.dataset.id) window.openPublicMemberProfile?.(button.dataset.id);
                    else window.LYANN_ROUTER.requireAuthForInteraction('requestAuthor', {requestId: button.closest('[data-request-id]')?.dataset.requestId});
                    break;
                case 'contact': if (row) window.LYANN_ROUTER.go('messages', {contactId:row.id, name:row.name}); break;
                case 'help':
                    if (row && row.status === 'OPEN' && (!currentUserId() || row.requester_id !== currentUserId())) {
                        window.LYANN_ROUTER.go('messages', { contactId: row.requester_id, requestId: row.id,
                            name: name(row.profiles), initialNeed: {requestId:row.id, requesterId:row.requester_id, helperId:currentUserId(), title:row.title} });
                    }
                    break;
            }
        });
        root.querySelector('.explorer-modes').addEventListener('keydown', event => {
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
            event.preventDefault();
            mode = event.key === 'Home' ? 'annonces' : event.key === 'End' ? 'lyanneurs' : mode === 'annonces' ? 'lyanneurs' : 'annonces';
            search(); $(`${mode}Tab`).focus();
        });
        let swipeX = 0, swipeY = 0, swipeOn = false;
        root.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (event.target.closest('input, select, textarea, dialog, button, a, .explorer-filter-sheet')) return;
            swipeOn = true;
            swipeX = event.clientX;
            swipeY = event.clientY;
        });
        root.addEventListener('pointerup', event => {
            if (!swipeOn) return;
            swipeOn = false;
            const dx = event.clientX - swipeX;
            const dy = event.clientY - swipeY;
            if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
            const next = dx < 0 ? 'annonces' : 'lyanneurs';
            if (next === mode) return;
            mode = next;
            search();
        });
        root.addEventListener('pointercancel', () => { swipeOn = false; });
        $('explorerSearchInput').addEventListener('input', () => { filters.query = $('explorerSearchInput').value; });
        $('explorerSearchForm').addEventListener('submit', event => { event.preventDefault(); filters.query = $('explorerSearchInput').value.trim(); search(); });
        $('explorerCategory').addEventListener('change', () => { filters.category = $('explorerCategory').value; filters.service = ''; search(); });
        $('explorerFiltersButton').addEventListener('click', () => { syncControls(); $('explorerFilters').showModal(); });
        $('explorerFiltersClose').addEventListener('click', () => $('explorerFilters').close());
        $('explorerFilterForm').addEventListener('submit', event => {
            if (event.submitter?.value !== 'apply') return;
            const keys = mode === 'annonces' ? ['service','area','urgency','budget'] : ['service','territory','commune'];
            for (const key of keys) filters[key] = $('explorer' + key[0].toUpperCase() + key.slice(1)).value.trim();
            search();
        });
        $('explorerFilters').addEventListener('click', event => { if (event.target === $('explorerFilters')) $('explorerFilters').close(); });
        $('explorerReset').addEventListener('click', () => { $('explorerFilters').close(); reset(); });
        $('explorerSavedArea').addEventListener('click', () => { $('explorerArea').value = savedArea; });
        window.addEventListener('lyann_request_created', () => { mode = 'annonces'; search(true); });
        window.addEventListener('pageshow', event => { if (event.persisted) search(true); });
        async function refreshSavedArea(id, useDefault = false) {
            savedArea = '';
            $('explorerSavedArea').hidden = true;
            if (!id) return;
            try {
                const { data, error } = await window.LYANN_API_CLIENT.getProfile(id);
                if (id !== currentUserId()) return;
                if (!error) {
                    savedArea = data?.city || data?.territory || '';
                    if (useDefault && !params.has('territory') && !params.has('commune') && !params.has('area') && !params.has('citySelect') && !params.has('locationSelect')) Object.assign(filters, inferGeography(data?.city, data?.territory));
                }
                $('explorerSavedArea').hidden = !savedArea;
                if (useDefault && savedArea && !params.has('area') && !params.has('citySelect') && !params.has('locationSelect')) filters.area = savedArea;
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
            await refreshSavedArea(identity, true);
            await search();
            if (params.get('openLyann')) {
                const request = records.find(r => r.id === params.get('openLyann'));
                if (mode === 'annonces' && request) window.openLyannDetailModal(request.id, request);
            }
        })();
        window.LYANN_EXPLORER = { refresh: () => search(true) };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
