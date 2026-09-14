(() => {
  'use strict';

  if (window.LYANN_PROFILE_REPOSITORY) return;

  const PROFILE_TTL_MS = 30_000;

  function client() {
    return window.LYANN_API_CLIENT || window.apiClient || null;
  }

  function isUuidLike(value) {
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  function neutralProfile(memberId) {
    return {
      id: memberId || null,
      first_name: '',
      last_name: '',
      last_name_initial: '',
      display_name: 'Lyanneur',
      city: null,
      territory: 'Guadeloupe (971)',
      bio: '',
      avatar_url: null,
      is_verified: false,
      is_pro_verified: false,
      completion_pct: 20,
      member_since: null,
      skills: [],
      metrics: {
        average_rating: null,
        reviews_count: 0,
        completed_missions: 0,
        response_rate_percent: null,
        avg_response_time_label: '—',
        repeat_users_count: 0
      }
    };
  }

  function mergeProfile(profileData, rawProfile) {
    if (!rawProfile) return false;
    profileData.id = rawProfile.id || profileData.id;
    profileData.first_name = (rawProfile.first_name || '').trim();
    profileData.last_name = (rawProfile.last_name || '').trim();
    profileData.last_name_initial = profileData.last_name ? profileData.last_name.charAt(0).toUpperCase() + '.' : '';
    profileData.display_name = typeof window.formatPublicName === 'function'
      ? window.formatPublicName(profileData, null, 'Lyanneur')
      : (profileData.first_name || 'Lyanneur');
    profileData.city = rawProfile.city && rawProfile.city.trim().toLowerCase() !== 'guadeloupe' ? rawProfile.city.trim() : null;
    profileData.territory = rawProfile.territory || 'Guadeloupe (971)';
    profileData.bio = rawProfile.bio || '';
    profileData.avatar_url = rawProfile.avatar_url || null;
    profileData.is_verified = !!rawProfile.is_verified;
    profileData.is_pro_verified = !!(rawProfile.is_pro && rawProfile.kyc_verified);
    if (rawProfile.created_at) {
      profileData.member_since = new Date(rawProfile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    return true;
  }

  function mergeTrust(profileData, trust) {
    if (!trust || trust.error) return;
    if (trust.first_name) profileData.first_name = trust.first_name;
    if (trust.last_name_initial) profileData.last_name_initial = trust.last_name_initial;
    if (trust.display_name) profileData.display_name = trust.display_name;
    if (trust.city) profileData.city = trust.city;
    if (trust.territory) profileData.territory = trust.territory;
    if (trust.bio !== undefined && trust.bio !== null) profileData.bio = trust.bio;
    if (trust.avatar_url !== undefined && trust.avatar_url !== null) profileData.avatar_url = trust.avatar_url;
    profileData.is_verified = !!trust.is_verified;
    profileData.is_pro_verified = !!trust.is_pro_verified;
    if (trust.completion_pct) profileData.completion_pct = trust.completion_pct;
    if (trust.member_since) profileData.member_since = trust.member_since;
    if (Array.isArray(trust.skills) && trust.skills.length) profileData.skills = trust.skills;
    if (trust.metrics) {
      profileData.metrics = {
        average_rating: trust.metrics.average_rating ?? null,
        reviews_count: trust.metrics.reviews_count ?? 0,
        completed_missions: trust.metrics.completed_missions ?? 0,
        response_rate_percent: trust.metrics.response_rate_percent ?? null,
        avg_response_time_label: trust.metrics.avg_response_time_label || '—',
        repeat_users_count: trust.metrics.repeat_users_count ?? 0
      };
    }
  }

  function mapReviews(rows) {
    return (rows || []).map((review) => ({
      name: typeof window.formatPublicName === 'function'
        ? window.formatPublicName(review.author, null, 'Membre')
        : (review.author?.first_name || 'Membre'),
      city: review.author?.city || 'Guadeloupe',
      date: new Date(review.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
      rating: Number(review.rating).toFixed(1),
      comment: review.comment || 'Mission réalisée avec succès.'
    }));
  }

  async function resolveUserId() {
    if (window.LYANN_AUTH_STATE) {
      try {
        await window.LYANN_AUTH_STATE.ready();
        return window.LYANN_AUTH_STATE.getUserId();
      } catch (_) {}
    }
    if (window.LYANN_SESSION) {
      try {
        const user = await window.LYANN_SESSION.getUser();
        return user?.id || null;
      } catch (_) {}
    }
    return null;
  }

  async function loadFresh(requestedMemberId) {
    const api = client();
    const activeUserId = await resolveUserId();
    const memberId = requestedMemberId || activeUserId || null;
    const isSelf = !!(activeUserId && memberId && String(activeUserId) === String(memberId));
    const profileData = neutralProfile(memberId);

    if (!api || !memberId || !isUuidLike(String(memberId))) {
      return {
        memberId,
        activeUserId,
        isSelf,
        profileData,
        portfolioItems: [],
        userServices: [],
        reviewsList: [],
        dbProfileFound: false
      };
    }

    const profilePromise = typeof api.getProfile === 'function' ? api.getProfile(memberId).catch(() => null) : Promise.resolve(null);
    const trustPromise = typeof api.getUserTrustAndReputation === 'function' ? api.getUserTrustAndReputation(memberId).catch(() => null) : Promise.resolve(null);
    const portfolioPromise = typeof api.getUserPortfolio === 'function' ? api.getUserPortfolio(memberId, isSelf).catch(() => null) : Promise.resolve(null);
    const servicesPromise = typeof api.getUserServices === 'function' ? api.getUserServices(memberId).catch(() => null) : Promise.resolve(null);
    const reviewsPromise = api.supabase
      ? api.supabase
          .from('reviews')
          .select('*, author:profiles!author_id(first_name, last_name, avatar_url, city)')
          .eq('target_id', memberId)
          .order('created_at', { ascending: false })
          .then((result) => result)
          .catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] });

    const [profileRes, trustRes, portfolioRes, servicesRes, reviewsRes] = await Promise.all([
      profilePromise,
      trustPromise,
      portfolioPromise,
      servicesPromise,
      reviewsPromise
    ]);

    const dbProfileFound = mergeProfile(profileData, profileRes?.data || null);
    mergeTrust(profileData, trustRes?.data || null);

    const portfolioItems = Array.isArray(portfolioRes?.data) ? portfolioRes.data : [];
    const userServices = Array.isArray(servicesRes?.data) ? servicesRes.data : [];
    const reviewsList = mapReviews(reviewsRes?.data || []);

    profileData.metrics.reviews_count = reviewsList.length;
    if (!reviewsList.length) profileData.metrics.average_rating = null;

    return {
      memberId,
      activeUserId,
      isSelf,
      profileData,
      portfolioItems,
      userServices,
      reviewsList,
      dbProfileFound
    };
  }

  async function load(memberId, { fresh = false } = {}) {
    const cache = window.LYANN_DATA_CACHE;
    if (fresh && cache) cache.invalidate('profile-bundle', memberId || 'self');

    if (!cache) return loadFresh(memberId);

    const cacheId = memberId || 'self';
    return cache.dedupe('profile-bundle', cacheId, () => loadFresh(memberId), PROFILE_TTL_MS);
  }

  function invalidate(memberId) {
    window.LYANN_DATA_CACHE?.invalidate('profile-bundle', memberId || 'self');
  }

  window.LYANN_PROFILE_REPOSITORY = { load, invalidate };
})();
