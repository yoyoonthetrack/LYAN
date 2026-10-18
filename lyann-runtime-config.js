/**
 * Resolves which Supabase project the browser/native shell may use.
 * Production defaults are only for lyann.app and shipped native builds
 * that have no isolation lock. Local and Staging tests must inject config.
 */
(function attachLyannRuntimeConfig(root) {
  var PRODUCTION_REF = 'gzispjfoywklpqatjyop';
  var STAGING_V2_REF = 'tdktfbtqceldlaeqjtow';
  var PRODUCTION_URL = 'https://gzispjfoywklpqatjyop.supabase.co';
  var PRODUCTION_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';
  var PRODUCTION_ORIGIN = 'https://lyann.app';
  var PRODUCTION_HOSTS = {
    'lyann.app': true,
    'www.lyann.app': true,
    'admin.lyann.app': true
  };

  function supabaseRefFromUrl(url) {
    try {
      var host = new URL(String(url || '').replace(/\/$/, '')).hostname;
      var match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
      return match ? match[1] : '';
    } catch (e) {
      return '';
    }
  }

  function isDeployedLyannWebHost(hostname) {
    return Boolean(PRODUCTION_HOSTS[String(hostname || '')]);
  }

  function resolveLyannRuntimeConfig(input) {
    var cfg = input || {};
    var injectedUrl = cfg.injectedUrl ? String(cfg.injectedUrl).replace(/\/$/, '') : '';
    var injectedAnon = cfg.injectedAnon ? String(cfg.injectedAnon) : '';
    var lock = cfg.lock ? String(cfg.lock) : '';
    var hostname = cfg.hostname || '';
    var isNative = Boolean(cfg.isNative);
    var backendOrigin = cfg.backendOrigin;
    var hasExplicitBackend = Object.prototype.hasOwnProperty.call(cfg, 'backendOrigin') && backendOrigin != null;

    if (injectedUrl) {
      var injectedRef = supabaseRefFromUrl(injectedUrl);
      if (lock && injectedRef && injectedRef !== lock) {
        return { ok: false, code: 'SUPABASE_LOCK_MISMATCH', url: '', anonKey: '', backendOrigin: '' };
      }
      if (lock && lock !== PRODUCTION_REF && injectedRef === PRODUCTION_REF) {
        return { ok: false, code: 'SUPABASE_PRODUCTION_BLOCKED', url: '', anonKey: '', backendOrigin: '' };
      }
      return {
        ok: true,
        code: 'INJECTED',
        url: injectedUrl,
        anonKey: injectedAnon,
        backendOrigin: hasExplicitBackend ? String(backendOrigin).replace(/\/$/, '') : (lock && lock !== PRODUCTION_REF ? '' : (isNative ? PRODUCTION_ORIGIN : ''))
      };
    }

    if (lock && lock !== PRODUCTION_REF) {
      return { ok: false, code: 'SUPABASE_CONFIG_REQUIRED', url: '', anonKey: '', backendOrigin: '' };
    }

    if (isDeployedLyannWebHost(hostname) || (isNative && !lock)) {
      return {
        ok: true,
        code: isNative ? 'SHIPPED_NATIVE' : 'DEPLOYED_WEB',
        url: PRODUCTION_URL,
        anonKey: PRODUCTION_ANON_KEY,
        backendOrigin: hasExplicitBackend ? String(backendOrigin).replace(/\/$/, '') : (isNative ? PRODUCTION_ORIGIN : '')
      };
    }

    return { ok: false, code: 'SUPABASE_CONFIG_REQUIRED', url: '', anonKey: '', backendOrigin: '' };
  }

  var api = {
    PRODUCTION_REF: PRODUCTION_REF,
    STAGING_V2_REF: STAGING_V2_REF,
    PRODUCTION_URL: PRODUCTION_URL,
    PRODUCTION_ORIGIN: PRODUCTION_ORIGIN,
    supabaseRefFromUrl: supabaseRefFromUrl,
    isDeployedLyannWebHost: isDeployedLyannWebHost,
    resolveLyannRuntimeConfig: resolveLyannRuntimeConfig
  };

  root.LyannRuntimeConfig = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
