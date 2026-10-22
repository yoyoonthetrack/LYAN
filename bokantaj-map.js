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

    function publiclyVisible(post, now = Date.now()) {
        if (!post || post.public_moderation_status !== 'approved' || !publishedPoint(post)) return false;
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
                const style = typeof configured === 'string' && /^https:\/\//.test(configured)
                    ? configured : new URL('assets/maps/lyann-liberty.json', document.baseURI).href;
                layer = window.L.maplibreGL({ style, interactive: false, attributionControl: false }).addTo(instance);
                const gl = layer.getMaplibreMap();
                timer = setTimeout(fail, 15000);
                gl.on('error', fail);
                gl.on('idle', () => {
                    if (failed || !gl.isStyleLoaded() || !gl.areTilesLoaded()) return;
                    clearTimeout(timer); notice.hidden = true;
                    element.dataset.basemap = 'ready';
                });
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
        if (label) label.textContent = savedPlace ? '📍 ' + savedPlace.label : 'Ajouter un lieu (facultatif)';
        const trigger = $('bokantajPlaceTrigger');
        if (trigger) trigger.classList.toggle('has-place', !!savedPlace);
    }

    function setPickerPoint(latlng) {
        const lat = Number(latlng.lat), lng = Number(latlng.lng);
        if (!validPoint({ lat, lng }) || !pickerMap) return;
        pickerPoint = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
        if (pickerMarker) pickerMarker.setLatLng([lat, lng]);
        else {
            pickerMarker = window.L.circleMarker([lat, lng], {
                radius: 11, color: '#285B3E', fillColor: '#E4B44E',
                fillOpacity: 1, weight: 3
            }).addTo(pickerMap);
        }
        if ($('bokantajPickerStatus')) $('bokantajPickerStatus').textContent = 'Repère placé ✓ Ajoutez simplement son nom.';
    }

    function togglePicker(open) {
        const picker = $('bokantajPlacePicker');
        if (!picker) return;
        picker.hidden = !open;
        $('bokantajPlaceTrigger')?.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) return;
        if (!window.L) {
            $('bokantajPickerStatus').textContent = 'Carte momentanément indisponible.';
            return;
        }
        const center = savedPlace
            ? [savedPlace.lat, savedPlace.lng, 14] : selectedCenter();
        if (!pickerMap) {
            pickerMap = setupLeafletMap($('bokantajPickerMap'), center);
            pickerMap.on('click', (event) => setPickerPoint(event.latlng));
        }
        pickerMap.setView([center[0], center[1]], center[2]);
        pickerPoint = null;
        if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
        if (savedPlace) setPickerPoint(savedPlace);
        $('bokantajPlaceName').value = savedPlace?.label || '';
        $('bokantajPickerStatus').textContent = savedPlace
            ? 'Vous pouvez déplacer votre repère ou modifier son nom.'
            : 'Touchez la carte pour choisir un point.';
        requestAnimationFrame(() => pickerMap.invalidateSize());
    }

    function savePlace() {
        const label = $('bokantajPlaceName')?.value.trim() || '';
        if (!pickerPoint) {
            $('bokantajPickerStatus').textContent = 'Touchez d’abord un endroit sur la carte.';
            return;
        }
        if (label.length < 2 || label.length > 90) {
            $('bokantajPickerStatus').textContent = 'Indiquez un nom de quartier ou un repère (2 caractères minimum).';
            $('bokantajPlaceName')?.focus();
            return;
        }
        savedPlace = { ...pickerPoint, label };
        updatePlaceButton();
        togglePicker(false);
    }

    function resetComposerPlace() {
        savedPlace = null;
        pickerPoint = null;
        if (pickerMarker) { pickerMarker.remove(); pickerMarker = null; }
        $('bokantajPlaceName') && ($('bokantajPlaceName').value = '');
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

    function showDetail(post) {
        const panel = $('bokantajMapDetail');
        if (!panel || !post) return;
        detailPostId = String(post.id);
        panel.replaceChildren();
        const category = CATEGORY[post.type] || CATEGORY.info;
        const eyebrow = document.createElement('div');
        eyebrow.className = 'bokantaj-map-eyebrow';
        eyebrow.textContent = category.icon + ' ' + category.label + ' · 📍 ' + post.place_label + ' · ' + compactDate(post.created_at);
        const body = document.createElement('p');
        body.className = 'bokantaj-map-body';
        body.textContent = String(post.content || post.headline || '').slice(0, 2000);
        const bottom = document.createElement('div');
        bottom.className = 'bokantaj-map-detail-actions';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = 'Fermer';
        close.addEventListener('click', () => { panel.hidden = true; map?.closePopup(); });
        bottom.append(close);
        const image = (post.media_urls || []).find((url) => typeof url === 'string'
            && /^https:\/\//i.test(url) && !/\.(mp4|mov|webm)(?:\?|$)/i.test(url));
        panel.append(eyebrow);
        if (image) {
            const img = document.createElement('img');
            img.src = image;
            img.loading = 'lazy';
            img.alt = 'Photo partagée avec cette publication';
            panel.append(img);
        }
        panel.append(body, bottom);
        panel.hidden = false;
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
                            button.textContent = (CATEGORY[post.type] || CATEGORY.info).label + ' · ' + post.place_label + ' — ' + String(post.content || '').slice(0, 70);
                            button.addEventListener('click', () => { map.closePopup(); showDetail(post); });
                            list.append(button);
                        });
                        window.L.popup({ maxWidth: 280, className: 'bokantaj-popup' }).setLatLng([centerLat, centerLng]).setContent(list).openOn(map);
                    }
                } else {
                    window.L.popup({ className: 'bokantaj-popup', closeButton: false, offset: [0, -46] }).setLatLng([centerLat, centerLng]).setContent('<strong>' + escapeText(category.label) + '</strong><br>' + escapeText(first.place_label)).openOn(map);
                    showDetail(first);
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
        $('bokantajPlaceSave').addEventListener('click', savePlace);
        $('bokantajPlaceRemove').addEventListener('click', resetComposerPlace);
        updatePlaceButton();
    }

    window.LYANN_BOKANTAJ_MAP = Object.freeze({
        getComposerPlace() { return savedPlace ? { ...savedPlace } : null; },
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
