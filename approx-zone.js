/* LYANN — Approximate mission zones (engine).
 *
 * A zone is a public sector of a fixed, versioned grid. It is identified by a stable
 * id such as "971-v1-a-12.34" (territory, referential version, level, cell index).
 *
 * Privacy contract
 *  - A zone id carries NO coordinate of a member: it names a sector shared by everybody
 *    who lives in it. Nothing in this module stores or returns the point it is given.
 *  - An id is accepted only if it is listed in the versioned referential, which is built
 *    from official commune contours (see scripts/build-approx-zone-referential.js). A
 *    well-formed id is never enough, and a distance to a commune centre is never a proof.
 *  - Territories without a selectable referential (Guyane, Saint-Martin, Mayotte,
 *    Saint-Barthélemy) are refused for zones. Their existing commune-level location
 *    keeps working unchanged.
 *  - Nothing here is random.
 *
 * Versions. Every loaded referential stays readable, so a stored id keeps its meaning.
 * Only the versions listed in `selectableVersions` (V2 by default) may be chosen for a
 * new announcement: V1 is legacy, read-only.
 *
 * Two independent choices describe a location:
 *  - service_mode:        ON_SITE | REMOTE   (is the work done on site?)
 *  - location_visibility: STANDARD | DISCREET (how precisely is the place shown?)
 *
 * Runs unchanged in the browser and in Node. The referential is data: a later version
 * can change cell sizes or sectors without changing this engine.
 */
