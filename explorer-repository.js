(function () {
    'use strict';
    const TTL_MS = 30000;
    const PAGE_SIZE = 500;
    const client = () => window.LYANN_API_CLIENT || window.apiClient;
    const normalize = value => window.LyanAI.normalizeText(String(value || ''));

    // Range through the complete public result set: never silently truncate at the API row cap.
    async function readAll(table, configure = q => q) {
        if (!client()?.supabase) throw new Error('Supabase unavailable');
        const rows = [];
        for (let start = 0; ; start += PAGE_SIZE) {
            const { data, error } = await configure(client().supabase.from(table).select('*'))
                .order('id').range(start, start + PAGE_SIZE - 1);
            if (error) throw error;
            rows.push(...(data || []));
            if (!data || data.length < PAGE_SIZE) return rows;
        }
    }

    function cached(key, loader, force) {
        const cache = window.LYANN_DATA_CACHE;
        // Auth identity belongs in the cache key, even for public discovery.
        const identity = window.LYANN_AUTH_STATE?.getSnapshot?.().userId || 'anonymous';
        const cacheId = `${identity}:${key}`;
        if (force) cache?.invalidate('explorer', cacheId);
        return cache ? cache.dedupe('explorer', cacheId, loader, TTL_MS) : loader();
    }

    async function taxonomy(force = false) {
        if (force && window.LyanAI) window.LyanAI.cachedTaxonomy = null;
        return window.LyanAI.fetchTaxonomyFromDB({ strict: true });
    }

    function mapProfile(p, services = []) {
        return { ...p, services, name: window.formatPublicName(p, null, 'Lyanneur'),
            avatar: window.getLyannAvatarUrl(p.avatar_url), source: 'SUPABASE' };
    }

    async function load(options = {}) {
        return cached('profiles', async () => {
            const [profiles, serviceRows] = await Promise.all([
                readAll('public_profiles'), readAll('services')
            ]);
            const api = client();
            const services = serviceRows
                .filter(s => api.isPublishedService(s))
                .map(s => api.presentService(s));
            return profiles.map(p => mapProfile(p, services.filter(s => s.owner_id === p.id)));
        }, options.force);
    }

    async function loadRequests(options = {}) {
        // Resolve identity before choosing the cache namespace and data boundary.
        await window.LYANN_AUTH_STATE?.ready?.();
        return cached('requests', async () => {
            if (!window.LYANN_AUTH_STATE?.getSnapshot?.().userId) {
                const rows = [];
                let offset = 0;
                do {
                    const response = await (window.lyannBackendFetch || fetch)(`/v1/explorer/requests?offset=${offset}`);
                    if (!response.ok) throw new Error('Public request discovery unavailable');
                    const result = await response.json();
                    if (!Array.isArray(result.requests)) throw new Error('Invalid public discovery response');
                    rows.push(...result.requests.map(r => ({ ...r, status: 'OPEN', profiles: r.requester })));
                    const next = result.nextOffset;
                    if (next !== null && (!Number.isSafeInteger(next) || next <= offset)) throw new Error('Invalid public discovery pagination');
                    offset = next;
                } while (offset !== null);
                return rows;
            }
            const requests = await readAll('requests', q => q.eq('visibility', 'PUBLIC').eq('status', 'OPEN').eq('safety_status', 'SAFE').is('target_user_id', null).in('classification_status', ['CLASSIFIED', 'UNCLASSIFIED']));
            const ids = [...new Set(requests.map(r => r.requester_id).filter(Boolean))];
            const profiles = new Map();
            for (let offset = 0; offset < ids.length; offset += 100) {
                const { data, error } = await client().supabase.from('public_profiles')
                    .select('id, first_name, last_name, avatar_url, city, territory')
                    .in('id', ids.slice(offset, offset + 100));
                if (error) throw error;
                (data || []).forEach(p => profiles.set(p.id, p));
            }
            return requests.map(r => ({ ...r, profiles: profiles.get(r.requester_id) || null }))
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }, options.force);
    }

    // Legacy services store a category/title rather than a taxonomy UUID. Match them
    // against the SAME database labels/synonyms used by Requests; do not persist guesses.
    function matchesTaxonomy(record, leaf, specific = false) {
        if (record.taxonomy_id) return record.taxonomy_id === leaf.id;
        const category = normalize(record.category);
        const title = normalize(record.title);
        if (!specific && category && category !== 'general') {
            if (category === normalize(leaf.category)) return true;
        }
        const terms = [specific ? '' : leaf.category, leaf.subcategory, ...(leaf.synonyms || [])].map(normalize).filter(Boolean);
        if (terms.some(term => title.includes(term) || term.includes(title) && title.length >= 4)) return true;
        if (specific) return false;
        const generic = new Set(['entretien','reparation','depannage','service','services','aide','cours','travaux','general']);
        return normalize(leaf.category).split(' ').filter(t => t.length >= 4 && !generic.has(t))
            .some(t => title.includes(t) || category.includes(t));
    }

    function discover(records, leaves, filters, mode) {
        const query = normalize(filters.query);
        const terms = query.split(' ').filter(Boolean);
        const selectedLeaves = leaves.filter(t => (!filters.category || t.category === filters.category) && (!filters.service || t.id === filters.service));
        const areaTerms = normalize(filters.area).split(' ').filter(Boolean);
        return records.filter(record => {
            const services = mode === 'annonces' ? [record] : record.services;
            const related = leaves.filter(t => services.some(s => matchesTaxonomy(s, t)));
            if ((filters.category || filters.service) && !services.some(s => selectedLeaves.some(t => matchesTaxonomy(s, t, !!filters.service)))) return false;
            const text = normalize([record.name, record.title, record.description, record.bio,
                ...services.flatMap(s => [s.title, s.description, s.category]),
                ...related.flatMap(t => [t.category, t.subcategory, ...(t.synonyms || [])])].filter(Boolean).join(' '));
            if (!terms.every(term => text.includes(term))) return false;
            const location = normalize(mode === 'annonces' ? record.location : [record.city, record.territory].filter(Boolean).join(' '));
            // Saved territory labels and Request locations can put the same
            // department code before or after the name (971 / Guadeloupe).
            if (mode === 'annonces' && !areaTerms.every(term => location.includes(term))) return false;
            if (mode === 'lyanneurs') {
                const offered = record.services || [];
                if (!offered.some((service) => service && (service.title || service.name))) return false;
                const clean = value => normalize(String(value || '').replace(/\s*\(\d+\)/g, ''));
                if (filters.territory && clean(record.territory) !== clean(filters.territory)) return false;
                if (filters.commune && clean(record.city) !== clean(filters.commune)) return false;
            }
            if (mode === 'annonces') {
                if (record.status !== 'OPEN') return false;
                if (filters.urgency && record.urgency !== filters.urgency) return false;
                if (filters.budget !== '' && (record.budget == null || Number(record.budget) > Number(filters.budget))) return false;
            }
            return true;
        }).map(record => {
            if (mode === 'annonces') return record;
            // Keep all real services, placing the ones explaining this result first.
            const score = service => {
                const taxonomyMatch = (filters.category || filters.service) && selectedLeaves.some(t => matchesTaxonomy(service, t, !!filters.service));
                const textMatch = terms.length && terms.every(t => normalize(service.title).includes(t));
                return Number(Boolean(taxonomyMatch)) * 2 + Number(Boolean(textMatch));
            };
            return { ...record, services: [...record.services].sort((a,b) => score(b) - score(a)) };
        }).sort((a, b) => {
            if (mode === 'annonces') return new Date(b.created_at) - new Date(a.created_at);
            // A published service title match comes before a biography-only match.
            const score = p => terms.length && p.services.some(s => terms.every(t => normalize(s.title).includes(t))) ? 1 : 0;
            return score(b) - score(a) || a.name.localeCompare(b.name, 'fr');
        });
    }

    function invalidate() { window.LYANN_DATA_CACHE?.invalidate('explorer'); }
    window.addEventListener('lyann_request_created', invalidate);
    window.LYANN_EXPLORER_REPOSITORY = { load, loadRequests, taxonomy, discover, invalidate, mapProfile };
})();
