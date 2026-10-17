(function () {
  'use strict';

  const CACHE_TTL_MS = 15000;
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;
  let lastHasMore = false;

  function isFresh() {
    return Array.isArray(cached) && (Date.now() - cachedAt) < CACHE_TTL_MS;
  }

  function sanitizeFeed(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (!item) return false;
      if (item.item_type !== 'POST' || item.request_id) return false;
      return true;
    });
  }

  async function fetchFeed(options) {
    const client = window.LYANN_API_CLIENT || window.apiClient;
    if (!client || typeof client.getFeed !== 'function') {
      throw new Error('LYANN feed client is not available');
    }

    const result = await client.getFeed(options || {});
    if (result && result.error) throw result.error;
    lastHasMore = !!(result && result.hasMore);
    return sanitizeFeed(result ? result.data : []);
  }

  async function load(options = {}) {
    if (options.before) return fetchFeed(options);
    const force = options.force === true;
    if (!force && isFresh()) return cached;
    if (!force && inFlight) return inFlight;

    const flight = fetchFeed({})
      .then((items) => {
        cached = items;
        cachedAt = Date.now();
        return items;
      })
      .finally(() => {
        if (inFlight === flight) inFlight = null;
      });
    inFlight = flight;
    return flight;
  }

  function invalidate() {
    cached = null;
    cachedAt = 0;
    inFlight = null;
  }

  window.LYANN_BOKANTAJ_REPOSITORY = Object.freeze({
    load,
    invalidate,
    sanitizeFeed,
    hasMore() { return lastHasMore; }
  });
})();
