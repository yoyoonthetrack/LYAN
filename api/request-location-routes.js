'use strict';

/* PUT /v1/requests/:id/location — the only way to create or change the approximate location of an announcement.
 *
 * Why a server route: public.request_locations accepts no write from anon or authenticated (no policy, no privilege).
 * This route is the single writer, through the service role that never leaves the server.
 *
 * What it trusts, in order:
 *   1. the JWT, verified by Supabase Auth (the caller id is never read from the body);
 *   2. the announcement row read here: its author, its status, its moderation state and its own place
 *      (territory and commune, from the `location` text the member published);
 *   3. the versioned referential of approx-zone.js for the sector.
 * What it does not trust: requester_id, territory or commune sent by the browser. They may be sent, and are only
 * accepted when they agree with the announcement. Any other field (coordinates, address, free text) is refused.
 *
 * Every call replaces the whole row, so a mode change can never leave a stale commune or sector behind.
 */

const approxZone = require('../approx-zone.js');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE_STATUSES = Object.freeze(['OPEN', 'PAUSED']);
const STRING_KEYS = Object.freeze(['service_mode', 'location_visibility', 'territory', 'commune', 'zone_id']);
const COLUMNS = 'request_id,service_mode,location_visibility,commune_code,zone_id,zone_version,created_at,updated_at';

// reason -> [http status, public message]
const FAILURES = Object.freeze({
    FORBIDDEN_FIELD: [400, 'Champ non autorisé : aucune position précise ni adresse.'],
    UNEXPECTED_FIELD: [400, 'Champ inconnu.'],
    INVALID_SELECTION: [400, 'Localisation invalide.'],
    INVALID_MODE: [400, 'Mode d’intervention invalide.'],
    INVALID_VISIBILITY: [400, 'Visibilité invalide.'],
    INVALID_CONFIRMATION: [400, 'Confirmation invalide.'],
    CONFIRMATION_REQUIRED: [422, 'Confirmez la localisation affichée.'],
    VISIBILITY_NOT_ALLOWED_FOR_REMOTE: [422, 'Une mission à distance n’a pas de visibilité de lieu.'],
    ZONE_NOT_ALLOWED_FOR_REMOTE: [422, 'Une mission à distance n’a pas de secteur.'],
    ZONE_NOT_ALLOWED_FOR_DISCREET: [422, 'Une annonce discrète n’a pas de secteur.'],
    ZONE_REQUIRED: [422, 'Choisissez un secteur confirmé.'],
    UNKNOWN_ZONE: [422, 'Secteur inconnu.'],
    MALFORMED: [422, 'Identifiant de secteur invalide.'],
    UNSUPPORTED_VERSION: [422, 'Version de secteur non prise en charge.'],
    VERSION_NOT_SELECTABLE: [422, 'Cette version de secteur n’est plus sélectionnable.'],
    UNSUPPORTED_TERRITORY: [422, 'Territoire non pris en charge pour les secteurs.'],
    UNSUPPORTED_LEVEL: [422, 'Niveau de secteur non pris en charge.'],
    REFERENTIAL_UNAVAILABLE: [503, 'Référentiel de secteurs indisponible.'],
    TERRITORY_UNKNOWN: [422, 'Territoire inconnu.'],
    COMMUNE_REQUIRED: [422, 'Commune requise.'],
    COMMUNE_UNKNOWN: [422, 'Commune inconnue.'],
    TERRITORY_MISMATCH: [422, 'Le secteur n’appartient pas au territoire de l’annonce.'],
    COMMUNE_NOT_IN_ZONE: [422, 'Le secteur ne contient pas la commune de l’annonce.'],
    REQUEST_TERRITORY_MISMATCH: [422, 'Le territoire ne correspond pas à l’annonce.'],
    REQUEST_COMMUNE_MISMATCH: [422, 'La commune ne correspond pas à l’annonce.'],
    REQUEST_PLACE_UNKNOWN: [422, 'L’annonce ne permet pas d’établir sa commune.']
});

function failure(reason, extra) {
    const [status, message] = FAILURES[reason] || [422, 'Localisation invalide.'];
    return { ok: false, status, body: { code: reason, error: message, ...(extra || {}) } };
}

/** Territory and commune of the announcement itself, read from what the member published. */
function placeOfRequest(row, engine) {
    const territoryOf = (text) => {
        const r = engine.resolveTerritory(text);
        return r.status === 'UNKNOWN' ? null : r.code;
    };
    const textOf = (value) => (typeof value === 'string' ? value.trim() : '');
    const location = textOf(row.location);
    const parenthesis = location.match(/\(([^)]*)\)/);
    let territory = territoryOf(textOf(row.territory)) || (parenthesis ? territoryOf(parenthesis[1]) : null);
    let communeText = textOf(row.city) || location.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    // "Guadeloupe" alone names a territory, not a commune.
    if (communeText && engine.resolveTerritory(communeText).status !== 'UNKNOWN') {
        territory = territory || territoryOf(communeText);
        communeText = '';
    }
    // Plain commune ("Le Gosier"): the territory is the only one where that commune exists, never a guess.
    if (!territory && communeText) {
        const matches = engine.supportedTerritories().filter((t) => engine.communeCodeFor(t.code, communeText));
        if (matches.length === 1) territory = matches[0].code;
    }
    return { territory, communeText: communeText || null };
}

