/* LYANN — Carte des besoins V1.
 *
 * Affiche les annonces publiques déjà chargées par l'explorateur, regroupées par
 * commune. Un repère représente une commune (son centre officiel, issu de
 * commune-geo.js), jamais l'adresse d'un membre : aucune coordonnée n'est lue sur
 * l'annonce, aucune adresse n'est géocodée, aucune position n'est demandée.
 * Une annonce dont la commune est inconnue ou ambiguë n'a pas de repère et reste
 * consultable dans la liste.
 *
 * Leaflet / MapLibre sont chargés à la demande, une seule fois par page.
 */
(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;
    const MAX_PINS = 120;
    const TERRITORY_BOUNDS = Object.freeze({
        guadeloupe: { south: 15.83, north: 16.52, west: -61.82, east: -61.00 },
        martinique: { south: 14.38, north: 14.90, west: -61.24, east: -60.81 },
        guyane: { south: 2.10, north: 5.78, west: -54.60, east: -51.60 },
        reunion: { south: -21.40, north: -20.87, west: 55.20, east: 55.84 },
        'saint-martin': { south: 18.00, north: 18.13, west: -63.16, east: -62.97 }
    });
    const VENDOR = Object.freeze({
        leafletCss: 'vendor/leaflet/leaflet.css?v=1.9.4',
        maplibreCss: 'vendor/maplibre/maplibre-gl.css?v=5.6.1',
        leaflet: 'vendor/leaflet/leaflet.js?v=1.9.4',
        maplibre: 'vendor/maplibre/maplibre-gl.js?v=5.6.1',
        bridge: 'vendor/maplibre/leaflet-maplibre-gl.js?v=0.1.4'
    });
    // Même version de style que Bokantaj : le fichier est déjà en cache.
    const STYLE_PATH = 'assets/maps/lyann-liberty.json?v=20261023-chic';
    const GLYPHS_PATH = 'assets/maps/glyphs/';

    /* ---------- Données (pures, testables sans navigateur) ---------- */

    // Mêmes règles que la liste publique (API /v1/explorer/requests et Découvrir).
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

    // Seule source de position : le centre de commune du jeu de données officiel,
    // trouvé par correspondance exacte du nom. Une adresse libre ne correspond à
    // aucune commune et n'est donc jamais placée ; un nom présent dans plusieurs
    // territoires sans code reste ambigu et n'est pas placé non plus.
    function communeOf(row, geo) {
        const text = String(row?.location || '').trim();
        if (!text || !geo || typeof geo.coordinatesFor !== 'function') return null;
        const coords = geo.coordinatesFor(text);
        if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
        const parsed = typeof geo.parseLocation === 'function' ? geo.parseLocation(text) : null;
        const label = text.replace(/\s*\([^)]*\)\s*/g, '').trim();
        if (!label) return null;
        return { key: `${coords[0]},${coords[1]}`, code: parsed?.code || null, label, lat: coords[0], lng: coords[1] };
    }

    function groupByCommune(rows, geo, maxPins = MAX_PINS) {
        const seen = new Set();
        const byKey = new Map();
        let total = 0;
        for (const row of Array.isArray(rows) ? rows : []) {
            if (!eligibleRequest(row) || seen.has(row.id)) continue;
            seen.add(row.id);
            total += 1;
            const commune = communeOf(row, geo);
            if (!commune) continue;
            if (!byKey.has(commune.key)) byKey.set(commune.key, { ...commune, items: [] });
            byKey.get(commune.key).items.push(row);
        }
        const all = [...byKey.values()].sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, 'fr'));
        const groups = all.slice(0, maxPins);
        const mapped = groups.reduce((sum, group) => sum + group.items.length, 0);
        return { groups, total, mapped, unmapped: total - mapped };
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    function countLabel(count) {
        return `${count} annonce${count > 1 ? 's' : ''}`;
    }

    function resolveTerritoryKey(area) {
        const text = String(area || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (text.includes('martinique') || text.includes('(972)')) return 'martinique';
        if (text.includes('guyane') || text.includes('(973)')) return 'guyane';
        if (text.includes('reunion') || text.includes('(974)')) return 'reunion';
        if (text.includes('saint-martin') || text.includes('(978)')) return 'saint-martin';
        if (text.includes('guadeloupe') || text.includes('(971)')) return 'guadeloupe';
        return '';
    }

    // Une fiche par annonce : catégorie, titre, commune, prix, action.
    function renderPanel(group, deps = {}) {
        const format = deps.format || {};
        const leaves = deps.leaves || [];
        const items = group.items.map((row) => {
            const category = (format.categoryLine && format.categoryLine(row, leaves)) || row.category || '';
            const title = (format.shortTitle && format.shortTitle(row.title)) || row.title || 'Annonce';
            const price = (format.priceLabel && format.priceLabel(row)) || 'Sur devis';
            return `<li class="needs-map-item">
                ${category ? `<p class="needs-map-cat">${escapeHtml(category)}</p>` : ''}
                <h4 class="needs-map-item-title">${escapeHtml(title)}</h4>
                <p class="needs-map-meta"><span>${escapeHtml(group.label)}</span><span class="needs-map-price">${escapeHtml(price)}</span></p>
                <button type="button" class="btn btn-primary needs-map-open" data-needs-map-open="${escapeHtml(row.id)}">Voir l'annonce →</button>
            </li>`;
        }).join('');
        return `<div class="needs-map-panel-handle" aria-hidden="true"></div><header class="needs-map-panel-head">
                <div><h3 class="needs-map-panel-title">${escapeHtml(group.label)}</h3><p class="needs-map-panel-count">${countLabel(group.items.length)}</p></div>
                <button type="button" class="needs-map-close" data-needs-map-close aria-label="Fermer la liste de ${escapeHtml(group.label)}">×</button>
            </header>
            <ul class="needs-map-list">${items}</ul>`;
    }

    /* ---------- Chargement à la demande de Leaflet / MapLibre ---------- */

    let librariesPromise = null;

    function loadStyle(href) {
        const name = href.split('?')[0];
        if ([...document.querySelectorAll('link[rel="stylesheet"]')].some((l) => (l.getAttribute('href') || '').split('?')[0] === name)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }

    function loadScript(src, isReady) {
        if (isReady()) return Promise.resolve();
        const name = src.split('?')[0];
        const existing = [...document.querySelectorAll('script[src]')].find((s) => (s.getAttribute('src') || '').split('?')[0] === name);
        return new Promise((resolve, reject) => {
            const script = existing || document.createElement('script');
            const done = () => (isReady() ? resolve() : reject(new Error('Bibliothèque de carte indisponible')));
            script.addEventListener('load', done, { once: true });
            script.addEventListener('error', () => reject(new Error('Bibliothèque de carte indisponible')), { once: true });
            if (!existing) {
                script.src = src;
                script.async = false;
                document.head.appendChild(script);
            }
        });
    }

    function ensureMapLibraries() {
        if (root.L && root.L.maplibreGL) return Promise.resolve();
        if (!librariesPromise) {
            loadStyle(VENDOR.leafletCss);
            loadStyle(VENDOR.maplibreCss);
            librariesPromise = loadScript(VENDOR.leaflet, () => Boolean(root.L && root.L.map))
                .then(() => loadScript(VENDOR.maplibre, () => Boolean(root.maplibregl)))
                .then(() => loadScript(VENDOR.bridge, () => Boolean(root.L && root.L.maplibreGL)))
                .catch((error) => { librariesPromise = null; throw error; });
        }
        return librariesPromise;
    }

    /* ---------- Vue ---------- */

    function reduceMotion() {
        return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function addBasemap(map, canvas, notice) {
        let layer = null;
        let timer = null;
        let failed = false;
        const setNotice = (text, retry) => {
            notice.hidden = false;
            notice.replaceChildren(document.createTextNode(text));
            if (retry) {
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = 'Réessayer';
                button.addEventListener('click', load);
                notice.append(' ', button);
            }
        };
        const fail = () => {
            failed = true;
            clearTimeout(timer);
            canvas.dataset.basemap = 'error';
            setNotice('Fond de carte indisponible.', true);
        };
        function load() {
            clearTimeout(timer);
            failed = false;
            canvas.dataset.basemap = 'loading';
            setNotice('La carte arrive…');
            if (layer) { map.removeLayer(layer); layer = null; }
            const configured = root.LYANN_MAP_STYLE_URL;
            const custom = typeof configured === 'string' && /^https:\/\//.test(configured);
            const stylePromise = custom ? Promise.resolve(configured)
                : fetch(new URL(STYLE_PATH, document.baseURI).href, { credentials: 'same-origin' })
                    .then((response) => {
                        if (!response.ok) throw new Error('style');
                        return response.json();
                    })
                    .then((style) => {
                        if (!style || !Array.isArray(style.layers) || !style.sources?.openmaptiles) throw new Error('style');
                        style.glyphs = new URL(GLYPHS_PATH, document.baseURI).href + '{fontstack}/{range}.pbf';
                        return style;
                    });
            stylePromise.then((style) => {
                if (failed || !map._mapPane) return;
                layer = root.L.maplibreGL({ style, interactive: false, attributionControl: false }).addTo(map);
                const gl = layer.getMaplibreMap();
                gl.on('error', fail);
                gl.on('idle', () => {
                    if (failed || !gl.isStyleLoaded() || !gl.areTilesLoaded()) return;
                    clearTimeout(timer);
                    notice.hidden = true;
                    canvas.dataset.basemap = 'ready';
                });
            }).catch(fail);
            timer = setTimeout(fail, 15000);
        }
        map.on('unload', () => clearTimeout(timer));
        load();
    }

    function mount(host, options = {}) {
        const geo = options.geo || root.LYANN_GEO;
        const format = () => root.LYANN_ANNONCE_FORMAT || {};
        let destroyed = false;
        let token = 0;
        let map = null;
        let markerLayer = null;
        let observer = null;
        let rowsById = new Map();
        let groupsByKey = new Map();
        let leaves = [];
        let selectedKey = null;
        let paintedSignature = '';
        let framedSignature = '';
        let userMovedMap = false;
        let lastTerritoryKey = '';
        const markers = new Map();

        host.innerHTML = `<div class="needs-map" data-state="loading">
            <p class="needs-map-summary" role="status" aria-live="polite" hidden></p>
            <div class="needs-map-stage" hidden>
                <div class="needs-map-canvas" role="region" aria-label="Carte des besoins par commune"></div>
                <section class="needs-map-panel" hidden tabindex="-1" aria-live="polite"></section>
            </div>
            <div class="needs-map-state" role="status"></div>
        </div>`;
        const shell = host.firstElementChild;
        const summary = shell.querySelector('.needs-map-summary');
        const stage = shell.querySelector('.needs-map-stage');
        const canvas = shell.querySelector('.needs-map-canvas');
        const panel = shell.querySelector('.needs-map-panel');
        const stateBox = shell.querySelector('.needs-map-state');
        const notice = document.createElement('div');
        notice.className = 'needs-map-basemap-notice';
        notice.setAttribute('role', 'status');

        function showState(kind, html) {
            shell.dataset.state = kind;
            stateBox.hidden = false;
            stateBox.innerHTML = html;
            stage.hidden = true;
            summary.hidden = true;
            closePanel(false);
        }

        function showMap() {
            shell.dataset.state = 'ready';
            stateBox.hidden = true;
            stateBox.replaceChildren();
            stage.hidden = false;
        }

        const listButton = '<button type="button" class="btn btn-outline" data-needs-map-list>Voir la liste</button>';

        function setLoading() {
            token += 1;
            showState('loading', '<p class="needs-map-state-title">Chargement de la carte…</p><p>Les besoins publics arrivent.</p>');
        }

        function closePanel(restoreFocus = true) {
            const previous = selectedKey;
            selectedKey = null;
            panel.hidden = true;
            panel.replaceChildren();
            if (previous && markers.has(previous)) {
                const element = markers.get(previous).getElement?.();
                element?.classList.remove('is-selected');
                if (restoreFocus) element?.focus?.({ preventScroll: true });
            }
        }

        function openGroup(group, shouldCenter = true) {
            if (selectedKey && markers.has(selectedKey)) markers.get(selectedKey).getElement?.()?.classList.remove('is-selected');
            selectedKey = group.key;
            markers.get(group.key)?.getElement?.()?.classList.add('is-selected');
            panel.innerHTML = renderPanel(group, { format: format(), leaves });
            panel.hidden = false;
            panel.scrollTop = 0;
            if (map && shouldCenter) {
                const bottomSheet = root.matchMedia && root.matchMedia('(max-width: 799px)').matches;
                const target = root.L.latLng(group.lat, group.lng);
                const zoom = map.getZoom();
                let center = target;
                if (bottomSheet) {
                    // Le panneau occupe le bas de la carte : le repère reste visible au-dessus.
                    const point = map.project(target, zoom);
                    point.y += Math.round(map.getSize().y * 0.22);
                    center = map.unproject(point, zoom);
                }
                map.setView(center, zoom, { animate: !reduceMotion() });
            }
            panel.focus({ preventScroll: true });
        }

        function glyph() {
            return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10Z"/><circle cx="12" cy="11" r="2.2"/></svg>';
        }

        function ensureMap() {
            if (map) return;
            const L = root.L;
            map = L.map(canvas, {
                zoomControl: false, scrollWheelZoom: false, minZoom: 3, maxZoom: 16,
                touchZoom: true, bounceAtZoomLimits: false, worldCopyJump: false,
                zoomAnimation: !reduceMotion(), fadeAnimation: !reduceMotion(), markerZoomAnimation: !reduceMotion()
            }).setView([16.25, -61.55], 10);
            L.control.zoom({ position: 'topleft', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(map);
            map.attributionControl.setPrefix(false);
            map.attributionControl.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>');
            canvas.append(notice);
            L.DomEvent.disableClickPropagation(notice);
            L.DomEvent.disableScrollPropagation(notice);
            addBasemap(map, canvas, notice);
            markerLayer = L.layerGroup().addTo(map);
            map.on('click', () => { if (selectedKey) closePanel(false); });
            map.on('dragend', () => { userMovedMap = true; });
            map.on('zoomend', () => { userMovedMap = true; });
            if (typeof root.ResizeObserver === 'function') {
                observer = new root.ResizeObserver(() => { if (map && !stage.hidden) map.invalidateSize({ animate: false }); });
                observer.observe(stage);
            }
        }

        function frame(groups, territoryKey) {
            const L = root.L;
            const boundsDef = territoryKey && TERRITORY_BOUNDS[territoryKey];
            if (boundsDef) {
                const bounds = L.latLngBounds([[boundsDef.south, boundsDef.west], [boundsDef.north, boundsDef.east]]);
                map.fitBounds(bounds, { maxZoom: 11, animate: false, paddingTopLeft: [16, 16], paddingBottomRight: [16, 16] });
                return;
            }
            // Cadre le territoire le plus représenté : mélanger l'Hexagone et
            // l'outre-mer ne doit pas dézoomer sur le monde entier.
            const byCode = new Map();
            groups.forEach((group) => {
                const code = group.code || String(group.key);
                byCode.set(code, (byCode.get(code) || 0) + group.items.length);
            });
            const dominant = [...byCode.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            const subset = groups.filter((group) => (group.code || String(group.key)) === dominant);
            const bounds = L.latLngBounds(subset.map((group) => [group.lat, group.lng]));
            if (!bounds.isValid()) return;
            map.fitBounds(bounds.pad(0.25), { maxZoom: 12, animate: false, paddingTopLeft: [24, 24], paddingBottomRight: [24, 24] });
        }

        function paint(groups) {
            const L = root.L;
            markerLayer.clearLayers();
            markers.clear();
            groups.forEach((group) => {
                const count = group.items.length;
                const name = `${group.label} : ${countLabel(count)}`;
                const icon = L.divIcon({
                    className: `needs-map-pin${count > 1 ? ' is-multi' : ''}`,
                    html: `<span class="needs-map-pin-face" aria-hidden="true">${count > 1 ? count : glyph()}</span>`,
                    iconSize: [44, 44], iconAnchor: [22, 22]
                });
                const marker = L.marker([group.lat, group.lng], { icon, title: name, alt: name, keyboard: true, riseOnHover: true });
                marker.addTo(markerLayer);
                // The visible badge is only a count: the accessible name carries the commune.
                marker.getElement()?.setAttribute('role', 'button');
                marker.getElement()?.setAttribute('aria-label', name);
                marker.getElement()?.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    marker.fire('click');
                });
                marker.on('click', (event) => {
                    if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
                    openGroup(groupsByKey.get(group.key) || group);
                });
                markers.set(group.key, marker);
            });
        }

        function update(data = {}) {
            const current = ++token;
            leaves = data.leaves || [];
            const result = groupByCommune(data.rows, geo);
            rowsById = new Map();
            groupsByKey = new Map();
            result.groups.forEach((group) => {
                groupsByKey.set(group.key, group);
                group.items.forEach((row) => rowsById.set(String(row.id), row));
            });

            if (!result.total) {
                showState('empty', `<p class="needs-map-state-title">Aucune annonce pour ces filtres.</p>
                    <p>Modifiez la recherche ou consultez toute la liste.</p>
                    <div class="needs-map-actions"><button type="button" class="btn btn-outline" data-needs-map-reset>Modifier les filtres</button>${listButton}</div>`);
                return;
            }
            if (!result.mapped) {
                const signedIn = Boolean(root.LYANN_AUTH_STATE?.getSnapshot?.().userId);
                showState('unmapped', `<p class="needs-map-state-title">${result.total > 1 ? `${result.total} annonces sont disponibles, sans commune précise.` : 'Une annonce est disponible, sans commune précise.'}</p>
                    <p>${signedIn ? 'Elles restent consultables dans la liste.' : 'Connectez-vous pour voir les besoins commune par commune. Ils restent consultables dans la liste.'}</p>
                    <div class="needs-map-actions">${signedIn ? '' : '<button type="button" class="btn btn-primary" data-needs-map-login>Se connecter</button>'}${listButton}</div>`);
                return;
            }

            const territoryKey = resolveTerritoryKey(data.area || '');
            if (data.reframe === true) {
                if (territoryKey && territoryKey !== lastTerritoryKey) {
                    userMovedMap = false;
                    lastTerritoryKey = territoryKey;
                } else if (!territoryKey) {
                    userMovedMap = false;
                }
            }
            const signature = result.groups.map((group) => `${group.key}:${group.items.map((row) => row.id).join(',')}`).join('|');
            const note = result.unmapped
                ? ` · ${result.unmapped} sans commune précise (voir la liste)`
                : '';
            ensureMapLibraries().then(() => {
                if (destroyed || current !== token) return;
                showMap();
                summary.textContent = `${countLabel(result.mapped)} sur la carte${note}`;
                summary.hidden = false;
                ensureMap();
                map.invalidateSize({ animate: false });
                if (signature !== paintedSignature) {
                    paintedSignature = signature;
                    paint(result.groups);
                }
                const framing = territoryKey || result.groups.map((group) => group.key).sort().join('|');
                if (!userMovedMap && (data.reframe === true || framing !== framedSignature)) {
                    framedSignature = framing;
                    frame(result.groups, territoryKey);
                }
                // Une commune sélectionnée qui disparaît des filtres referme le panneau ;
                // sinon la liste de la commune se met à jour.
                if (selectedKey) {
                    const group = groupsByKey.get(selectedKey);
                    if (group) {
                        markers.get(selectedKey)?.getElement?.()?.classList.add('is-selected');
                        panel.innerHTML = renderPanel(group, { format: format(), leaves });
                    } else closePanel(false);
                }
            }).catch(() => {
                if (destroyed || current !== token) return;
                showState('error', `<p class="needs-map-state-title">La carte n'a pas pu s'ouvrir.</p>
                    <p>Vérifiez votre connexion. Les annonces restent disponibles dans la liste.</p>
                    <div class="needs-map-actions"><button type="button" class="btn btn-primary" data-needs-map-retry>Réessayer</button>${listButton}</div>`);
            });
        }

        let lastData = null;
        const originalUpdate = update;
        const trackedUpdate = (data) => { lastData = data; return originalUpdate(data); };

        function onClick(event) {
            const button = event.target.closest('button');
            if (!button || !shell.contains(button)) return;
            if (button.hasAttribute('data-needs-map-open')) {
                const row = rowsById.get(button.getAttribute('data-needs-map-open'));
                if (!row) return;
                if (typeof options.onOpen === 'function') options.onOpen(row);
                else root.location.href = `results.html?mode=annonces&openLyann=${encodeURIComponent(row.id)}`;
            } else if (button.hasAttribute('data-needs-map-close')) {
                closePanel(true);
            } else if (button.hasAttribute('data-needs-map-list')) {
                options.onShowList?.();
            } else if (button.hasAttribute('data-needs-map-reset')) {
                options.onReset?.();
            } else if (button.hasAttribute('data-needs-map-retry')) {
                if (lastData) trackedUpdate(lastData);
            } else if (button.hasAttribute('data-needs-map-login')) {
                document.querySelector('.open-login-trigger')?.click();
            }
        }
        function onKeydown(event) {
            if (event.key === 'Escape' && selectedKey) {
                event.stopPropagation();
                closePanel(true);
            }
        }
        shell.addEventListener('click', onClick);
        shell.addEventListener('keydown', onKeydown);

        function destroy() {
            destroyed = true;
            token += 1;
            shell.removeEventListener('click', onClick);
            shell.removeEventListener('keydown', onKeydown);
            observer?.disconnect();
            observer = null;
            markers.clear();
            if (map) { map.remove(); map = null; }
            markerLayer = null;
            host.replaceChildren();
        }

        setLoading();
        return { setLoading, update: trackedUpdate, destroy, closePanel: () => closePanel(false) };
    }

    const api = Object.freeze({
        eligibleRequest, communeOf, groupByCommune, renderPanel, resolveTerritoryKey,
        ensureMapLibraries, mount, MAX_PINS, TERRITORY_BOUNDS
    });
    root.LYANN_NEEDS_MAP = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
