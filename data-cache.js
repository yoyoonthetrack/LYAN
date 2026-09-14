(() => {
  'use strict';

  if (window.LYANN_DATA_CACHE) return;

  const DEFAULT_TTL_MS = 30_000;
  const entries = new Map();
  const inFlight = new Map();

  function now() { return Date.now(); }

  function key(namespace, id) {
    return `${namespace}:${String(id || '')}`;
  }

  function get(namespace, id) {
    const entry = entries.get(key(namespace, id));
    if (!entry) return undefined;
    if (entry.expiresAt <= now()) {
      entries.delete(key(namespace, id));
      return undefined;
    }
    return entry.value;
  }

  function set(namespace, id, value, ttlMs = DEFAULT_TTL_MS) {
    entries.set(key(namespace, id), {
      value,
      expiresAt: now() + Math.max(0, Number(ttlMs) || DEFAULT_TTL_MS)
    });
    return value;
  }

  function invalidate(namespace, id) {
    if (id === undefined) {
      const prefix = `${namespace}:`;
      [...entries.keys()].forEach((entryKey) => {
        if (entryKey.startsWith(prefix)) entries.delete(entryKey);
      });
      return;
    }
    entries.delete(key(namespace, id));
  }

  async function dedupe(namespace, id, loader, ttlMs = DEFAULT_TTL_MS) {
    const cached = get(namespace, id);
    if (cached !== undefined) return cached;

    const cacheKey = key(namespace, id);
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => set(namespace, id, value, ttlMs))
      .finally(() => inFlight.delete(cacheKey));

    inFlight.set(cacheKey, promise);
    return promise;
  }

  function installApiProfileCache() {
    const api = window.LYANN_API_CLIENT || window.apiClient;
    if (!api || api.__lyannProfileCacheInstalled) return false;

    if (typeof api.getProfile === 'function') {
      const originalGetProfile = api.getProfile.bind(api);
      api.getProfile = async (userId, options = {}) => {
        if (options?.fresh) {
          invalidate('profile', userId);
          return originalGetProfile(userId);
        }
        return dedupe('profile', userId, () => originalGetProfile(userId));
      };
    }

    if (typeof api.updateProfile === 'function') {
      const originalUpdateProfile = api.updateProfile.bind(api);
      api.updateProfile = async (userId, profileData) => {
        const result = await originalUpdateProfile(userId, profileData);
        invalidate('profile', userId);
        return result;
      };
    }

    api.__lyannProfileCacheInstalled = true;
    return true;
  }

  window.LYANN_DATA_CACHE = {
    get,
    set,
    invalidate,
    dedupe,
    installApiProfileCache
  };

  installApiProfileCache();
})();