/** The shape the browser may send, then the announcement's own place, then the engine. Pure: no I/O. */
function resolveSelection(body, row, engine = approxZone) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return failure('INVALID_SELECTION');
    const unknown = Object.keys(body).find((key) => !engine.SELECTION_KEYS.includes(key));
    if (unknown) {
        const refused = engine.validateZoneSelection({ [unknown]: body[unknown] });
        return failure(refused.reason || 'UNEXPECTED_FIELD', { field: String(unknown).slice(0, 40) });
    }
    for (const key of STRING_KEYS) {
        const value = body[key];
        if (value !== undefined && value !== null && typeof value !== 'string') return failure('INVALID_SELECTION');
    }
    if (body.location_confirmed !== undefined && typeof body.location_confirmed !== 'boolean') return failure('INVALID_CONFIRMATION');

    const base = {
        service_mode: body.service_mode,
        location_visibility: body.location_visibility,
        location_confirmed: body.location_confirmed,
        zone_id: body.zone_id
    };

    if (body.service_mode !== 'ON_SITE') {
        // REMOTE (or an invalid mode, which the engine rejects). Nothing local is derived or stored.
        const checked = engine.validateZoneSelection(base);
        return checked.ok ? { ok: true, record: checked.record, selection: checked } : failure(checked.reason);
    }

    const place = placeOfRequest(row, engine);
    if (!place.territory) return failure('REQUEST_PLACE_UNKNOWN');
    if (body.territory) {
        const claimed = engine.resolveTerritory(body.territory);
        if (claimed.status === 'UNKNOWN' || claimed.code !== place.territory) return failure('REQUEST_TERRITORY_MISMATCH');
    }

    const territory = engine.resolveTerritory(place.territory);
    let communeCode;
    if (territory.status === 'SUPPORTED') {
        communeCode = place.communeText ? engine.communeCodeFor(place.territory, place.communeText) : null;
        if (!communeCode) return failure('REQUEST_PLACE_UNKNOWN');
        if (body.commune) {
            const claimed = engine.communeCodeFor(place.territory, body.commune);
            if (!claimed) return failure('COMMUNE_UNKNOWN');
            if (claimed !== communeCode) return failure('REQUEST_COMMUNE_MISMATCH');
        }
    }

    // The engine receives the announcement's own territory and commune, never the browser's.
    const checked = engine.validateZoneSelection({ ...base, territory: place.territory, commune: communeCode });
    return checked.ok ? { ok: true, record: checked.record, selection: checked } : failure(checked.reason);
}

function createRequestLocationHandler({ db, requireUser, engine = approxZone } = {}) {
    if (!db || typeof requireUser !== 'function') throw new Error('request location route: db and requireUser are required');
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');

        let user = null;
        try { user = await requireUser(req); } catch (_) { user = null; }
        if (!user || !user.id) return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Connexion requise.' });

        const requestId = String(req.params?.id || '');
        if (!UUID.test(requestId)) return res.status(404).json({ code: 'REQUEST_NOT_FOUND', error: 'Annonce introuvable.' });

        // Authorship comes from the database row, matched with the verified caller. A request that does not belong to
        // the caller looks exactly like a request that does not exist.
        const found = await db.from('requests')
            .select('id,requester_id,status,public_moderation_status,location,territory,city')
            .eq('id', requestId).maybeSingle();
        if (found.error) return res.status(500).json({ code: 'REQUEST_READ_FAILED', error: 'Lecture impossible.' });
        const row = found.data;
        if (!row || !row.requester_id || row.requester_id !== user.id) {
            return res.status(404).json({ code: 'REQUEST_NOT_FOUND', error: 'Annonce introuvable.' });
        }
        if (!EDITABLE_STATUSES.includes(row.status) || row.public_moderation_status === 'rejected') {
            return res.status(409).json({ code: 'REQUEST_NOT_EDITABLE', error: 'Cette annonce ne peut plus être modifiée.' });
        }

        const resolved = resolveSelection(req.body, row, engine);
        if (!resolved.ok) return res.status(resolved.status).json(resolved.body);

        const record = resolved.record;
        const saved = await db.from('request_locations').upsert({
            request_id: row.id,
            service_mode: record.service_mode,
            location_visibility: record.location_visibility,
            commune_code: record.location_commune_code,
            zone_id: record.location_zone_id,
            zone_version: record.location_zone_version
        }, { onConflict: 'request_id' }).select(COLUMNS).single();
        if (saved.error || !saved.data) return res.status(500).json({ code: 'LOCATION_WRITE_FAILED', error: 'Enregistrement impossible.' });

        const stored = saved.data;
        return res.json({
            success: true,
            location: {
                request_id: stored.request_id,
                service_mode: stored.service_mode,
                location_visibility: stored.location_visibility,
                commune_code: stored.commune_code,
                zone_id: stored.zone_id,
                zone_version: stored.zone_version,
                updated_at: stored.updated_at
            },
            fallback: resolved.selection.fallback || null,
            zone: resolved.selection.zone || null
        });
    };
}

module.exports = { createRequestLocationHandler, resolveSelection, placeOfRequest, EDITABLE_STATUSES };
