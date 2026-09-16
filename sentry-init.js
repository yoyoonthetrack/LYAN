/**
 * LYANN V1 — CANONICAL SENTRY OBSERVABILITY INITIALIZER
 * Centralized error, performance, and replay monitoring for Web & Capacitor.
 */
(() => {
  'use strict';

  if (window.__LYANN_SENTRY_INITIALIZED__) return;
  window.__LYANN_SENTRY_INITIALIZED__ = true;

  // 1. Environment Determination
  function getEnvironment() {
    if (window.LYANN_ENV) return window.LYANN_ENV;
    const host = (window.location && window.location.hostname) ? window.location.hostname.toLowerCase() : '';
    const href = (window.location && window.location.href) ? window.location.href.toLowerCase() : '';

    if (host === 'admin.lyann.app' || host === 'lyann.app' || host === 'www.lyann.app') {
      return 'production';
    }
    if (host.endsWith('.vercel.app') || href.includes('vercel.app')) {
      return 'preview';
    }
    return 'development';
  }

  // 2. DSN Resolution
  function getDsn() {
    return window.LYANN_SENTRY_DSN || window.__LYANN_CONFIG__?.SENTRY_DSN || null;
  }

  // 3. Privacy Sanitizer & Data Masking
  const SENSITIVE_KEYS = new Set([
    'password', 'passwd', 'pass', 'secret', 'token', 'access_token',
    'refresh_token', 'authorization', 'cookie', 'session', 'jwt',
    'stripe', 'card', 'cvc', 'cvv', 'key', 'service_role', 'body', 'content'
  ]);

  function sanitizeObject(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeObject(item, depth + 1));
    }
    const clean = {};
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token')) {
        clean[key] = '[FILTERED_SENSITIVE_DATA]';
      } else {
        clean[key] = sanitizeObject(obj[key], depth + 1);
      }
    }
    return clean;
  }

  function beforeSend(event, hint) {
    if (!event) return event;

    // Strip request headers/cookies if present
    if (event.request) {
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['set-cookie'];
      }
      if (event.request.cookies) {
        delete event.request.cookies;
      }
      if (event.request.data) {
        event.request.data = sanitizeObject(event.request.data);
      }
    }

    // Sanitize extra / user context
    if (event.extra) {
      event.extra = sanitizeObject(event.extra);
    }
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
      delete event.user.ip_address;
    }

    return event;
  }

  function beforeBreadcrumb(breadcrumb) {
    if (!breadcrumb) return null;
    if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
      const url = String(breadcrumb.data?.url || '');
      if (url.includes('auth/v1') || url.includes('stripe') || url.includes('login') || url.includes('signup')) {
        if (breadcrumb.data) {
          delete breadcrumb.data.body;
          delete breadcrumb.data.status_code;
        }
      }
    }
    return breadcrumb;
  }

  // 4. Sentry Initialization
  function initSentry(Sentry) {
    const dsn = getDsn();
    const env = getEnvironment();
    const release = window.LYANN_RELEASE || window.LYANN_GIT_SHA || null;

    if (!dsn) {
      console.log(`[LYANN SENTRY] Initialized in ${env} mode (DSN not configured).`);
      return;
    }

    const isProd = env === 'production';
    const isDev = env === 'development';

    try {
      Sentry.init({
        dsn: dsn,
        environment: env,
        release: release || undefined,

        // Error Monitoring
        sampleRate: 1.0,

        // Performance Monitoring (Tracing)
        tracesSampleRate: isProd ? 0.05 : 0.2,

        // Session Replay Configuration
        replaysSessionSampleRate: 0.0, // 0% normal sessions (Privacy & overhead protection)
        replaysOnErrorSampleRate: isDev ? 1.0 : 0.5, // 50% on error in prod, 100% in dev

        beforeSend,
        beforeBreadcrumb,

        integrations: [
          Sentry.browserTracingIntegration ? Sentry.browserTracingIntegration() : null,
          Sentry.replayIntegration ? Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
            maskAllInputs: true
          }) : null
        ].filter(Boolean),

        debug: false
      });

      console.log(`⚡ [LYANN SENTRY] Operational (${env} mode)`);
    } catch (err) {
      console.error('[LYANN SENTRY] Initialization failed:', err);
    }
  }

  // 5. SDK Loader Guard
  function loadAndInit() {
    if (window.Sentry && typeof window.Sentry.init === 'function') {
      initSentry(window.Sentry);
    } else {
      const script = document.createElement('script');
      script.src = 'https://browser.sentry-cdn.com/8.38.0/bundle.tracing.replay.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.Sentry && typeof window.Sentry.init === 'function') {
          initSentry(window.Sentry);
        }
      };
      script.onerror = () => {
        console.warn('[LYANN SENTRY] Sentry SDK CDN bundle unavailable.');
      };
      document.head.appendChild(script);
    }
  }

  // 6. Safe Diagnostic Testing Helper (Dev/Preview Only)
  window.__LYANN_SENTRY_TEST__ = {
    triggerException(msg = '[LYANN SENTRY DIAGNOSTIC TEST EXCEPTION]') {
      const env = getEnvironment();
      console.warn(`[LYANN SENTRY TEST] Triggering exception in ${env} environment...`);
      const testErr = new Error(msg);
      if (window.Sentry && typeof window.Sentry.captureException === 'function') {
        window.Sentry.captureException(testErr);
      }
      throw testErr;
    },
    triggerRejection(msg = '[LYANN SENTRY DIAGNOSTIC TEST UNHANDLED REJECTION]') {
      const env = getEnvironment();
      console.warn(`[LYANN SENTRY TEST] Triggering promise rejection in ${env} environment...`);
      const testErr = new Error(msg);
      if (window.Sentry && typeof window.Sentry.captureException === 'function') {
        window.Sentry.captureException(testErr);
      }
      return Promise.reject(testErr);
    }
  };

  function checkUrlDiagnosticTrigger() {
    const env = getEnvironment();
    if (env === 'production') return;

    try {
      const params = new URLSearchParams(window.location.search);
      const testParam = params.get('sentry_test');
      if (testParam === 'exception') {
        setTimeout(() => window.__LYANN_SENTRY_TEST__.triggerException(), 500);
      } else if (testParam === 'rejection') {
        setTimeout(() => window.__LYANN_SENTRY_TEST__.triggerRejection(), 500);
      }
    } catch (_) {}
  }

  // Synchronous boot initialization
  loadAndInit();
  checkUrlDiagnosticTrigger();
})();
