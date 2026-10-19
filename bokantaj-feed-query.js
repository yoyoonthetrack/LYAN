(function () {
  'use strict';

  // Social feed categories. Old Bokantaj types stay visible under the closest group.
  const TYPE_ALIASES = {
    info: ['info', 'besoin'],
    alerte: ['alerte', 'alert'],
    bon_plan: ['bon_plan', 'bonplan', 'dispo'],
    evenement: ['evenement', 'event'],
    astuce: ['astuce', 'conseil'],
    avis: ['avis', 'reco', 'recommandation']
  };

  function fold(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function normalizeType(value) {
    return fold(value).replace(/ /g, '_');
  }

  function postMatchesTypes(post, types) {
    if (!Array.isArray(types) || types.length === 0) return true;
    const raw = normalizeType(post && post.type);
    return types.some((key) => {
      const aliases = TYPE_ALIASES[key] || [key];
      return aliases.some((alias) => normalizeType(alias) === raw);
    });
  }

  function postWithinPeriod(post, period, now) {
    if (!period || period === 'all') return true;
    const created = new Date(post && post.created_at).getTime();
    if (!Number.isFinite(created)) return false;
    const clock = now instanceof Date ? now.getTime() : Number(now) || Date.now();
    if (period === 'today') {
      const start = new Date(clock);
      start.setHours(0, 0, 0, 0);
      return created >= start.getTime();
    }
    const days = period === '7' ? 7 : period === '30' ? 30 : 0;
    if (!days) return true;
    return created >= clock - days * 24 * 60 * 60 * 1000;
  }

  function communeMatches(post, label) {
    const commune = fold(String(label || '').split('·')[0]);
    if (!commune) return false;
    const hay = fold([post && post.location, post && post.city, post && post.author_city, post && post.territory].filter(Boolean).join(' '));
    return hay.includes(commune);
  }

  function formatDistanceKm(km, precise) {
    if (!Number.isFinite(km) || km < 0) return null;
    if (km < 1) {
      if (!precise) return 'moins d’1 km';
      const meters = Math.round(km * 1000);
      if (meters < 100) return 'moins de 100 m';
      const rounded = Math.round(meters / 100) * 100;
      if (rounded >= 1000) return '1 km';
      return `${rounded} m`;
    }
    if (km < 10) {
      const rounded = Math.round(km * 10) / 10;
      return `${String(rounded).replace('.', ',')} km`;
    }
    return `${Math.round(km)} km`;
  }

  function createdAt(post) {
    const time = new Date(post && post.created_at).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function compareRecent(a, b) {
    const delta = createdAt(b) - createdAt(a);
    if (delta) return delta;
    return String(b && b.id || '').localeCompare(String(a && a.id || ''));
  }

  function sortPosts(posts, mode) {
    const list = Array.isArray(posts) ? posts.slice() : [];
    if (mode === 'nearby') {
      return list
        .filter((post) => Number.isFinite(post && post._distanceKm))
        .sort((a, b) => {
          const delta = a._distanceKm - b._distanceKm;
          if (delta) return delta;
          return compareRecent(a, b);
        });
    }
    return list.sort(compareRecent);
  }

  window.LYANN_BOKANTAJ_QUERY = Object.freeze({
    TYPE_ALIASES,
    postMatchesTypes,
    postWithinPeriod,
    communeMatches,
    formatDistanceKm,
    sortPosts
  });
})();
