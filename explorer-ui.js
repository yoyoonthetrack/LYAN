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
        function requestCard(r) {
            const own = Boolean(currentUserId()) && r.requester_id === currentUserId();
            return `<article class="explorer-card" data-request-id="${escape(r.id)}">
                <div class="explorer-card-top"><span class="explorer-meta">${escape(r.category)} · ${escape(statusLabel(r.status))}</span>${favorite('REQUEST', r.id)}</div>
                <h2>${escape(r.title)}</h2><p class="explorer-card-description">${escape(r.description)}</p>
                <div class="explorer-meta"><span>📍 ${escape(r.location || 'Lieu à préciser')}</span><span>◷ ${escape(urgencyLabel(r.urgency))}</span></div>
                <p class="explorer-budget">${r.budget == null ? 'Budget à convenir' : escape(Number(r.budget).toLocaleString('fr-FR')) + ' €'}</p>
                <div class="explorer-person"><img src="${avatar(r.profiles)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)"><span>${escape(name(r.profiles))}${own ? ' · Votre annonce' : ''}</span></div>
                <div class="explorer-card-actions">${!own && r.status === 'OPEN' ? `<button class="btn btn-primary" data-action="help" data-id="${escape(r.id)}">Je peux aider</button>` : ''}<button class="btn btn-outline" data-action="detail" data-id="${escape(r.id)}">Détails</button></div>
            </article>`;
        }
        function profileCard(p) {
            return `<article class="explorer-card" data-member-id="${escape(p.id)}">
                <div class="explorer-card-top"><div class="explorer-person"><img src="${avatar(p)}" alt="" loading="lazy" onerror="window.handleAvatarError(this)"><h2>${escape(p.name)}</h2></div>${favorite('PROFILE', p.id)}</div>
                ${p.is_pro ? '<span class="explorer-meta">Professionnel</span>' : ''}
                <p>${escape(p.services.map(s => s.title).slice(0, 3).join(' · ') || 'Services non renseignés')}</p>
                <p class="explorer-meta">📍 ${escape([p.city, p.territory].filter(Boolean).join(' · ') || 'Lieu non renseigné')}</p>
                ${p.bio ? `<p class="explorer-card-description">${escape(p.bio)}</p>` : ''}
                <div class="explorer-card-actions"><button class="btn btn-primary" data-action="profile" data-id="${escape(p.id)}">Voir le profil</button>${p.id !== currentUserId() ? `<button class="btn btn-outline" data-action="contact" data-id="${escape(p.id)}">Contacter</button>` : ''}</div>
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
            root.querySelectorAll('[data-mode]').forEach(tab => {
                const active = tab.dataset.mode === mode;
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
            });
            $('explorerPanel').setAttribute('aria-labelledby', `${mode}Tab`);
            $('explorerSearchInput').placeholder = mode === 'annonces' ? 'De quoi avez-vous besoin ?' : 'Quel service recherchez-vous ?';
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
            $('explorerSummary').textContent = `${results.length} ${mode === 'annonces' ? 'annonce(s)' : 'Lyanneur(s)'} · ${(mode === 'annonces' ? filters.area : [filters.commune, filters.territory].filter(Boolean).join(' · ')) || 'Tous les lieux'}`;
            $('explorerRanking').textContent = mode === 'annonces' ? 'Annonces les plus récentes en premier.' : 'Services correspondant à votre recherche, puis noms par ordre alphabétique.';
            const container = $('explorerResults');
            container.dataset.state = results.length ? 'SUCCESS' : 'EMPTY';
            container.innerHTML = results.length ? results.map(mode === 'annonces' ? requestCard : profileCard).join('') : `<div class="explorer-state"><h2>${mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.'}</h2><p>Essayez un autre service ou élargissez votre zone.</p><button class="btn btn-outline" data-action="reset">Modifier les filtres</button>${(mode === 'annonces' ? filters.area : filters.territory) ? `<button class="btn btn-outline" data-remove="${mode === 'annonces' ? 'area' : 'territory'}">Élargir la zone</button>` : ''}<button class="btn btn-primary explorer-publish">Publier une annonce</button></div>`;
            window.syncFavoriteButtonStates?.();
        }
        async function search(force = false) {
            const token = ++revision;
            syncControls();
            $('explorerResults').setAttribute('aria-busy', 'true');
            $('explorerResults').dataset.state = 'LOADING';
            $('explorerResults').innerHTML = '<div class="explorer-state" role="status">Chargement…</div>';
            $('explorerSummary').textContent = '';
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
                case 'profile': window.openPublicMemberProfile?.(button.dataset.id); break;
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
