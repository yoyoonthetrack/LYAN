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

    // Territoire d'un point : boîtes des territoires d'outre-mer, sinon Hexagone, sinon « autre ».
    function territoryOfPoint(lat, lng) {
        for (const [key, box] of Object.entries(TERRITORY_BOUNDS)) {
            if (lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east) return key;
        }
        if (lat >= 41 && lat <= 51.5 && lng >= -5.5 && lng <= 10) return 'hexagone';
        return 'autre';
    }

    // Communes du territoire qui compte le plus d'annonces (les annonces, pas les communes, font le poids).
    function dominantTerritoryGroups(groups) {
        const weight = new Map();
        const list = Array.isArray(groups) ? groups : [];
        list.forEach((group) => {
            const key = territoryOfPoint(group.lat, group.lng);
            weight.set(key, (weight.get(key) || 0) + group.items.length);
        });
        const dominant = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return list.filter((group) => territoryOfPoint(group.lat, group.lng) === dominant);
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
                <button type="button" class="needs-map-categories-btn" data-needs-map-categories aria-haspopup="dialog" aria-controls="explorerMapCategorySheet">
                    <i class="ph ph-sliders-horizontal" aria-hidden="true"></i><span>Catégories</span>
                    <span class="needs-map-categories-badge" hidden aria-hidden="true"></span>
                </button>
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

        const familiesApi = () => root.LYANN_MAP_CATEGORY_FAMILIES;

        const FAMILY_ICON = Object.freeze({
            plomberie: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 3h6v2h-1v3.1c1.2.4 2.1 1.3 2.5 2.5H19v2h-1.1c-.4 2.2-2.2 3.9-4.5 4.1V19h3v2H7v-2h3v-2.3c-2.3-.2-4.1-1.9-4.5-4.1H4v-2h2.5c.4-1.2 1.3-2.1 2.5-2.5V5H9V3z"/></svg>',
            electricite: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M13 2 4 14h7l-1 8 10-14h-7l0-6z"/></svg>',
            bricolage: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M2 20.5 14.5 8l2.5 2.5L4.5 23 2 20.5Zm14.9-9.4 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM16 4l4 4-2 2-4-4 2-2Zm-2 6 2 2-1.4 1.4-2-2L14 10Z"/></svg>',
            jardinage: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22c-1.5-3-2-6-1-9 1-3 4-5 7-5-1 4-3 7-6 9 0 3 0 5 0 5s-2-2-2-5c-3-2-5-5-6-9 3 0 6 2 7 5 1 3 .5 6-1 9Z"/></svg>',
            menage: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 20v-2h16v2H4Zm2-3 2.5-9h7L18 17H6Zm3.5-7 1 3h3l1-3h-5Z"/></svg>',
            beaute: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2c2 3 2 5 0 7-2-2-2-4 0-7Zm-6 8c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5Zm12 0c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5Z"/></svg>',
            numerique: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 5h16v10H4V5Zm2 12h12v2H6v-2Zm2-10v6h8V7H8Z"/></svg>',
            quotidien: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M7 3h10v2H7V3Zm-2 4h14v12H5V7Zm2 2v8h10V9H7Zm1 1h3v2H8v-2Zm0 3h5v2H8v-2Z"/></svg>',
            maison: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 3h6v2h-1v3.1c1.2.4 2.1 1.3 2.5 2.5H19v2h-1.1c-.4 2.2-2.2 3.9-4.5 4.1V19h3v2H7v-2h3v-2.3c-2.3-.2-4.1-1.9-4.5-4.1H4v-2h2.5c.4-1.2 1.3-2.1 2.5-2.5V5H9V3z"/></svg>',
            jardin: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 22c-1.5-3-2-6-1-9 1-3 4-5 7-5-1 4-3 7-6 9 0 3 0 5 0 5s-2-2-2-5c-3-2-5-5-6-9 3 0 6 2 7 5 1 3 .5 6-1 9Z"/></svg>',
            entretien: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 20v-2h16v2H4Zm2-3 2.5-9h7L18 17H6Zm3.5-7 1 3h3l1-3h-5Z"/></svg>',
            transport: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M3 7h11v8H3V7Zm11 2h4l3 3v3h-7V9ZM6 17a2 2 0 1 0 .01 4A2 2 0 0 0 6 17Zm11 0a2 2 0 1 0 .01 4A2 2 0 0 0 17 17Z"/></svg>',
            famille: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Zm7 2a2.4 2.4 0 1 1 0 4.8A2.4 2.4 0 0 1 16 6ZM3 19c0-3 2.4-5 6-5s6 2 6 5H3Zm10.2-4.2c2.6.3 4.8 2 4.8 4.2H21c0-2.4-1.6-4.4-4-5.1-.9-.8-2.1-1.3-3.8-.9Z"/></svg>',
            evenement: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M8 4h8a4 4 0 0 1 1 7.9V20H7v-8.1A4 4 0 0 1 8 4Zm1 12h6v-4H9v4Z"/></svg>'
        });

        function groupVisualFamily(items) {
            const api = familiesApi();
            if (!api) return 'mixed';
            const counts = new Map();
            items.forEach((row) => {
                const id = api.familyForRow(row, leaves);
                counts.set(id, (counts.get(id) || 0) + 1);
            });
            if (counts.size !== 1) return 'mixed';
            return [...counts.keys()][0];
        }

        function pinFaceHtml(group) {
            const count = group.items.length;
            const visual = groupVisualFamily(group.items);
            const api = familiesApi();
            const meta = visual === 'mixed' ? { tone: 'green' } : (api?.familyMeta(visual) || { tone: 'green' });
            const tone = meta.tone === 'yellow' ? 'is-tone-yellow' : 'is-tone-green';
            if (visual === 'mixed') {
                return `<span class="needs-map-pin-face is-multi is-tone-neutral is-mixed" aria-hidden="true">${count}</span>`;
            }
            const icon = FAMILY_ICON[visual] || FAMILY_ICON.quotidien;
            const countBadge = count > 1 ? `<span class="needs-map-pin-count">${count}</span>` : '';
            return `<span class="needs-map-pin-face ${tone} is-family-${visual}${count > 1 ? ' has-count' : ''}" aria-hidden="true">${icon}${countBadge}</span>`;
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
            // Cadre le territoire le plus représenté : mélanger l'Hexagone et l'outre-mer
            // ne doit pas dézoomer sur le monde entier. Toutes les communes d'un même
            // territoire restent dans le cadre (une commune sans code n'est pas un territoire à elle seule).
            const subset = dominantTerritoryGroups(groups);
            const bounds = L.latLngBounds(subset.map((group) => [group.lat, group.lng]));
            if (!bounds.isValid()) return;
            // Marges : épingles (≈ 44 px de haut) au-dessus du point, bouton « Catégories » en bas à gauche.
            // Un quart de niveau de zoom pour le cadrage seulement : les communes remplissent la carte au lieu de flotter au centre.
            const snap = map.options.zoomSnap;
            map.options.zoomSnap = 0.25;
            map.fitBounds(bounds.pad(0.1), { maxZoom: 12, animate: false, paddingTopLeft: [28, 56], paddingBottomRight: [28, 64] });
            map.options.zoomSnap = snap;
        }

        function paint(groups) {
            const L = root.L;
            markerLayer.clearLayers();
            markers.clear();
            groups.forEach((group) => {
                const count = group.items.length;
                const name = `${group.label} : ${countLabel(count)}`;
                const icon = L.divIcon({
                    className: 'needs-map-pin',
                    html: pinFaceHtml(group),
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
            let rows = Array.isArray(data.rows) ? data.rows : [];
            const api = familiesApi();
            if (api && Array.isArray(data.mapFamilyFilter) && data.mapFamilyFilter.length > 0
                && data.mapFamilyFilter.length < api.FAMILIES.length) {
                rows = api.filterRowsByFamilies(rows, data.mapFamilyFilter, leaves);
            }
            const result = groupByCommune(rows, geo);
            const categoriesBtn = shell.querySelector('[data-needs-map-categories]');
            const badge = shell.querySelector('.needs-map-categories-badge');
            const activeCount = Array.isArray(data.mapFamilyFilter) ? data.mapFamilyFilter.length : 0;
            const filterActive = activeCount > 0 && activeCount < (api?.FAMILIES.length || 8);
            if (categoriesBtn) {
                categoriesBtn.classList.toggle('has-active-filters', filterActive);
                categoriesBtn.setAttribute('aria-expanded', data.categorySheetOpen ? 'true' : 'false');
            }
            if (badge) {
                badge.hidden = !filterActive;
                badge.textContent = filterActive ? String(activeCount) : '';
            }

            if (!result.total && rows.length === 0 && Array.isArray(data.rows) && data.rows.length > 0) {
                showState('empty-filter', `<p class="needs-map-state-title">Aucune annonce dans cette catégorie pour le moment.</p>
                    <p>Essayez d'autres catégories ou réinitialisez les filtres.</p>
                    <div class="needs-map-actions"><button type="button" class="btn btn-primary" data-needs-map-clear-categories>Réinitialiser les filtres</button>${listButton}</div>`);
                return;
            }
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
            // Une ligne courte : le détail des annonces sans commune reste dans la liste.
            const note = result.unmapped ? ` · +${result.unmapped} dans la liste` : '';
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
            } else if (button.hasAttribute('data-needs-map-categories')) {
                options.onCategoriesOpen?.();
            } else if (button.hasAttribute('data-needs-map-clear-categories')) {
                options.onClearCategoryFilter?.();
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
        ensureMapLibraries, mount, MAX_PINS, TERRITORY_BOUNDS, territoryOfPoint, dominantTerritoryGroups
    });
    root.LYANN_NEEDS_MAP = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
