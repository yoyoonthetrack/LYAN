(function () {
    'use strict';

    // Distances between the viewer and an annonce. Annonce locations are only ever
    // municipality-level, so every distance is an approximation between commune
    // centres and is labelled as such. Nothing is displayed when either end is
    // unknown: no estimated, hashed or default distance is ever invented.

    const FIX_STORAGE_KEY = 'lyann_geo_precise_fix';
    const FIX_TTL_MS = 30 * 60 * 1000;
    const EARTH_RADIUS_KM = 6371;

    // Beyond a territory a distance stops being actionable: the commune name already
    // tells the reader the annonce is somewhere else entirely.
    const PRECISE_FIX_MAX_KM = 300;

    let viewerCommune = null;
    let viewerCode = null;

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\u0153/g, 'oe')
            .replace(/\u00e6/g, 'ae')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    // Requests store "Les Abymes (971 - Guadeloupe)"; profiles store the commune and
    // the territory separately. Both reduce to a department code plus a commune name.
    function parseLocation(text, territoryHint) {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const code = (raw.match(/\b(97\d)\b/) || String(territoryHint || '').match(/\b(97\d)\b/) || [])[1] || null;
        const commune = normalize(raw.replace(/\s*\([^)]*\)\s*/g, ''));
        if (!commune) return null;
        return { commune, code };
    }

    function coordinatesFor(text, territoryHint) {
        const dataset = window.LYANN_COMMUNE_GEO;
        const parsed = parseLocation(text, territoryHint);
        if (!dataset || !parsed) return null;
        if (parsed.code) {
            const exact = dataset[`${parsed.code}|${parsed.commune}`];
            if (exact) return exact;
        }
        // Without a department code, accept the commune name only when it is unique
        // across territories: "Sainte-Anne" and "Saint-Denis" exist in several.
        const suffix = `|${parsed.commune}`;
        const candidates = Object.keys(dataset).filter(key => key.endsWith(suffix));
        return candidates.length === 1 ? dataset[candidates[0]] : null;
    }

    function distanceKm(from, to) {
        const toRad = deg => (deg * Math.PI) / 180;
        const dLat = toRad(to[0] - from[0]);
        const dLon = toRad(to[1] - from[1]);
        const a = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(from[0])) * Math.cos(toRad(to[0])) * Math.sin(dLon / 2) ** 2;
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    function readPreciseFix() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(FIX_STORAGE_KEY) || 'null');
            if (!stored || !Number.isFinite(stored.lat) || !Number.isFinite(stored.lon)) return null;
            if (Date.now() - Number(stored.at) > FIX_TTL_MS) return null;
            return [stored.lat, stored.lon];
        } catch (_) {
            return null;
        }
    }

    function referencePoint() {
        return readPreciseFix() || viewerCommune;
    }

    // Called once the signed-in profile is known. The commune already collected by
    // profile completion gives a reference point without any permission prompt.
    function setViewerLocation(city, territory) {
        viewerCommune = coordinatesFor(city, territory);
        viewerCode = viewerCommune ? parseLocation(city, territory)?.code || null : null;
        return Boolean(viewerCommune);
    }

    async function webCoordinates() {
        if (!navigator.geolocation) return null;
        return new Promise(resolve => {
            navigator.geolocation.getCurrentPosition(
                position => resolve(position.coords),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 8000, maximumAge: FIX_TTL_MS }
            );
        });
    }

    // Only ever triggered by an explicit user action: browsers and app stores both
    // penalise unsolicited location prompts.
    async function requestPreciseLocation() {
        const coords = (window.getNativeCoordinates ? await window.getNativeCoordinates() : null)
            || await webCoordinates();
        if (!coords || !Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude)) return null;
        const fix = { lat: coords.latitude, lon: coords.longitude, at: Date.now() };
        try {
            sessionStorage.setItem(FIX_STORAGE_KEY, JSON.stringify(fix));
        } catch (_) {
            // A blocked storage must not break the in-memory fix below.
        }
        return [fix.lat, fix.lon];
    }

    function hasPreciseLocation() {
        return Boolean(readPreciseFix());
    }

    function clearPreciseLocation() {
        try {
            sessionStorage.removeItem(FIX_STORAGE_KEY);
        } catch (_) { /* nothing to clear */ }
    }

    function formatDistance(km) {
        if (!Number.isFinite(km)) return null;
        if (km < 1) return 'votre commune';
        if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
        return `${Math.round(km)} km`;
    }

    // Returns null whenever the viewer position or the annonce commune is unknown, and
    // whenever the two are not in the same territory.
    function describeDistanceTo(locationText, territoryHint) {
        const precise = readPreciseFix();
        const origin = precise || viewerCommune;
        const target = coordinatesFor(locationText, territoryHint);
        if (!origin || !target) return null;
        const targetCode = parseLocation(locationText, territoryHint)?.code || null;
        if (!precise && viewerCode && targetCode && viewerCode !== targetCode) return null;
        const km = distanceKm(origin, target);
        // A precise fix carries no department code, so an out-of-range value is the
        // only available signal that the annonce is in another territory.
        if (precise && km > PRECISE_FIX_MAX_KM) return null;
        return formatDistance(km);
    }

    window.LYANN_GEO = {
        parseLocation, coordinatesFor, distanceKm, formatDistance,
        referencePoint, setViewerLocation, describeDistanceTo,
        requestPreciseLocation, hasPreciseLocation, clearPreciseLocation
    };
})();
