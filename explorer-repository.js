(function () {
    'use strict';

    const CACHE_NAMESPACE = 'explorer';
    const CACHE_ID = 'profiles';
    const TTL_MS = 30000;

    function getClient() {
        return window.LYANN_API_CLIENT || window.apiClient || null;
    }

    async function getCurrentUserId() {
        if (window.LYANN_AUTH_STATE && typeof window.LYANN_AUTH_STATE.getUserId === 'function') {
            const id = window.LYANN_AUTH_STATE.getUserId();
            if (id) return id;
        }
        if (window.LYANN_SESSION && typeof window.LYANN_SESSION.getUser === 'function') {
            const user = await window.LYANN_SESSION.getUser().catch(() => null);
            if (user && user.id) return user.id;
        }
        const client = getClient();
        if (client && typeof client.getCurrentUser === 'function') {
            const user = await client.getCurrentUser().catch(() => null);
            return user && user.id ? user.id : null;
        }
        return null;
    }

    function mapProfile(p) {
        return {
            id: p.id,
            user_id: p.id,
            name: window.formatPublicName ? window.formatPublicName(p, null, 'Lyanneur') : (p.first_name || 'Lyanneur'),
            avatar: window.getLyannAvatarUrl ? window.getLyannAvatarUrl(p.avatar_url) : (p.avatar_url || '/default-avatar.svg'),
            role: p.headline || p.activity || p.role || 'Services & Entraide',
            category: p.category || p.activity || 'general',
            city: p.city || p.location || 'Guadeloupe',
            location: p.territory || p.location || 'guadeloupe',
            rating: p.rating || 0,
            reviewsCount: p.reviews_count || 0,
            completed_missions_count: p.completed_missions_count || 0,
            is_verified_pro: p.is_verified || p.account_type === 'pro',
            skills: p.skills || [],
            bio: p.bio || p.headline || '',
            subscription_plan: p.subscription_plan || 'FREE',
            source: 'SUPABASE'
        };
    }

    async function fetchProfiles() {
        const client = getClient();
        if (!client || !client.supabase) throw new Error('Supabase client unavailable');
        const currentUserId = await getCurrentUserId();
        let query = client.supabase.from('profiles').select('*');
        if (currentUserId) query = query.neq('id', currentUserId);
        const { data, error } = await query;
        if (error) throw error;
        const seen = new Set();
        return (data || []).filter((p) => {
            if (!p || !p.id || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
        }).map(mapProfile);
    }

    async function load(options) {
        const force = !!(options && options.force);
        const cache = window.LYANN_DATA_CACHE;
        if (cache && force && typeof cache.invalidate === 'function') {
            cache.invalidate(CACHE_NAMESPACE, CACHE_ID);
        }
        if (cache && typeof cache.dedupe === 'function') {
            return cache.dedupe(CACHE_NAMESPACE, CACHE_ID, fetchProfiles, TTL_MS);
        }
        return fetchProfiles();
    }

    function peek() {
        const cache = window.LYANN_DATA_CACHE;
        return cache && typeof cache.get === 'function'
            ? cache.get(CACHE_NAMESPACE, CACHE_ID)
            : undefined;
    }

    function invalidate() {
        const cache = window.LYANN_DATA_CACHE;
        if (cache && typeof cache.invalidate === 'function') {
            cache.invalidate(CACHE_NAMESPACE, CACHE_ID);
        }
    }

    window.LYANN_EXPLORER_REPOSITORY = { load, peek, invalidate, mapProfile };
})();
