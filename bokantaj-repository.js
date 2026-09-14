(function () {
  'use strict';

  const CACHE_TTL_MS = 15000;
  let cached = null;
  let cachedAt = 0;
  let inFlight = null;

  function isFresh() {
    return Array.isArray(cached) && (Date.now() - cachedAt) < CACHE_TTL_MS;
  }

  function sanitizeFeed(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((item) => {
      if (!item) return false;
      // A private targeted request must never leak into the public Bokantaj feed.
      if (item.item_type === 'LYANN' && item.visibility && item.visibility !== 'PUBLIC') {
        return false;
      }
      return true;
    });
  }

  async function fetchFeed() {
    const client = window.LYANN_API_CLIENT || window.apiClient;
    if (!client || typeof client.getFeed !== 'function') {
      throw new Error('LYANN feed client is not available');
    }

    const result = await client.getFeed();
    if (result && result.error) throw result.error;
    return sanitizeFeed(result ? result.data : []);
  }

  async function load(options = {}) {
    const force = options.force === true;
    if (!force && isFresh()) return cached;
    if (!force && inFlight) return inFlight;

    inFlight = fetchFeed()
      .then((items) => {
        cached = items;
        cachedAt = Date.now();
        return items;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  function invalidate() {
    cached = null;
    cachedAt = 0;
    inFlight = null;
  }

  window.LYANN_BOKANTAJ_REPOSITORY = Object.freeze({
    load,
    invalidate,
    sanitizeFeed
  });
})();
