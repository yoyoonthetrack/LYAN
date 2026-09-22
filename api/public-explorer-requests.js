'use strict';

const PAGE_SIZE = 100;
// Server-only projection. Never accept a caller-supplied select/filter or serialize DB rows.
const SELECT = 'id,category,taxonomy_id,title,description,budget,location,urgency,created_at,requester_id,visibility,status,safety_status,target_user_id,classification_status';
// Structured date and price arrive with migration 37, the author reputation columns
// with the same migration on public_profiles. Until it is applied the database
// rejects them, so each projection degrades to the one that already works rather
// than taking public discovery down.
const SELECT_V2 = `${SELECT},date_mode,scheduled_at,price_mode,budget_max`;
const PROFILE_SELECT = 'id,first_name,last_name,avatar_url';
const PROFILE_SELECT_V2 = `${PROFILE_SELECT},is_verified,is_pro_verified,average_rating,reviews_count`;
function eligible(row) {
    return row.visibility === 'PUBLIC' && row.status === 'OPEN' && row.safety_status === 'SAFE'
        && row.target_user_id === null && ['CLASSIFIED', 'UNCLASSIFIED'].includes(row.classification_status);
}
function publicLocation(value) {
    // Unstructured location cannot safely supply a street or even a municipality.
    const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const territories = [['guadeloupe', 'Guadeloupe (971)'], ['martinique', 'Martinique (972)'],
        ['guyane', 'Guyane (973)'], ['reunion', 'La Réunion (974)'], ['mayotte', 'Mayotte (976)'],
        ['saint-martin', 'Saint-Martin (978)'], ['saint-barthelemy', 'Saint-Barthélemy (977)']];
    const matches = territories.filter(([key]) => new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).test(text));
    return matches.length === 1 ? matches[0][1] : null;
}
function project(row, profile) {
    const first = (profile?.first_name || '').trim();
    const initial = (profile?.last_name || '').replace(/[^a-zA-Z]/g, '').charAt(0).toUpperCase();
    const average = Number(profile?.average_rating);
    return {
        id: row.id, category: row.category, taxonomy_id: row.taxonomy_id,
        title: row.title, description: row.description, budget: row.budget,
        location: publicLocation(row.location), urgency: row.urgency, created_at: row.created_at,
        // Null until migration 37 adds the columns; the card omits the line either way.
        date_mode: row.date_mode ?? null, scheduled_at: row.scheduled_at ?? null,
        price_mode: row.price_mode ?? null, budget_max: row.budget_max ?? null,
        requester: { display_name: first ? first + (initial ? `.${initial}` : '') : 'Lyanneur',
            avatar_url: profile?.avatar_url || null,
            // Aggregate public reputation only: no identifier, no contact, no raw KYC flag.
            is_verified: profile?.is_verified === true,
            is_pro_verified: profile?.is_pro_verified === true,
            average_rating: Number.isFinite(average) && average > 0 ? average : null,
            reviews_count: Number(profile?.reviews_count) || 0 }
    };
}
function createPublicRequestsHandler(db, configured = true) {
    let requestSelect = SELECT_V2;
    let profileSelect = PROFILE_SELECT_V2;
    return async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
        if (!Number.isSafeInteger(offset) || offset < 0 || Object.keys(req.query).some(k => k !== 'offset')) {
            return res.status(400).json({ error: 'Paramètres de recherche invalides.' });
        }
        if (!configured) return res.status(503).json({ error: 'Recherche temporairement indisponible.' });
        try {
            const readRequests = select => db.from('requests').select(select)
                .eq('visibility', 'PUBLIC').eq('status', 'OPEN').eq('safety_status', 'SAFE')
                .is('target_user_id', null).in('classification_status', ['CLASSIFIED', 'UNCLASSIFIED'])
                .order('created_at', { ascending: false }).order('id').range(offset, offset + PAGE_SIZE);
            let { data, error } = await readRequests(requestSelect);
            if (error && requestSelect !== SELECT) {
                requestSelect = SELECT;
                ({ data, error } = await readRequests(requestSelect));
            }
            if (error || !Array.isArray(data)) throw new Error('request_read_failed');
            const rows = data.slice(0, PAGE_SIZE).filter(eligible);
            const ids = [...new Set(rows.map(r => r.requester_id).filter(Boolean))];
            const profiles = new Map();
            if (ids.length) {
                const readProfiles = select => db.from('public_profiles').select(select).in('id', ids);
                let result = await readProfiles(profileSelect);
                if (result.error && profileSelect !== PROFILE_SELECT) {
                    profileSelect = PROFILE_SELECT;
                    result = await readProfiles(profileSelect);
                }
                if (result.error || !Array.isArray(result.data)) throw new Error('profile_read_failed');
                result.data.forEach(p => profiles.set(p.id, p));
            }
            return res.json({ requests: rows.map(r => project(r, profiles.get(r.requester_id))),
                nextOffset: data.length > PAGE_SIZE ? offset + PAGE_SIZE : null });
        } catch (_) {
            // Do not serialize database errors, SQL, credentials, or row contents.
            return res.status(503).json({ error: 'Recherche temporairement indisponible.' });
        }
    };
}
module.exports = { createPublicRequestsHandler };
