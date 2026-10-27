/* LYANN — Bokantaj Carte V1. Shared Web + Capacitor iOS artifact.
 * Public map: approved posts only. Explicit human-picked pins, never implicit GPS.
 */
(function () {
    'use strict';

    const CENTERS = Object.freeze({
        guadeloupe: [16.245, -61.55, 11],
        martinique: [14.64, -61.025, 11],
        guyane: [4.91, -52.32, 10],
        reunion: [-21.12, 55.53, 11],
        'saint-martin': [18.07, -63.05, 12]
    });
    // One query per territory, started with the page, so opening the map paints
    // every pin instead of waiting for the visible rectangle.
    const TERRITORY_BOUNDS = Object.freeze({
        guadeloupe: { south: 15.83, north: 16.52, west: -61.82, east: -61.00 },
        martinique: { south: 14.38, north: 14.90, west: -61.24, east: -60.81 },
        guyane: { south: 2.10, north: 5.78, west: -54.60, east: -51.60 },
        reunion: { south: -21.40, north: -20.87, west: 55.20, east: 55.84 },
        'saint-martin': { south: 18.00, north: 18.13, west: -63.16, east: -62.97 }
    });
    const CATEGORY = Object.freeze({
        info: { label: 'Info', icon: '💬' },
        trafic: { label: 'Trafic', icon: '🚗' },
        bon_plan: { label: 'Bon plan', icon: '✨' },
        restaurant: { label: 'Resto', icon: '🍴' },
        avis: { label: 'Avis', icon: '⭐' },
        evenement: { label: 'Sortie', icon: '🎉' },
        alerte: { label: 'Alerte', icon: '⚠️' },
        astuce: { label: 'Astuce', icon: '💡' }
    });
    const TRAFFIC_LIFETIME_MS = 24 * 60 * 60 * 1000;
    const MAX_MARKERS = 250;
    // Radius of the sector drawn around a place shared as a neighbourhood.
    const APPROX_RADIUS_M = 4000;
    const ZONE_STYLE = Object.freeze({
        interactive: false, className: 'bokantaj-map-zone',
        color: '#2f6b45', weight: 2.5, opacity: 0.95, dashArray: '9 7',
        fillColor: '#4A7C59', fillOpacity: 0.18
    });
    const $ = (id) => document.getElementById(id);
    let map;
    let pickerMap;
    let markerLayer;
    let pickerMarker;
    let pickerZone;
    let savedPlace = null;
    let pickerPoint = null;
    let pickerRaw = null;
    let placeNameAuto = false;
    let activeType = 'all';
    let isMapView = false;
    let mapChromeHome = null;
    let fetchGeneration = 0;
    let renderedPosts = [];
    let territoryPosts = [];
    let territorySettled = false;
    let territoryLoad = null;
    let loadedTerritory = null;
    let loadedClient = null;
    let framedTerritory = null;
    let requestedFocusId = null;
    let detailPostId = null;

    function validPoint(value) {
        return !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
            && value.lat >= -90 && value.lat <= 90
            && value.lng >= -180 && value.lng <= 180;
    }

    function publishedPoint(post) {
        const point = { lat: Number(post?.place_lat), lng: Number(post?.place_lng) };
        return post?.place_lat != null && post?.place_lng != null
            && validPoint(point) && typeof post?.place_label === 'string'
            && post.place_label.trim().length >= 2;
    }

    function publicCoordinate(lat, lng, exact) {
        const point = { lat: Number(lat), lng: Number(lng) };
        if (!validPoint(point)) return null;
        if (exact) return { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), exact: true };
        return { lat: +point.lat.toFixed(3), lng: +point.lng.toFixed(3), exact: false };
    }

    // publicCoordinate rounds a neighbourhood share to three decimals and keeps
    // six for an exact point. That stored precision is the only trace of the
    // member's choice, so the sector is drawn from it.
    function sharedAsNeighbourhood(post) {
        const lat = Number(post?.place_lat);
        const lng = Number(post?.place_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return lat === +lat.toFixed(3) && lng === +lng.toFixed(3);
    }

    function publiclyVisible(post, now = Date.now()) {
        if (!post || post.public_moderation_status !== 'approved' || !publishedPoint(post)) return false;
        const policy = window.LYANN_BOKANTAJ_VIDEO;
        if (policy && typeof policy.mapPinVisible === 'function') return policy.mapPinVisible(post, now);
        if (post.type === 'trafic') {
            const created = Date.parse(post.created_at);
            if (!Number.isFinite(created) || now - created > TRAFFIC_LIFETIME_MS) return false;
        }
        return true;
    }

    function centerForTerritory(territory) {
        const t = String(territory || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (t.includes('martinique') || t.includes('972')) return 'martinique';
        if (t.includes('guyane') || t.includes('973')) return 'guyane';
        if (t.includes('reunion') || t.includes('974')) return 'reunion';
        if (t.includes('saint-martin') || t.includes('978')) return 'saint-martin';
        return 'guadeloupe';
    }

    function selectedCenter() {
        return CENTERS[$('bokantajMapTerritory')?.value || centerForTerritory(window.LYANN_CURRENT_USER_PROFILE?.territory)] || CENTERS.guadeloupe;
    }

    function escapeText(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }

    // A public, licensed vector service; no requests to OSM's community raster servers.
    // Override only with an operator-controlled HTTPS style URL (never a secret token).
    function setupLeafletMap(element, center, options = {}) {
        if (!window.L || !element) throw new Error('Carte indisponible sur cet appareil.');
        const { zoomPosition = 'topright', ...mapOptions } = options;
        const instance = window.L.map(element, {
            zoomControl: false, scrollWheelZoom: false, minZoom: 3, maxZoom: 18,
            touchZoom: true, bounceAtZoomLimits: false, worldCopyJump: true, ...mapOptions
        }).setView([center[0], center[1]], center[2]);
        window.L.control.zoom({ position: zoomPosition, zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(instance);
        instance.attributionControl.setPrefix(false);
        instance.attributionControl.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>');
        const notice = document.createElement('div');
        notice.className = 'bokantaj-basemap-notice';
        notice.setAttribute('role', 'status');
        notice.textContent = 'La carte arrive…';
        element.append(notice);
        let layer;
        let timer;
        function loadBasemap() {
            clearTimeout(timer);
            notice.hidden = false;
            notice.replaceChildren(document.createTextNode('La carte arrive…'));
            element.dataset.basemap = 'loading';
            if (layer) { instance.removeLayer(layer); layer = null; }
            let failed = false;
            const fail = () => {
                failed = true;
                clearTimeout(timer);
                element.dataset.basemap = 'error';
                notice.hidden = false;
                notice.replaceChildren(document.createTextNode('Fond de carte indisponible. '));
                const retry = document.createElement('button');
                retry.type = 'button'; retry.textContent = 'Réessayer';
                retry.addEventListener('click', loadBasemap);
                notice.append(retry);
            };
            try {
                const configured = window.LYANN_MAP_STYLE_URL;
                // External operator styles stay untouched. For LYANN's bundled
                // vector style, resolve font glyphs against the running origin
                // (Vercel / iOS Capacitor / Android WebView), never Production.
                const custom = typeof configured === 'string' && /^https:\/\//.test(configured);
                const styleURL = new URL('assets/maps/lyann-liberty.json?v=20261023-chic', document.baseURI);
                const stylePromise = custom ? Promise.resolve(configured) :
                    fetch(styleURL.href, { credentials: 'same-origin' }).then((response) => {
                        if (!response.ok) throw new Error('LYANN vector style unavailable');
                        return response.json();
                    }).then((style) => {
                        if (!style || !Array.isArray(style.layers) || !style.sources?.openmaptiles) {
                            throw new Error('LYANN vector style invalid');
                        }
                        style.glyphs = new URL('assets/maps/glyphs/', document.baseURI).href + '{fontstack}/{range}.pbf';
                        return style;
                    });
                stylePromise.then((style) => {
                    if (failed || !instance._mapPane) return;
                    layer = window.L.maplibreGL({ style, interactive: false, attributionControl: false }).addTo(instance);
                    const gl = layer.getMaplibreMap();
                    instance._lyannGl = gl;
                    gl.on('error', fail);
                    gl.on('idle', () => {
                        if (failed || !gl.isStyleLoaded() || !gl.areTilesLoaded()) return;
                        clearTimeout(timer); notice.hidden = true;
                        element.dataset.basemap = 'ready';
                    });
                }).catch(fail);
                timer = setTimeout(fail, 15000);
            } catch (_) { fail(); }
        }
        window.L.DomEvent.disableClickPropagation(notice);
        window.L.DomEvent.disableScrollPropagation(notice);
        loadBasemap();
        instance.on('unload', () => clearTimeout(timer));
        return instance;
    }

    const GLYPHS = Object.freeze({
        info: '<path d="M5 4h14v12H9l-4 4V4Z"/><path d="M9 8h6M9 12h4"/>',
        trafic: '<path d="m5 10 2-5h10l2 5v8h-3v-3H8v3H5v-8Zm0 0h14"/><path d="M8 12h1m6 0h1"/>',
        bon_plan: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
        restaurant: '<path d="M5 3v6c0 3 6 3 6 0V3M8 3v18M19 21V3c-5 3-5 10 0 10"/>',
        avis: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9L12 3Z"/>',
        evenement: '<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-12 5h3"/>',
        alerte: '<path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v1"/>',
        astuce: '<path d="M8 16c0-3-3-3-3-7a7 7 0 0 1 14 0c0 4-3 4-3 7H8Zm0 3h8m-6 3h4"/>'
    });
    function glyph(type) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GLYPHS[type] || GLYPHS.info) + '</svg>';
    }

    function updatePlaceButton() {
        const label = $('bokantajPlaceTriggerLabel');
        if (label) {
            label.textContent = savedPlace
                ? '📍 ' + savedPlace.label + (savedPlace.exact ? ' · position exacte' : ' · quartier')
                : 'Ajouter une localisation';
        }
        const trigger = $('bokantajPlaceTrigger');
        if (trigger) trigger.classList.toggle('has-place', !!savedPlace);
    }

    function placeWantsExact() {
        return !!$('bokantajPlaceExact')?.checked;
    }

    function refreshPlaceSummary(name) {
        const title = $('bokantajPlaceSummaryTitle');
        const meta = $('bokantajPlaceSummaryMeta');
        const precision = $('bokantajPlaceSummaryPrecision');
        const exact = placeWantsExact();
        if (title) title.textContent = 'Position actuelle';
        if (meta) {
            meta.textContent = pickerPoint
                ? (name || 'Repère sur la carte')
                : 'Touchez la carte ou localisez-vous.';
        }
        if (precision) {
            precision.textContent = exact
                ? 'Le point exact sera visible par les autres.'
                : 'Les autres verront une zone d’environ 4 km autour du quartier, pas votre position exacte.';
        }
    }

    function suggestPlaceName() {
        const gl = pickerMap && pickerMap._lyannGl;
        if (!gl || !pickerRaw || typeof gl.querySourceFeatures !== 'function' || !gl.isStyleLoaded?.()) return '';
        let features = [];
        try {
            features = gl.querySourceFeatures('openmaptiles', { sourceLayer: 'place' }) || [];
        } catch (_) {
            return '';
        }
        const rank = { neighbourhood: 0, suburb: 1, quarter: 2, hamlet: 3, village: 4, town: 5, city: 6 };
        let best = null;
        features.forEach((feature) => {
            const kind = feature.properties && feature.properties.class;
            const coords = feature.geometry && feature.geometry.coordinates;
            const name = feature.properties && (feature.properties['name:latin'] || feature.properties.name);
            if (!(kind in rank) || !coords || !name) return;
            const distance = Math.hypot(coords[1] - pickerRaw.lat, coords[0] - pickerRaw.lng);
            const limit = rank[kind] <= 2 ? 0.06 : 0.2;
            if (distance > limit) return;
            const score = distance + rank[kind] * 0.01;
            if (!best || score < best.score) best = { score, name: String(name).trim() };
        });
        return best ? best.name.slice(0, 90) : '';
    }

    function setPickerPoint(latlng) {
        const lat = Number(latlng.lat), lng = Number(latlng.lng);
        if (!validPoint({ lat, lng }) || !pickerMap) return;
        pickerRaw = { lat, lng };
        const pub = publicCoordinate(lat, lng, placeWantsExact());
        pickerPoint = { lat: pub.lat, lng: pub.lng };
        const typed = $('bokantajPlaceName')?.value.trim() || '';
        const kept = savedPlace && savedPlace.label && savedPlace.label !== 'Repère partagé' ? savedPlace.label : '';
        const label = typed.length >= 2 ? typed : (kept || 'Repère partagé');
        if ($('bokantajPlaceName') && !$('bokantajPlaceName').value.trim()) $('bokantajPlaceName').value = label;
        const icon = window.L.divIcon({
            className: 'bokantaj-picker-pin',
            html: '<span></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });
        if (pickerMarker) pickerMarker.setLatLng([pub.lat, pub.lng]);
        else {
            pickerMarker = window.L.marker([pub.lat, pub.lng], { icon, draggable: true, keyboard: true, title: 'Repère' }).addTo(pickerMap);
            pickerMarker.on('dragend', () => {
                const next = pickerMarker.getLatLng();
                setPickerPoint(next);
            });
        }
        // A neighbourhood share is a perimeter, not a hidden point: the pin sits
        // in the middle of the same 4 km circle the public map will draw.
        const showZone = !placeWantsExact();
        const hadZone = !!pickerZone;
        if (showZone) {
            if (pickerZone) pickerZone.setLatLng([pub.lat, pub.lng]);
            else pickerZone = window.L.circle([pub.lat, pub.lng], { ...ZONE_STYLE, radius: APPROX_RADIUS_M }).addTo(pickerMap);
            if (!hadZone) pickerMap.fitBounds(pickerZone.getBounds(), { padding: [28, 28], maxZoom: 13, animate: false });
        } else if (pickerZone) {
            pickerZone.remove();
            pickerZone = null;
            if (hadZone) pickerMap.setView([pub.lat, pub.lng], 16, { animate: false });
        }
        const guessed = suggestPlaceName();
        const input = $('bokantajPlaceName');
        if (input && guessed && (placeNameAuto || !input.value.trim() || input.value.trim() === 'Repère partagé')) {
            input.value = guessed;
            placeNameAuto = true;
        }
        refreshPlaceSummary(guessed || input?.value.trim() || '');
        if ($('bokantajPickerStatus')) {
            $('bokantajPickerStatus').textContent = (guessed || input?.value.trim() || label)
                + ' · choisissez le quartier (zone d’environ 4 km) ou le point exact.';
        }
        const gl = pickerMap._lyannGl;
        if (gl && typeof gl.once === 'function' && !guessed) {
            gl.once('idle', () => {
                if (!pickerRaw) return;
                const later = suggestPlaceName();
                const field = $('bokantajPlaceName');
                if (!later || !field || (!placeNameAuto && field.value.trim())) return;
                field.value = later;
                placeNameAuto = true;
                refreshPlaceSummary(later);
            });
        }
    }

    function togglePicker(open) {
        const picker = $('bokantajPlacePicker');
        if (!picker) return;
        const wasOpen = !picker.hidden;
        picker.hidden = !open;
        $('bokantajPlaceTrigger')?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && !wasOpen) {
            try { history.pushState({ bokantajPicker: 1 }, ''); } catch (_) {}
        }
        if (!open) return;
        if (!window.L) {
            $('bokantajPickerStatus').textContent = 'Carte momentanément indisponible.';
            return;
        }
        const center = savedPlace
            ? [savedPlace.lat, savedPlace.lng, 14] : selectedCenter();
        if (!pickerMap) {
            const pickerElement = $('bokantajPickerMap');
            pickerMap = setupLeafletMap(pickerElement, center);
            pickerMap.on('click', (event) => setPickerPoint(event.latlng));
            // On WebViews, MapLibre's overlay can swallow Leaflet's synthetic
            // touch click. Capture deliberate taps on the picker container;
            // avoid selecting a pin when the user pans/zooms the map.
            let touchStart = null;
            pickerElement.addEventListener('pointerdown', (event) => {
                if (event.pointerType !== 'touch' || !event.isPrimary) return;
                if (event.target.closest?.('.leaflet-control')) return;
                touchStart = { x: event.clientX, y: event.clientY, at: Date.now() };
            }, true);
            pickerElement.addEventListener('pointerup', (event) => {
                const start = touchStart;
                touchStart = null;
                if (!start || event.pointerType !== 'touch' || !event.isPrimary) return;
                if (event.target.closest?.('.leaflet-control, .bokantaj-basemap-notice')) return;
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12 || Date.now() - start.at > 650) return;
                const rect = pickerElement.getBoundingClientRect();
                const point = pickerMap.containerPointToLatLng([event.clientX - rect.left, event.clientY - rect.top]);
                setPickerPoint(point);
            }, true);
            pickerElement.addEventListener('pointercancel', () => { touchStart = null; }, true);
        }
        pickerMap.setView([center[0], center[1]], center[2]);
        pickerPoint = null;
        pickerRaw = null;
        if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
        if (pickerZone) { pickerZone.remove(); pickerZone = null; }
        if ($('bokantajPlaceExact')) $('bokantajPlaceExact').checked = !!savedPlace?.exact;
        placeNameAuto = false;
        if (savedPlace) setPickerPoint({ lat: savedPlace.exact ? savedPlace.lat : savedPlace.lat, lng: savedPlace.lng });
        if ($('bokantajPlaceName')) $('bokantajPlaceName').value = savedPlace?.label || '';
        refreshPlaceSummary(savedPlace?.label || '');
        $('bokantajPickerStatus').textContent = savedPlace
            ? (savedPlace.label + ' · touchez la carte pour déplacer, puis choisissez comment partager.')
            : 'Touchez la carte, puis choisissez comment la partager.';
        requestAnimationFrame(() => pickerMap.invalidateSize());
    }

    function readPosition() {
        const plugin = window.Capacitor?.Plugins?.Geolocation;
        if (plugin && typeof plugin.getCurrentPosition === 'function') {
            return plugin.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 }).then((position) => ({
                lat: position.coords.latitude,
                lng: position.coords.longitude
            }));
        }
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('unavailable'));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
                reject,
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
            );
        });
    }

    async function locateMe() {
        const button = $('bokantajLocateMe');
        $('bokantajPickOnMap')?.setAttribute('aria-pressed', 'false');
        button?.setAttribute('aria-pressed', 'true');
        if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Recherche de votre position…';
        try {
            const position = await readPosition();
            if (!pickerMap || !validPoint(position)) throw new Error('invalid');
            pickerMap.setView([position.lat, position.lng], 16);
            setPickerPoint(position);
        } catch (error) {
            button?.setAttribute('aria-pressed', 'false');
            $('bokantajPickOnMap')?.setAttribute('aria-pressed', 'true');
            const denied = error && (error.code === 1 || /denied|permission/i.test(String(error.message || '')));
            if ($('bokantajPickerStatus')) {
                $('bokantajPickerStatus').textContent = denied
                    ? 'La localisation est restée privée. Choisissez un endroit sur la carte.'
                    : 'Position introuvable. Choisissez un endroit sur la carte.';
            }
        }
    }

    function savePlace() {
        const label = $('bokantajPlaceName')?.value.trim() || savedPlace?.label || 'Repère partagé';
        if (!pickerPoint) {
            $('bokantajPickerStatus').textContent = 'Touchez d’abord un endroit sur la carte.';
            return;
        }
        if (label.length < 2 || label.length > 90) {
            $('bokantajPickerStatus').textContent = 'Touchez d’abord un endroit sur la carte.';
            return;
        }
        const pub = publicCoordinate(pickerRaw?.lat ?? pickerPoint.lat, pickerRaw?.lng ?? pickerPoint.lng, placeWantsExact());
        savedPlace = { lat: pub.lat, lng: pub.lng, label, exact: pub.exact };
        updatePlaceButton();
        togglePicker(false);
        revealComposer();
    }

    // The picker sits below the writing field. Closing it must bring that
    // field and Publier back, without jumping the page to the top or rebuilding
    // the form.
    function revealComposer() {
        const card = $('flashComposerCard');
        const publish = $('bokantajPublish');
        if (!card) return;
        const header = document.querySelector('.lyann-page-header') || document.querySelector('nav.navbar');
        const topLimit = (header ? Math.round(header.getBoundingClientRect().bottom) : 0) + 8;
        const bottomLimit = Math.round((window.visualViewport && window.visualViewport.height) || window.innerHeight) - 12;
        const cardTop = card.getBoundingClientRect().top;
        const publishBottom = publish ? publish.getBoundingClientRect().bottom : card.getBoundingClientRect().bottom;
        let delta = 0;
        if (publishBottom > bottomLimit) delta = publishBottom - bottomLimit;
        const nextTop = cardTop - delta;
        if (nextTop < topLimit && (publishBottom - delta) <= bottomLimit) delta = cardTop - topLimit;
        if (Math.abs(delta) > 1) window.scrollBy(0, delta);
        const field = card.querySelector('textarea');
        if (document.activeElement && document.activeElement !== field && card.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    }

    function sharePlace(exact) {
        if ($('bokantajPlaceExact')) $('bokantajPlaceExact').checked = !!exact;
        if (pickerRaw) setPickerPoint(pickerRaw);
        savePlace();
    }

    function resetComposerPlace() {
        savedPlace = null;
        pickerPoint = null;
        pickerRaw = null;
        placeNameAuto = false;
        if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
        if (pickerZone) { pickerZone.remove(); pickerZone = null; }
        if ($('bokantajPlaceName')) $('bokantajPlaceName').value = '';
        if ($('bokantajPlaceExact')) $('bokantajPlaceExact').checked = false;
        refreshPlaceSummary('');
        updatePlaceButton();
        togglePicker(false);
    }

    function filteredPosts(posts) {
        return (Array.isArray(posts) ? posts : [])
            .filter((post) => publiclyVisible(post))
            .filter((post) => activeType === 'all' || post.type === activeType)
            .slice(0, MAX_MARKERS);
    }

    function compactDate(createdAt) {
        const date = new Date(createdAt);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function excerpt(post) {
        return String(post?.content || post?.headline || '').replace(/\s+/g, ' ').trim();
    }

    function authorLabel(post) {
        const name = String(post?.author_name || '').trim();
        return name || 'Lyanneur';
    }

    async function openInFeed(post) {
        if (!post || post.public_moderation_status !== 'approved') {
            if ($('bokantajMapStatus')) $('bokantajMapStatus').textContent = 'Cette publication n’est plus disponible.';
            return;
        }
        map?.closePopup();
        switchView('feed');
        const reveal = window.LYANN_BOKANTAJ_FEED && window.LYANN_BOKANTAJ_FEED.revealPost;
        if (typeof reveal !== 'function') return;
        const result = await reveal(post.id);
        if (!result?.ok && $('bokantajMapStatus')) {
            $('bokantajMapStatus').textContent = 'Cette publication n’est plus disponible.';
        }
    }

    function previewCard(post) {
        const category = CATEGORY[post.type] || CATEGORY.info;
        const card = document.createElement('div');
        card.className = 'bokantaj-preview';
        const kicker = document.createElement('div');
        kicker.className = 'bokantaj-preview-kicker';
        kicker.textContent = category.icon + ' ' + category.label + ' · ' + authorLabel(post);
        const where = document.createElement('div');
        where.className = 'bokantaj-preview-place';
        where.textContent = (post.place_label || '')
            + (sharedAsNeighbourhood(post) ? ' · secteur d’environ 4 km' : '');
        const body = document.createElement('p');
        body.className = 'bokantaj-preview-excerpt';
        body.textContent = excerpt(post);
        const when = document.createElement('time');
        when.dateTime = post.created_at || '';
        when.textContent = compactDate(post.created_at);
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'bokantaj-preview-open';
        open.textContent = 'Voir le Bokantaj';
        open.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openInFeed(post);
        });
        card.append(kicker, where, body, when, open);
        return card;
    }

    // The sheet covers the lower part of the map, so it needs its own way out.
    function closeDetailButton(panel) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'bokantaj-map-detail-close';
        close.setAttribute('aria-label', 'Fermer l’aperçu');
        close.innerHTML = '<i class="ph ph-x" aria-hidden="true"></i>';
        close.addEventListener('click', () => {
            panel.hidden = true;
            detailPostId = '';
            map?.closePopup();
        });
        return close;
    }

    function showDetail(post) {
        const panel = $('bokantajMapDetail');
        if (!panel || !post) return;
        detailPostId = String(post.id);
        panel.replaceChildren(previewCard(post), closeDetailButton(panel));
        const image = (post.media_urls || []).find((url) => typeof url === 'string'
            && /^https:\/\//i.test(url) && !/\.(mp4|mov|webm)(?:\?|$)/i.test(url));
        if (image) {
            const img = document.createElement('img');
            img.src = image;
            img.loading = 'lazy';
            img.alt = 'Photo partagée avec cette publication';
            img.onerror = () => img.remove();
            panel.insertBefore(img, panel.querySelector('.bokantaj-preview-open'));
        }
        panel.hidden = false;
    }

    function openPreview(post, latlng) {
        showDetail(post);
        if (!map) return;
        // The sheet already carries the card: a bubble would repeat it and hide
        // the map. Only slide the pin clear of the chips and of the sheet.
        map.closePopup();
        if (typeof map.panInside === 'function') {
            map.panInside(window.L.latLng(latlng[0], latlng[1]), {
                paddingTopLeft: [40, 130],
                paddingBottomRight: [40, 230]
            });
        }
    }

    function paintMarkers(posts) {
        if (!map || !markerLayer) return;
        markerLayer.clearLayers();
        if (!posts.some((p) => String(p.id) === detailPostId)) {
            $('bokantajMapDetail').hidden = true;
            map.closePopup();
        }
        // Drawn before the pins: Leaflet keeps vector shapes in the overlay pane,
        // under the marker pane, so the pin stays on top of its own sector.
        const zones = new Set();
        posts.forEach((post) => {
            if (!sharedAsNeighbourhood(post)) return;
            const key = post.place_lat + ',' + post.place_lng;
            if (zones.has(key)) return;
            zones.add(key);
            window.L.circle([Number(post.place_lat), Number(post.place_lng)],
                { ...ZONE_STYLE, radius: APPROX_RADIUS_M }).addTo(markerLayer);
        });
        // A quartier share keeps its pin on the centre of the circle. Mixing it
        // into a nearby cluster would slide that pin off the perimeter.
        const groups = [];
        const areaGroups = new Map();
        posts.forEach((post) => {
            if (!sharedAsNeighbourhood(post)) return;
            const key = post.place_lat + ',' + post.place_lng;
            if (!areaGroups.has(key)) areaGroups.set(key, []);
            areaGroups.get(key).push(post);
        });
        for (const group of areaGroups.values()) groups.push({ group, area: true });
        const pixelGroups = new Map();
        const zoom = map.getZoom();
        posts.forEach((post) => {
            if (sharedAsNeighbourhood(post)) return;
            const point = map.project([post.place_lat, post.place_lng], zoom);
            const key = Math.floor(point.x / 64) + ':' + Math.floor(point.y / 64);
            if (!pixelGroups.has(key)) pixelGroups.set(key, []);
            pixelGroups.get(key).push(post);
        });
        for (const group of pixelGroups.values()) groups.push({ group, area: false });
        for (const entry of groups) {
            const group = entry.group;
            const area = entry.area;
            const centerLat = area ? Number(group[0].place_lat) : group.reduce((a, p) => a + Number(p.place_lat), 0) / group.length;
            const centerLng = area ? Number(group[0].place_lng) : group.reduce((a, p) => a + Number(p.place_lng), 0) / group.length;
            const first = group[0];
            const crowded = group.length > 1;
            const category = CATEGORY[first.type] || CATEGORY.info;
            const placeTitle = category.label + ' · ' + first.place_label + (area ? ' · secteur d’environ 4 km' : '');
            const icon = window.L.divIcon({
                className: 'bokantaj-map-pin' + (area ? ' is-area' : '') + (crowded ? ' is-cluster' : ' category-' + (CATEGORY[first.type] ? first.type : 'info')),
                html: '<span class="bokantaj-pin-face" aria-hidden="true">' + (crowded ? String(group.length) : glyph(first.type)) + '</span>',
                iconSize: [46, 52], iconAnchor: [23, 50], popupAnchor: [0, -46]
            });
            const marker = window.L.marker([centerLat, centerLng], { icon, zIndexOffset: area ? 400 : 0,
                title: crowded ? group.length + ' partages : zoomer ou choisir' : placeTitle,
                alt: crowded ? group.length + ' partages' : placeTitle, keyboard: true
            });
            marker.addTo(markerLayer);
            // Leaflet's keyboard flag makes a marker focusable; activation must be
            // wired explicitly because these popups belong to the map, not bindPopup.
            marker.getElement()?.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                marker.fire('click');
            });
            marker.on('click', () => {
                if (crowded) {
                    if (map.getZoom() < 18) map.setView([centerLat, centerLng], Math.min(18, map.getZoom() + 2));
                    else {
                        detailPostId = String(first.id);
                        $('bokantajMapDetail').hidden = true;
                        const list = document.createElement('div');
                        list.className = 'bokantaj-cluster-list';
                        group.forEach((post) => {
                            const button = document.createElement('button');
                            button.type = 'button';
                            const categoryName = (CATEGORY[post.type] || CATEGORY.info).label;
                            button.textContent = categoryName + ' · ' + authorLabel(post) + ' — ' + excerpt(post).slice(0, 70);
                            button.addEventListener('click', () => {
                                map.closePopup();
                                openPreview(post, [Number(post.place_lat), Number(post.place_lng)]);
                            });
                            list.append(button);
                        });
                        window.L.popup({ maxWidth: 280, className: 'bokantaj-popup' }).setLatLng([centerLat, centerLng]).setContent(list).openOn(map);
                    }
                } else {
                    openPreview(first, [centerLat, centerLng]);
                }
            });
        }
    }

    function currentTerritory() {
        const key = $('bokantajMapTerritory')?.value || centerForTerritory(window.LYANN_CURRENT_USER_PROFILE?.territory);
        return { key, bounds: TERRITORY_BOUNDS[key] || TERRITORY_BOUNDS.guadeloupe };
    }

    function paintTerritory(refit) {
        if (!map || !markerLayer) return;
        renderedPosts = filteredPosts(territoryPosts);
        const size = map.getSize();
        if (refit && renderedPosts.length && size.x > 0 && size.y > 0) {
            const bounds = window.L.latLngBounds([]);
            renderedPosts.forEach((post) => {
                const lat = Number(post.place_lat);
                const lng = Number(post.place_lng);
                bounds.extend([lat, lng]);
                if (!sharedAsNeighbourhood(post)) return;
                const dLat = APPROX_RADIUS_M / 111320;
                const dLng = APPROX_RADIUS_M / (111320 * Math.cos(lat * Math.PI / 180));
                bounds.extend([lat - dLat, lng - dLng]);
                bounds.extend([lat + dLat, lng + dLng]);
            });
            // The territory pill, the category chips and the basemap notice sit
            // on the tiles. Inset the frame so a pin never opens underneath them.
            map.fitBounds(bounds.pad(0.2), {
                maxZoom: 13,
                animate: false,
                paddingTopLeft: [28, 210],
                paddingBottomRight: [28, 88]
            });
            framedTerritory = currentTerritory().key;
        }
        paintMarkers(renderedPosts);
        const status = $('bokantajMapStatus');
        if (status) {
            const areas = renderedPosts.some(sharedAsNeighbourhood);
            status.textContent = renderedPosts.length
                ? renderedPosts.length + ' partage' + (renderedPosts.length > 1 ? 's' : '') + ' ici · '
                    + (areas ? 'un quartier est le pin au centre d’un rayon d’environ 4 km.' : 'Zoomez pour explorer les quartiers.')
                : 'Aucun partage géolocalisé ici pour le moment. Soyez le premier !';
        }
        if (requestedFocusId) {
            const focus = renderedPosts.find((post) => String(post.id) === requestedFocusId);
            if (focus) {
                showDetail(focus);
                requestedFocusId = null;
            }
        }
    }

    // Started as soon as the page is ready, so the pins are already here when
    // the member opens the map. The whole territory comes back in one query.
    function loadTerritoryPosts() {
        const { key, bounds } = currentTerritory();
        const client = window.LYANN_API_CLIENT || window.apiClient;
        const fetchPosts = client?.getMappedBokantajPosts || null;
        if (territoryLoad && loadedTerritory === key && loadedClient === fetchPosts) {
            if (isMapView && map && territorySettled) paintTerritory(framedTerritory !== key);
            return territoryLoad;
        }
        loadedTerritory = key;
        loadedClient = fetchPosts;
        const status = $('bokantajMapStatus');
        if (!fetchPosts) {
            if (status) status.textContent = 'Carte indisponible pour le moment.';
            territoryLoad = Promise.resolve();
            return territoryLoad;
        }
        const gen = ++fetchGeneration;
        if (isMapView && status && !territoryPosts.length) status.textContent = 'On cherche les partages du coin…';
        territoryLoad = fetchPosts.call(client, bounds).then((result) => {
            if (gen !== fetchGeneration) return;
            if (result?.error) throw new Error(result.error);
            territoryPosts = Array.isArray(result.data) ? result.data : [];
            territorySettled = true;
            if (isMapView && map) paintTerritory(framedTerritory !== key);
            if (map) window.LYANN_BUSINESS_MAP?.refresh(map, bounds, () => gen === fetchGeneration && isMapView);
        }).catch(() => {
            if (gen !== fetchGeneration) return;
            territoryLoad = null;
            loadedTerritory = null;
            loadedClient = null;
            territorySettled = false;
            if (isMapView && markerLayer) {
                markerLayer.clearLayers();
                map?.closePopup();
                if ($('bokantajMapDetail')) $('bokantajMapDetail').hidden = true;
                if (status) status.textContent = 'Impossible de charger cette zone. Déplacez la carte pour réessayer.';
            }
        });
        return territoryLoad;
    }

    // The app shell and the public web page do not use the same header, so the
    // pinned bar reads the real one instead of assuming a height.
    function syncShellHeaderHeight() {
        const header = document.querySelector('.lyann-page-header') || document.querySelector('nav.navbar');
        const height = header ? Math.round(header.getBoundingClientRect().height) : 0;
        if (height) document.documentElement.style.setProperty('--lyann-shell-header-height', height + 'px');
    }

    // On a phone the map takes the whole panel and the page stops scrolling, so
    // Fil/Carte has to be pinned: it is the only way back to the feed.
    function parkMapChrome(wantMap) {
        const tabs = document.querySelector('.bokantaj-view-tabs');
        const mapPanel = $('bokantajMapSection');
        const narrow = window.matchMedia('(max-width: 767px)').matches;
        if (wantMap && narrow && tabs && mapPanel && !mapChromeHome) {
            mapChromeHome = {
                tabsParent: tabs.parentNode,
                tabsNext: tabs.nextSibling,
                mapParent: mapPanel.parentNode,
                mapNext: mapPanel.nextSibling
            };
            // Fixed layers inside the feed section collapse on iOS. On the
            // body they use the real screen, under the app header.
            document.body.appendChild(tabs);
            document.body.appendChild(mapPanel);
        }
        if (!wantMap && mapChromeHome && tabs && mapPanel) {
            mapChromeHome.tabsParent.insertBefore(tabs, mapChromeHome.tabsNext);
            mapChromeHome.mapParent.insertBefore(mapPanel, mapChromeHome.mapNext);
            mapChromeHome = null;
        }
    }

    function pinViewTabs(wantMap) {
        syncShellHeaderHeight();
        if (wantMap) window.scrollTo(0, 0);
        parkMapChrome(wantMap);
        document.body.classList.toggle('bokantaj-map-open', wantMap);
        const tabs = document.querySelector('.bokantaj-view-tabs');
        if (tabs && wantMap) {
            const height = Math.round(tabs.getBoundingClientRect().height);
            if (height) document.documentElement.style.setProperty('--lyann-map-tabs-height', height + 'px');
        }
    }

    function switchView(view) {
        const wantMap = view === 'map';
        isMapView = wantMap;
        const feed = $('bokantajFeedSection');
        const mapPanel = $('bokantajMapSection');
        if (!feed || !mapPanel) return;
        feed.hidden = wantMap;
        mapPanel.hidden = !wantMap;
        $('bokantajViewFeed')?.classList.toggle('is-selected', !wantMap);
        $('bokantajViewMap')?.classList.toggle('is-selected', wantMap);
        $('bokantajViewFeed')?.setAttribute('aria-selected', wantMap ? 'false' : 'true');
        $('bokantajViewMap')?.setAttribute('aria-selected', wantMap ? 'true' : 'false');
        pinViewTabs(wantMap);
        if (!wantMap) return;
        if (!map) {
            try {
                // Zoom sits low: the category band now occupies the top of the map.
                map = setupLeafletMap($('bokantajMapCanvas'), selectedCenter(), { zoomPosition: 'bottomright' });
                markerLayer = window.L.layerGroup().addTo(map);
                // Panning stays on the pins already loaded. Only a zoom changes
                // how neighbours share a pin, so that is all that gets repainted.
                map.on('zoomend', () => { if (territoryPosts.length) paintTerritory(false); });
                map.on('click', () => { $('bokantajMapDetail').hidden = true; });
            } catch (_) {
                $('bokantajMapStatus').textContent = 'Carte indisponible pour le moment.';
                return;
            }
        }
        requestAnimationFrame(() => {
            map.invalidateSize(false);
            if (territorySettled) paintTerritory(framedTerritory !== currentTerritory().key);
            else if ($('bokantajMapStatus')) $('bokantajMapStatus').textContent = 'On cherche les partages du coin…';
        });
        loadTerritoryPosts();
    }

    function showPost(postId, post) {
        requestedFocusId = String(postId);
        switchView('map');
        const known = territoryPosts.find((item) => String(item.id) === requestedFocusId) || post;
        if (known && validPoint({ lat: Number(known.place_lat), lng: Number(known.place_lng) })) {
            map?.setView([Number(known.place_lat), Number(known.place_lng)], 15);
        }
        if (territoryPosts.some((item) => String(item.id) === requestedFocusId)) {
            paintTerritory(false);
            return;
        }
        loadTerritoryPosts();
    }

    function init() {
        if (!$('bokantajMapSection') || !$('createFlashForm')) return;
        $('bokantajMapTerritory').value = centerForTerritory(window.LYANN_CURRENT_USER_PROFILE?.territory);
        syncShellHeaderHeight();
        window.addEventListener('resize', () => {
            syncShellHeaderHeight();
            if (isMapView) pinViewTabs(true);
        });
        // Coming back from the map should land where the member left the feed.
        let feedScrollY = 0;
        $('bokantajViewFeed').addEventListener('click', () => {
            switchView('feed');
            if (feedScrollY) requestAnimationFrame(() => window.scrollTo(0, feedScrollY));
        });
        $('bokantajViewMap').addEventListener('click', () => {
            feedScrollY = window.scrollY;
            switchView('map');
        });
        $('bokantajMapTerritory').addEventListener('change', () => {
            territoryPosts = [];
            territorySettled = false;
            territoryLoad = null;
            loadedTerritory = null;
            loadedClient = null;
            framedTerritory = null;
            if ($('bokantajMapDetail')) $('bokantajMapDetail').hidden = true;
            if (map) {
                const center = selectedCenter();
                map.setView([center[0], center[1]], center[2]);
            }
            loadTerritoryPosts();
            window.LYANN_BOKANTAJ_PLACE?.choose?.($('bokantajMapTerritory').value, 'map');
        });
        $('bokantajMapFilters').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-map-type]');
            if (!btn) return;
            activeType = btn.dataset.mapType;
            $('bokantajMapFilters').querySelectorAll('button').forEach((item) => {
                item.classList.toggle('is-active', item === btn);
                item.setAttribute('aria-pressed', String(item === btn));
            });
            paintTerritory(false);
        });
        document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-bokantaj-map-post]');
            if (!button) return;
            event.preventDefault();
            showPost(button.dataset.bokantajMapPost, {
                place_lat: Number(button.dataset.mapLat),
                place_lng: Number(button.dataset.mapLng)
            });
        });
        $('bokantajPlaceTrigger').addEventListener('click', () =>
            togglePicker($('bokantajPlacePicker').hidden));
        $('bokantajLocateMe')?.addEventListener('click', () => locateMe());
        $('bokantajPickOnMap')?.addEventListener('click', () => {
            $('bokantajLocateMe')?.setAttribute('aria-pressed', 'false');
            $('bokantajPickOnMap')?.setAttribute('aria-pressed', 'true');
            if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Déplacez la carte, puis touchez l’endroit.';
        });
        $('bokantajPlaceExact')?.addEventListener('change', () => {
            if (pickerRaw) setPickerPoint(pickerRaw);
            else refreshPlaceSummary($('bokantajPlaceName')?.value.trim() || '');
        });
        $('bokantajPlaceName')?.addEventListener('input', () => {
            placeNameAuto = false;
            refreshPlaceSummary($('bokantajPlaceName').value.trim());
        });
        $('bokantajPlaceMove')?.addEventListener('click', () => {
            if (!pickerMap || !pickerPoint) {
                if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Touchez d’abord un endroit sur la carte.';
                return;
            }
            pickerMap.setView([pickerPoint.lat, pickerPoint.lng], Math.max(pickerMap.getZoom(), 16));
            if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Repère placé. Faites-le glisser ou touchez un autre endroit.';
        });
        $('bokantajPlaceSave')?.addEventListener('click', savePlace);
        $('bokantajShareQuarter')?.addEventListener('click', () => sharePlace(false));
        $('bokantajShareExact')?.addEventListener('click', () => sharePlace(true));
        $('bokantajPlaceRemove')?.addEventListener('click', resetComposerPlace);
        window.addEventListener('popstate', () => {
            if ($('bokantajPlacePicker') && !$('bokantajPlacePicker').hidden) togglePicker(false);
        });
        const app = window.Capacitor?.Plugins?.App;
        if (app && typeof app.addListener === 'function') {
            app.addListener('backButton', () => {
                if ($('bokantajPlacePicker') && !$('bokantajPlacePicker').hidden) {
                    togglePicker(false);
                    return;
                }
                if (isMapView) switchView('feed');
            });
        }
        updatePlaceButton();
        const place = window.LYANN_BOKANTAJ_PLACE;
        if (place && typeof place.ready === 'function') {
            place.ready().then((key) => {
                if (key && key !== 'all') setTerritory(key);
                else loadTerritoryPosts();
            });
        } else {
            loadTerritoryPosts();
        }
    }

    function setTerritory(key) {
        const select = $('bokantajMapTerritory');
        if (!select || !TERRITORY_BOUNDS[key]) return;
        if (select.value === key && territoryLoad && loadedTerritory === key) return;
        const changed = select.value !== key;
        select.value = key;
        if (changed) {
            territoryPosts = [];
            territorySettled = false;
            territoryLoad = null;
            loadedTerritory = null;
            loadedClient = null;
            framedTerritory = null;
            if ($('bokantajMapDetail')) $('bokantajMapDetail').hidden = true;
            if (map) {
                const center = selectedCenter();
                map.setView([center[0], center[1]], center[2]);
            }
        }
        loadTerritoryPosts();
    }

    window.LYANN_BOKANTAJ_MAP = Object.freeze({
        getComposerPlace() {
            const typed = $('bokantajPlaceName')?.value.trim() || '';
            if (!savedPlace) return null;
            const label = typed.length >= 2 && typed.length <= 90 ? typed : savedPlace.label;
            return { ...savedPlace, label };
        },
        publicCoordinate,
        resetComposerPlace,
        showPost,
        switchView,
        setTerritory,
        refresh: loadTerritoryPosts,
        publiclyVisible,
        publishedPoint,
        centerForTerritory,
        categories: CATEGORY
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
