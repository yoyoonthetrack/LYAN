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
    const $ = (id) => document.getElementById(id);
    let map;
    let pickerMap;
    let markerLayer;
    let pickerMarker;
    let savedPlace = null;
    let pickerPoint = null;
    let pickerRaw = null;
    let placeNameAuto = false;
    let activeType = 'all';
    let isMapView = false;
    let fetchGeneration = 0;
    let refreshTimer;
    let renderedPosts = [];
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
        const instance = window.L.map(element, {
            zoomControl: false, scrollWheelZoom: false, minZoom: 3, maxZoom: 18,
            touchZoom: true, bounceAtZoomLimits: false, worldCopyJump: true, ...options
        }).setView([center[0], center[1]], center[2]);
        window.L.control.zoom({ position: 'topright', zoomInTitle: 'Zoomer', zoomOutTitle: 'Dézoomer' }).addTo(instance);
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
        if (label) label.textContent = savedPlace ? '📍 ' + savedPlace.label : '📍 Partager une localisation';
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
                : 'Les autres verront le quartier, pas votre position exacte.';
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
        savedPlace = { lat: pub.lat, lng: pub.lng, label, exact: pub.exact };
        updatePlaceButton();
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
        const guessed = suggestPlaceName();
        const input = $('bokantajPlaceName');
        if (input && guessed && (placeNameAuto || !input.value.trim() || input.value.trim() === 'Repère partagé')) {
            input.value = guessed;
            placeNameAuto = true;
            savedPlace = { ...savedPlace, label: guessed };
            updatePlaceButton();
        }
        refreshPlaceSummary(guessed || input?.value.trim() || '');
        if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Repère placé. Localisation enregistrée ✓ Vous pouvez confirmer, déplacer ou retirer.';
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
        if ($('bokantajPlaceExact')) $('bokantajPlaceExact').checked = !!savedPlace?.exact;
        placeNameAuto = false;
        if (savedPlace) setPickerPoint({ lat: savedPlace.exact ? savedPlace.lat : savedPlace.lat, lng: savedPlace.lng });
        if ($('bokantajPlaceName')) $('bokantajPlaceName').value = savedPlace?.label || '';
        refreshPlaceSummary(savedPlace?.label || '');
        $('bokantajPickerStatus').textContent = savedPlace
            ? 'Repère placé. Confirmez, déplacez-le ou retirez-le.'
            : 'Touchez la carte pour choisir un point.';
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
            $('bokantajPickerStatus').textContent = 'Le nom du repère doit comporter entre 2 et 90 caractères.';
            $('bokantajPlaceName')?.focus();
            return;
        }
        const pub = publicCoordinate(pickerRaw?.lat ?? pickerPoint.lat, pickerRaw?.lng ?? pickerPoint.lng, placeWantsExact());
        savedPlace = { lat: pub.lat, lng: pub.lng, label, exact: pub.exact };
        updatePlaceButton();
        togglePicker(false);
    }

    function resetComposerPlace() {
        savedPlace = null;
        pickerPoint = null;
        pickerRaw = null;
        placeNameAuto = false;
        if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
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
        where.textContent = post.place_label || '';
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

    function showDetail(post) {
        const panel = $('bokantajMapDetail');
        if (!panel || !post) return;
        detailPostId = String(post.id);
        panel.replaceChildren(previewCard(post));
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
        window.L.popup({
            className: 'bokantaj-popup',
            closeButton: true,
            maxWidth: 280,
            offset: [0, -46],
            autoPan: true
        }).setLatLng(latlng).setContent(previewCard(post)).openOn(map);
    }

    function paintMarkers(posts) {
        if (!map || !markerLayer) return;
        markerLayer.clearLayers();
        if (!posts.some((p) => String(p.id) === detailPostId)) {
            $('bokantajMapDetail').hidden = true;
            map.closePopup();
        }
        const pixelGroups = new Map();
        const zoom = map.getZoom();
        posts.forEach((post) => {
            const point = map.project([post.place_lat, post.place_lng], zoom);
            const key = Math.floor(point.x / 64) + ':' + Math.floor(point.y / 64);
            if (!pixelGroups.has(key)) pixelGroups.set(key, []);
            pixelGroups.get(key).push(post);
        });
        for (const group of pixelGroups.values()) {
            const centerLat = group.reduce((a, p) => a + Number(p.place_lat), 0) / group.length;
            const centerLng = group.reduce((a, p) => a + Number(p.place_lng), 0) / group.length;
            const first = group[0];
            const crowded = group.length > 1;
            const category = CATEGORY[first.type] || CATEGORY.info;
            const icon = window.L.divIcon({
                className: 'bokantaj-map-pin' + (crowded ? ' is-cluster' : ' category-' + (CATEGORY[first.type] ? first.type : 'info')),
                html: '<span class="bokantaj-pin-face" aria-hidden="true">' + (crowded ? String(group.length) : glyph(first.type)) + '</span>',
                iconSize: [46, 52], iconAnchor: [23, 50], popupAnchor: [0, -46]
            });
            const marker = window.L.marker([centerLat, centerLng], { icon,
                title: crowded ? group.length + ' partages : zoomer ou choisir' : category.label + ' · ' + first.place_label,
                alt: crowded ? group.length + ' partages' : category.label + ' · ' + first.place_label, keyboard: true
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

    function scheduleRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refreshMap, 180);
    }

    async function refreshMap() {
        if (!isMapView || !map) return;
        const client = window.LYANN_API_CLIENT || window.apiClient;
        const status = $('bokantajMapStatus');
        if (!client?.getMappedBokantajPosts) {
            status.textContent = 'Carte indisponible pour le moment.';
            return;
        }
        const gen = ++fetchGeneration;
        const b = map.getBounds().pad(0.07);
        // Avoid an invalid antimeridian bbox.
        const queryBounds = {
            south: Math.max(-90, b.getSouth()), north: Math.min(90, b.getNorth()),
            west: Math.max(-180, b.getWest()), east: Math.min(180, b.getEast())
        };
        if (queryBounds.west >= queryBounds.east) return;
        status.textContent = 'On cherche les partages du coin…';
        try {
            const result = await client.getMappedBokantajPosts(queryBounds);
            if (gen !== fetchGeneration || !isMapView) return;
            if (result?.error) throw new Error(result.error);
            renderedPosts = filteredPosts(result.data);
            paintMarkers(renderedPosts);
            status.textContent = renderedPosts.length
                ? renderedPosts.length + ' partage' + (renderedPosts.length > 1 ? 's' : '') + ' ici · Zoomez pour explorer les quartiers.'
                : 'Aucun partage géolocalisé ici pour le moment. Soyez le premier !';
            if (requestedFocusId) {
                const focus = renderedPosts.find((p) => String(p.id) === requestedFocusId);
                if (focus) {
                    showDetail(focus);
                    requestedFocusId = null;
                }
            }
        } catch (error) {
            if (gen === fetchGeneration) {
                markerLayer.clearLayers();
                map.closePopup();
                $('bokantajMapDetail').hidden = true;
                status.textContent = 'Impossible de charger cette zone. Déplacez la carte pour réessayer.';
            }
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
        fetchGeneration++;
        if (!wantMap) return;
        if (!map) {
            try {
                map = setupLeafletMap($('bokantajMapCanvas'), selectedCenter());
                markerLayer = window.L.layerGroup().addTo(map);
                map.on('moveend', scheduleRefresh);
            } catch (_) {
                $('bokantajMapStatus').textContent = 'Carte indisponible pour le moment.';
                return;
            }
        }
        requestAnimationFrame(() => { map.invalidateSize(); refreshMap(); });
    }

    function showPost(postId, post) {
        requestedFocusId = String(postId);
        switchView('map');
        if (post && validPoint({ lat: Number(post.place_lat), lng: Number(post.place_lng) })) map?.setView([post.place_lat, post.place_lng], 15);
        // Refresh queries visible pins and opens the selected post.
        scheduleRefresh();
    }

    function init() {
        if (!$('bokantajMapSection') || !$('createFlashForm')) return;
        $('bokantajMapTerritory').value = centerForTerritory(window.LYANN_CURRENT_USER_PROFILE?.territory);
        $('bokantajViewFeed').addEventListener('click', () => switchView('feed'));
        $('bokantajViewMap').addEventListener('click', () => switchView('map'));
        $('bokantajMapTerritory').addEventListener('change', () => {
            if (!map) return;
            const c = selectedCenter();
            map.setView([c[0], c[1]], c[2]);
            $('bokantajMapDetail').hidden = true;
        });
        $('bokantajMapFilters').addEventListener('click', (event) => {
            const btn = event.target.closest('[data-map-type]');
            if (!btn) return;
            activeType = btn.dataset.mapType;
            $('bokantajMapFilters').querySelectorAll('button').forEach((item) => {
                item.classList.toggle('is-active', item === btn);
                item.setAttribute('aria-pressed', String(item === btn));
            });
            paintMarkers(filteredPosts(renderedPosts));
            scheduleRefresh();
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
        $('bokantajPlaceSave').addEventListener('click', savePlace);
        $('bokantajPlaceRemove').addEventListener('click', resetComposerPlace);
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
        refresh: scheduleRefresh,
        publiclyVisible,
        publishedPoint,
        centerForTerritory,
        categories: CATEGORY
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