(function () {
    'use strict';

    const root = typeof window !== 'undefined' ? window : globalThis;

    const ZONE_ID = /^(\d{3})-v(\d{1,2})-([a-z])-(\d{1,4})\.(\d{1,4})$/;
    const METERS_PER_DEGREE = 111320;

    // Every overseas territory LYANN knows by name. Whether a zone can be used there is
    // decided by the referential, never by this table.
    const TERRITORIES = Object.freeze([
        { code: '971', key: 'guadeloupe', name: 'Guadeloupe', aliases: ['guadeloupe'] },
        { code: '972', key: 'martinique', name: 'Martinique', aliases: ['martinique'] },
        { code: '973', key: 'guyane', name: 'Guyane', aliases: ['guyane'] },
        { code: '974', key: 'reunion', name: 'La Réunion', aliases: ['reunion', 'la reunion'] },
        { code: '976', key: 'mayotte', name: 'Mayotte', aliases: ['mayotte'] },
        { code: '977', key: 'saint-barthelemy', name: 'Saint-Barthélemy', aliases: ['saint-barthelemy', 'saint barthelemy', 'st-barthelemy', 'st barthelemy'] },
        { code: '978', key: 'saint-martin', name: 'Saint-Martin', aliases: ['saint-martin', 'saint martin', 'st-martin', 'st martin'] }
    ]);

    // Keys that would carry a precise position. They are refused outright, not ignored.
    const PRECISE_KEY = /lat|lng|lon|coord|gps|geo|point|position|addr|adres|street|rue|place_|location/i;
    const SELECTION_KEYS = Object.freeze(['service_mode', 'location_visibility', 'location_confirmed', 'territory', 'commune', 'zone_id']);
    const SERVICE_MODES = Object.freeze(['ON_SITE', 'REMOTE']);
    const VISIBILITIES = Object.freeze(['STANDARD', 'DISCREET']);
    const SELECTABLE_VERSIONS = Object.freeze([2]);

    // Texts of the publication step, kept with the contract they describe.
    const LOCATION_COPY = Object.freeze({
        title: "Où avez-vous besoin d'aide ?",
        modes: Object.freeze({
            STANDARD: Object.freeze({ label: 'Localisation standard', hint: 'Indiquez approximativement le secteur de votre mission.' }),
            DISCREET: Object.freeze({ label: 'Annonce discrète', hint: 'Seule votre commune sera affichée.' }),
            REMOTE: Object.freeze({ label: 'À distance', hint: 'Cette mission peut être réalisée sans déplacement.' })
        }),
        preview: 'Voici la localisation approximative visible par les autres membres.',
        confirm: 'Je confirme cette localisation',
        notice: "La zone est indicative : elle ne garantit pas l'anonymat."
    });

    const fold = (value) => String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\u0153/g, 'oe')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const stripArticle = (value) => value.replace(/^(le|la|les|l|du|de|des)\s+/, '');
    const round = (value, digits) => Number(Number(value).toFixed(digits));
    const finite = (value) => typeof value === 'number' && Number.isFinite(value);

    function wellFormedReferential(data) {
        if (!data || typeof data !== 'object' || !Number.isInteger(data.version) || data.version < 1
            || !data.territories || typeof data.territories !== 'object') return false;
        return Object.values(data.territories).every((t) => t && Array.isArray(t.origin) && t.origin.length === 2
            && t.origin.every(finite) && finite(t.refLat) && t.communes && typeof t.communes === 'object'
            && t.levels && typeof t.levels === 'object'
            && Object.values(t.levels).every((l) => l && finite(l.sizeKm) && finite(l.dLat) && l.dLat > 0
                && finite(l.dLng) && l.dLng > 0 && l.cells && typeof l.cells === 'object'));
    }

    function deContraction(name) {
        if (/^les\s/i.test(name)) return `des ${name.slice(4)}`;
        if (/^le\s/i.test(name)) return `du ${name.slice(3)}`;
        return `de ${name}`;
    }

    /**
     * @param {{ referentials?: object|(() => object) }} [options] version -> referential data.
     *   A function is evaluated on every call so a referential loaded later is picked up.
     */
    function createEngine(options = {}) {
        const source = options.referentials;
        const indexCache = new WeakMap();
        const selectablePolicy = options.selectableVersions;

        function loaded() {
            const raw = typeof source === 'function' ? source() : source;
            const map = new Map();
            if (!raw || typeof raw !== 'object') return map;
            for (const [version, data] of Object.entries(raw)) {
                if (wellFormedReferential(data) && String(data.version) === String(version)) map.set(Number(version), data);
            }
            return map;
        }

        // Versions a member may pick for a new announcement. Everything else stays readable.
        function selectable() {
            const all = loaded();
            const wanted = typeof selectablePolicy === 'function' ? selectablePolicy() : selectablePolicy;
            const versions = Array.isArray(wanted) ? wanted : (all.size ? [Math.max(...all.keys())] : []);
            const out = new Map();
            for (const version of versions) if (all.has(version)) out.set(version, all.get(version));
            return out;
        }

        function communeIndex(referential, territoryCode) {
            let perReferential = indexCache.get(referential);
            if (!perReferential) { perReferential = new Map(); indexCache.set(referential, perReferential); }
            if (perReferential.has(territoryCode)) return perReferential.get(territoryCode);
            const territory = referential.territories[territoryCode];
            const names = new Map();
            const add = (key, code) => {
                if (!key) return;
                // The same key for two communes is ambiguous and must resolve to nothing.
                names.set(key, names.has(key) && names.get(key) !== code ? null : code);
            };
            for (const [code, name] of Object.entries(territory.communes)) {
                add(fold(name), code);
                add(stripArticle(fold(name)), code);
            }
            perReferential.set(territoryCode, names);
            return names;
        }

        function resolveTerritory(input) {
            const text = fold(input);
            if (!text) return { status: 'UNKNOWN', code: null, reason: 'TERRITORY_UNKNOWN' };
            const digits = String(input).match(/\b(97[1-8])\b/);
            let entry = digits ? TERRITORIES.find((t) => t.code === digits[1]) : null;
            if (!entry) {
                const squashed = text.replace(/ /g, '-');
                entry = TERRITORIES.find((t) => t.aliases.some((alias) => {
                    const a = fold(alias);
                    return text === a || squashed === a.replace(/ /g, '-') || new RegExp(`(^| )${a}( |$)`).test(text);
                }));
            }
            if (!entry) return { status: 'UNKNOWN', code: null, reason: 'TERRITORY_UNKNOWN' };
            const enabled = [...selectable().values()];
            if (enabled.some((r) => r.territories[entry.code])) {
                return { status: 'SUPPORTED', code: entry.code, key: entry.key, name: entry.name, reason: null };
            }
            // `detail` tells why, when the referential says so (e.g. Guyane: granularity not validated).
            const detail = enabled.map((r) => r.meta?.unsupported?.[entry.code]).find(Boolean) || null;
            return { status: 'UNSUPPORTED', code: entry.code, key: entry.key, name: entry.name, reason: 'UNSUPPORTED_TERRITORY', detail };
        }

        function supportedTerritories() {
            const latest = [...selectable().entries()].sort((a, b) => b[0] - a[0])[0];
            if (!latest) return [];
            const [version, referential] = latest;
            return TERRITORIES.filter((t) => referential.territories[t.code]).map((t) => {
                const levels = Object.entries(referential.territories[t.code].levels)
                    .map(([id, level]) => ({ id, sizeKm: level.sizeKm }))
                    .sort((a, b) => a.sizeKm - b.sizeKm);
                return { code: t.code, key: t.key, name: t.name, version, levels, defaultLevel: levels[0].id };
            });
        }

        function formatZoneId({ territory, version, level, ix, iy } = {}) {
            const ok = /^\d{3}$/.test(String(territory)) && Number.isInteger(version) && version >= 1 && version <= 99
                && /^[a-z]$/.test(String(level)) && Number.isInteger(ix) && ix >= 0 && ix <= 9999
                && Number.isInteger(iy) && iy >= 0 && iy <= 9999;
            return ok ? `${territory}-v${version}-${level}-${ix}.${iy}` : null;
        }

        function parseZoneId(id) {
            const match = typeof id === 'string' ? ZONE_ID.exec(id) : null;
            if (!match) return { ok: false, reason: 'MALFORMED' };
            return {
                ok: true, territory: match[1], version: Number(match[2]), level: match[3],
                ix: Number(match[4]), iy: Number(match[5])
            };
        }

        function resolveZone(id) {
            const parsed = parseZoneId(id);
            if (!parsed.ok) return parsed;
            // Canonical form only: "v01" or "007" would otherwise give one sector two ids.
            if (formatZoneId(parsed) !== id) return { ok: false, reason: 'MALFORMED' };
            const referentials = loaded();
            if (!referentials.size) return { ok: false, reason: 'REFERENTIAL_UNAVAILABLE' };
            const referential = referentials.get(parsed.version);
            if (!referential) return { ok: false, reason: 'UNSUPPORTED_VERSION' };
            const territory = referential.territories[parsed.territory];
            if (!territory) return { ok: false, reason: 'UNSUPPORTED_TERRITORY' };
            const level = territory.levels[parsed.level];
            if (!level) return { ok: false, reason: 'UNSUPPORTED_LEVEL' };
            const cell = level.cells[`${parsed.ix}.${parsed.iy}`];
            if (!cell) return { ok: false, reason: 'UNKNOWN_ZONE' };
            return { ok: true, parsed, referential, territory, level, cell };
        }

        function build(resolved) {
            const { parsed, territory, level, cell } = resolved;
            const [lat0, lng0] = territory.origin;
            const south = lat0 + parsed.iy * level.dLat;
            const west = lng0 + parsed.ix * level.dLng;
            const halfLat = level.dLat * METERS_PER_DEGREE / 2;
            const halfLng = level.dLng * METERS_PER_DEGREE * Math.cos(territory.refLat * Math.PI / 180) / 2;
            const cosRef = Math.cos(territory.refLat * Math.PI / 180);
            // Farthest corner from the representative centre: the circle that really covers the sector.
            const coverM = Math.max(...[[south, west], [south, west + level.dLng], [south + level.dLat, west], [south + level.dLat, west + level.dLng]]
                .map(([la, lo]) => Math.hypot((la - cell[1]) * METERS_PER_DEGREE, (lo - cell[2]) * METERS_PER_DEGREE * cosRef)));
            const communes = cell[3].map(([code, share]) => ({ code, name: territory.communes[code], share }));
            const named = communes.filter((c) => c.share >= 25).slice(0, 2);
            const labelled = (named.length ? named : communes.slice(0, 1)).map((c) => deContraction(c.name));
            const levelIds = Object.keys(territory.levels);
            const parentLevel = levelIds.find((id) => territory.levels[id].sizeKm > level.sizeKm
                && Math.abs(territory.levels[id].dLat / level.dLat - Math.round(territory.levels[id].dLat / level.dLat)) < 1e-6);
            let parent = null;
            if (parentLevel) {
                const factor = Math.round(territory.levels[parentLevel].dLat / level.dLat);
                const candidate = formatZoneId({ ...parsed, level: parentLevel, ix: Math.floor(parsed.ix / factor), iy: Math.floor(parsed.iy / factor) });
                if (territory.levels[parentLevel].cells[`${Math.floor(parsed.ix / factor)}.${Math.floor(parsed.iy / factor)}`]) parent = candidate;
            }
            return {
                id: formatZoneId(parsed),
                territory: parsed.territory,
                territoryName: territory.name,
                version: parsed.version,
                level: parsed.level,
                sizeKm: level.sizeKm,
                center: { lat: cell[1], lng: cell[2] },
                bounds: { south: round(south, 5), north: round(south + level.dLat, 5), west: round(west, 5), east: round(west + level.dLng, 5) },
                // Nominal radius (centre of the cell to a corner), rounded: about 2 km for the V2 standard sector.
                radiusM: Math.round(Math.hypot(halfLat, halfLng) / 100) * 100,
                coverRadiusM: Math.ceil(coverM / 100) * 100,
                landPct: cell[0],
                label: `Secteur ${labelled.join(' et ')}`,
                communes,
                parent
            };
        }

        /** Decode and validate a zone id against the referential. */
        function validateZoneId(id) {
            const resolved = resolveZone(id);
            return resolved.ok ? { ok: true, zone: build(resolved) } : { ok: false, reason: resolved.reason };
        }

        const describeZone = (id) => { const r = validateZoneId(id); return r.ok ? r.zone : null; };
        const parentZoneId = (id) => describeZone(id)?.parent || null;

        /**
         * What a reader is allowed to receive. Zones are for signed-in members only in
         * this first version. The projection holds sector facts, never a member's data.
         */
        function publicZone(id, { authenticated = false } = {}) {
            if (authenticated !== true) return null;
            const zone = describeZone(id);
            if (!zone) return null;
            return {
                id: zone.id, version: zone.version, territory: zone.territory, sizeKm: zone.sizeKm,
                label: zone.label, center: { ...zone.center }, radiusM: zone.radiusM, coverRadiusM: zone.coverRadiusM
            };
        }

        function communeCodeFor(territoryInput, commune) {
            const territory = resolveTerritory(territoryInput);
            if (territory.status !== 'SUPPORTED') return null;
            const referentials = [...selectable().entries()].sort((a, b) => b[0] - a[0]);
            const referential = referentials.find(([, r]) => r.territories[territory.code])?.[1];
            if (!referential) return null;
            const text = String(commune ?? '').replace(/\s*\([^)]*\)\s*/g, ' ').trim();
            if (/^\d{5}$/.test(text)) return referential.territories[territory.code].communes[text] ? text : null;
            const index = communeIndex(referential, territory.code);
            const key = fold(text);
            if (!key) return null;
            return index.get(key) ?? index.get(stripArticle(key)) ?? null;
        }

        function pickLevel(entry, level) {
            const levels = Object.entries(entry.levels).sort((a, b) => a[1].sizeKm - b[1].sizeKm);
            if (!level) return levels[0];
            return levels.find(([id]) => id === level) || null;
        }

        function latestFor(code) {
            const found = [...selectable().entries()].sort((a, b) => b[0] - a[0]).find(([, r]) => r.territories[code]);
            return found ? { version: found[0], referential: found[1] } : null;
        }

        /**
         * Sector that contains a point. For a client-side map picker: the point stays in
         * the browser, only the returned id may be sent. null over the sea or outside the
         * referential, never a nearest guess.
         */
        function zoneAtPoint(territoryInput, lat, lng, { level } = {}) {
            if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
            const territory = resolveTerritory(territoryInput);
            if (territory.status !== 'SUPPORTED') return null;
            const { version, referential } = latestFor(territory.code);
            const entry = referential.territories[territory.code];
            const picked = pickLevel(entry, level);
            if (!picked) return null;
            const [levelId, data] = picked;
            const ix = Math.floor((lng - entry.origin[1]) / data.dLng);
            const iy = Math.floor((lat - entry.origin[0]) / data.dLat);
            if (ix < 0 || iy < 0 || !data.cells[`${ix}.${iy}`]) return null;
            return formatZoneId({ territory: territory.code, version, level: levelId, ix, iy });
        }

        /** Predefined sectors for a territory, so the UI can offer them without any GPS. */
        function zonesForTerritory(territoryInput, { level } = {}) {
            const territory = resolveTerritory(territoryInput);
            if (territory.status !== 'SUPPORTED') return [];
            const { version, referential } = latestFor(territory.code);
            const entry = referential.territories[territory.code];
            const picked = pickLevel(entry, level);
            if (!picked) return [];
            const [levelId, data] = picked;
            return Object.keys(data.cells).map((key) => {
                const [ix, iy] = key.split('.').map(Number);
                return describeZone(formatZoneId({ territory: territory.code, version, level: levelId, ix, iy }));
            }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
        }

        /** Sectors that really contain land of a commune, the largest share first. */
        function zonesForCommune(territoryInput, commune, { level } = {}) {
            const code = communeCodeFor(territoryInput, commune);
            if (!code) return [];
            const territory = resolveTerritory(territoryInput);
            return zonesForTerritory(territory.code, { level })
                .map((zone) => ({ zone, share: zone.communes.find((c) => c.code === code)?.share ?? 0 }))
                .filter((entry) => entry.share > 0)
                .sort((a, b) => b.share - a.share || a.zone.id.localeCompare(b.zone.id, 'en', { numeric: true }))
                .map((entry) => ({ ...entry.zone, communeShare: entry.share }));
        }

        /**
         * The only shape a client may submit:
         *   service_mode         ON_SITE | REMOTE
         *   location_visibility  STANDARD (confirmed sector) | DISCREET (commune only); STANDARD when omitted
         *   location_confirmed   true once the member has seen and confirmed the preview
         *   territory, commune, zone_id
         * Any other field is refused, and fields that look like a position are refused by
         * name. The record returned is the only thing that may be stored: no coordinate,
         * no address, no free text.
         */
        function validateZoneSelection(input) {
            if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'INVALID_SELECTION' };
            for (const key of Object.keys(input)) {
                if (SELECTION_KEYS.includes(key)) continue;
                return { ok: false, reason: PRECISE_KEY.test(key) ? 'FORBIDDEN_FIELD' : 'UNEXPECTED_FIELD', field: key };
            }
            const mode = input.service_mode;
            if (!SERVICE_MODES.includes(mode)) return { ok: false, reason: 'INVALID_MODE' };
            const given = (value) => value !== undefined && value !== null && value !== '';
            const hasVisibility = given(input.location_visibility);
            if (hasVisibility && !VISIBILITIES.includes(input.location_visibility)) return { ok: false, reason: 'INVALID_VISIBILITY' };
            if (input.location_confirmed !== undefined && typeof input.location_confirmed !== 'boolean') return { ok: false, reason: 'INVALID_CONFIRMATION' };
            const hasZone = given(input.zone_id);
            const record = (extra = {}) => ({
                service_mode: mode, location_visibility: null, location_commune_code: null,
                location_zone_id: null, location_zone_version: null, ...extra
            });

            // Remote work needs no place at all: nothing local is recorded or invented.
            if (mode === 'REMOTE') {
                if (hasVisibility) return { ok: false, reason: 'VISIBILITY_NOT_ALLOWED_FOR_REMOTE' };
                if (hasZone) return { ok: false, reason: 'ZONE_NOT_ALLOWED_FOR_REMOTE' };
                return { ok: true, mode, visibility: null, zone: null, fallback: null, record: record() };
            }

            const territory = resolveTerritory(input.territory);
            if (territory.status === 'UNKNOWN') return { ok: false, reason: 'TERRITORY_UNKNOWN' };
            if (territory.status === 'UNSUPPORTED') {
                // Guyane, Saint-Martin...: the existing commune-level location keeps working.
                if (hasZone) return { ok: false, reason: 'UNSUPPORTED_TERRITORY' };
                return { ok: true, mode, visibility: null, zone: null, fallback: 'TERRITORY_UNSUPPORTED', record: record() };
            }

            const visibility = hasVisibility ? input.location_visibility : 'STANDARD';
            if (!given(input.commune)) return { ok: false, reason: 'COMMUNE_REQUIRED' };
            const communeCode = communeCodeFor(territory.code, input.commune);
            if (!communeCode) return { ok: false, reason: 'COMMUNE_UNKNOWN' };
            // Standard is the default, never silent: the member confirms what will be shown.
            if (input.location_confirmed !== true) return { ok: false, reason: 'CONFIRMATION_REQUIRED' };

            if (visibility === 'DISCREET') {
                if (hasZone) return { ok: false, reason: 'ZONE_NOT_ALLOWED_FOR_DISCREET' };
                return {
                    ok: true, mode, visibility, zone: null, fallback: null,
                    record: record({ location_visibility: 'DISCREET', location_commune_code: communeCode })
                };
            }

            if (!hasZone) return { ok: false, reason: 'ZONE_REQUIRED' };
            const checked = validateZoneId(input.zone_id);
            if (!checked.ok) return { ok: false, reason: checked.reason };
            if (!selectable().has(checked.zone.version)) return { ok: false, reason: 'VERSION_NOT_SELECTABLE' };
            if (checked.zone.territory !== territory.code) return { ok: false, reason: 'TERRITORY_MISMATCH' };
            if (!checked.zone.communes.some((c) => c.code === communeCode)) return { ok: false, reason: 'COMMUNE_NOT_IN_ZONE' };
            return {
                ok: true, mode, visibility, fallback: null,
                zone: {
                    id: checked.zone.id, label: checked.zone.label, center: { ...checked.zone.center },
                    radiusM: checked.zone.radiusM, coverRadiusM: checked.zone.coverRadiusM, sizeKm: checked.zone.sizeKm
                },
                record: record({
                    location_visibility: 'STANDARD', location_commune_code: communeCode,
                    location_zone_id: checked.zone.id, location_zone_version: checked.zone.version
                })
            };
        }

        function communeNameFor(code) {
            if (typeof code !== 'string' || !/^\d{5}$/.test(code)) return null;
            for (const referential of loaded().values()) {
                const name = referential.territories[code.slice(0, 3)]?.communes[code];
                if (name) return name;
            }
            return null;
        }

        // Same eligibility as the public list and the needs map: a location is never read
        // from an announcement that is private, masked, closed or not moderated.
        function publicRow(row) {
            if (!row || !row.id) return false;
            if (row.visibility && row.visibility !== 'PUBLIC') return false;
            if (row.status && row.status !== 'OPEN') return false;
            if (row.safety_status && row.safety_status !== 'SAFE') return false;
            if (row.target_user_id) return false;
            if (row.classification_status && !['CLASSIFIED', 'UNCLASSIFIED'].includes(row.classification_status)) return false;
            if (row.public_moderation_status != null && row.public_moderation_status !== 'approved') return false;
            return true;
        }

        /**
         * Where the needs map may place a stored announcement. Reads the stored record only,
         * never a coordinate. kinds:
         *   ZONE    standard sector, drawn at its representative centre
         *   COMMUNE discreet announcement, drawn on the commune
         *   LEGACY  announcement without structured location: the map keeps today's grouping
         *   REMOTE  no marker
         *   NONE    nothing may be shown (audience or eligibility)
         * Inconsistent stored data degrades to the less precise option, never to a guess.
         */
        function placementForRow(row, { authenticated = false } = {}) {
            if (authenticated !== true) return { kind: 'NONE', reason: 'AUDIENCE' };
            if (!publicRow(row)) return { kind: 'NONE', reason: 'NOT_PUBLIC' };
            if (row.service_mode === 'REMOTE') return { kind: 'REMOTE' };
            if (row.service_mode !== 'ON_SITE') return { kind: 'LEGACY' };
            const commune = communeNameFor(row.location_commune_code);
            if (row.location_visibility === 'STANDARD') {
                const zone = describeZone(row.location_zone_id);
                const consistent = zone && commune && zone.version === row.location_zone_version
                    && zone.communes.some((c) => c.code === row.location_commune_code);
                if (consistent) return { kind: 'ZONE', zone: publicZone(zone.id, { authenticated: true }) };
                return commune
                    ? { kind: 'COMMUNE', communeCode: row.location_commune_code, communeName: commune, reason: 'ZONE_INVALID' }
                    : { kind: 'LEGACY', reason: 'LOCATION_INVALID' };
            }
            if (row.location_visibility === 'DISCREET' && commune) {
                return { kind: 'COMMUNE', communeCode: row.location_commune_code, communeName: commune, reason: null };
            }
            return { kind: 'LEGACY', reason: row.location_visibility ? 'LOCATION_INVALID' : null };
        }

        return Object.freeze({
            supportedTerritories, resolveTerritory, formatZoneId, parseZoneId, validateZoneId, describeZone,
            parentZoneId, publicZone, communeCodeFor, zoneAtPoint, zonesForTerritory, zonesForCommune,
            validateZoneSelection, placementForRow
        });
    }

    // Default engine: the referentials are data loaded by the page (browser) or required (Node).
    function defaultReferentials() {
        const found = {};
        if (root.LYANN_APPROX_ZONE_REFERENTIALS) Object.assign(found, root.LYANN_APPROX_ZONE_REFERENTIALS);
        if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
            for (const file of ['./approx-zone-referential.v1.js', './approx-zone-referential.v2.js']) {
                try {
                    const data = require(file);
                    if (data && !found[data.version]) found[data.version] = data;
                } catch (_) { /* Missing referential means "unavailable", never a guess. */ }
            }
        }
        return found;
    }

    const api = Object.freeze({
        ...createEngine({ referentials: defaultReferentials, selectableVersions: SELECTABLE_VERSIONS }),
        createEngine,
        ZONE_ID_PATTERN: ZONE_ID,
        TERRITORIES,
        SELECTION_KEYS,
        SERVICE_MODES,
        VISIBILITIES,
        SELECTABLE_VERSIONS,
        LOCATION_COPY
    });

    root.LYANN_APPROX_ZONE = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
