# LYANN V1 — SENTRY OBSERVABILITY DOCUMENTATION

## 1. ARCHITECTURE & INITIALIZATION LOCATION
- **Centralized Initializer**: [sentry-init.js](file:///Users/mac/Developer/lyann/sentry-init.js)
- **Shared HTML Transformation**: [shared-html-build.js](file:///Users/mac/Developer/lyann/shared-html-build.js#L5) automatically includes `<script src="sentry-init.js?v=20260916"></script>` in `SHARED_RUNTIME_TAGS`.
- **Coverage**: All HTML pages on Web (rendered via Vercel `api/render.js`), local development (`api/server.js`), and Capacitor mobile builds (`build_mobile.js` -> `www/` -> iOS/Android asset bundles) automatically load `sentry-init.js`.
- **Zero HTML Duplication**: No code duplication or inline Sentry initialization script is required in individual HTML files.

---

## 2. ENVIRONMENT DETERMINATION
The runtime environment is automatically detected:
- **`production`**: `hostname` matches `lyann.app`, `www.lyann.app`, or `admin.lyann.app`
- **`preview`**: `hostname` matches `*.vercel.app`
- **`development`**: `hostname` matches `localhost`, `127.0.0.1`, `capacitor://`, `file://`

Override key: `window.LYANN_ENV` (e.g. `'production'`, `'preview'`, `'development'`).

---

## 3. DSN CONFIGURATION
The Sentry DSN is resolved cleanly at runtime:
1. `window.LYANN_SENTRY_DSN`
2. `window.__LYANN_CONFIG__.SENTRY_DSN`

### Configuration Instructions for Production/Preview:
- **Web / Vercel**: Set `window.LYANN_SENTRY_DSN = "YOUR_SENTRY_DSN_HERE";` in environment config or inject via Vercel environment variables / header script.
- **Mobile / Capacitor**: Set `window.LYANN_SENTRY_DSN` before script boot or in `sentry-init.js`.
- If DSN is not configured, `sentry-init.js` logs a clean notice without throwing errors or interrupting application boot.

---

## 4. PRIVACY & SENSITIVE DATA PROTECTION
LYANN handles private Caribbean user exchanges and transactions. Sentry is configured conservatively:
- **`beforeSend` Hook**: Strips `authorization`, `cookie`, `set-cookie` headers. Sanitizes sensitive keys (`password`, `token`, `secret`, `jwt`, `card`, `stripe`, `content`, `body`). Deletes user PII (`email`, `username`, `ip_address`).
- **`beforeBreadcrumb` Hook**: Sanitizes XHR/fetch URLs involving auth or payment endpoints.
- **Session Replay Privacy**:
  - `maskAllText: true` (All user text masked by default)
  - `blockAllMedia: true` (All media blocked by default)
  - `maskAllInputs: true` (Form inputs masked)

---

## 5. SAMPLING & PERFORMANCE MONITORING
- **Error Sample Rate**: `1.0` (100% of uncaught JS errors and unhandled rejections).
- **Traces Sample Rate (Performance)**:
  - `production`: `0.05` (5% sampling to protect user performance and quota).
  - `development` / `preview`: `0.20` (20% sampling).
- **Session Replay Sample Rate**:
  - Normal Sessions: `0.0` (0% normal session sampling for privacy and low overhead).
  - Sessions containing Errors (`replaysOnErrorSampleRate`): `0.5` in production / `1.0` in dev.

---

## 6. PLATFORM & CAPACITOR STATUS
- **WEB JAVASCRIPT MONITORING**: **`SUPPORTED`**
- **CAPACITOR JAVASCRIPT MONITORING**: **`SUPPORTED`** (Runs inside Capacitor WebView via shared `www/` build).
- **NATIVE IOS CRASH MONITORING**: **`NOT INSTALLED`** (Requires native Cocoa Sentry Pod and iOS build setup if native C/Obj-C crashes need monitoring).

---

## 7. SOURCE MAPS
- **Status**: **`NOT CURRENTLY SUPPORTED / REQUIRES BUILD CHANGE`**
- **Reason**: LYANN V1 serves unminified static JavaScript files (`api-client.js`, `script.js`, `chat-logic.js`, etc.) directly to the browser. Browser stack traces map directly to unminified source code line numbers without build-time source map generation.

---

## 8. SAFE DIAGNOSTIC TESTING (DEV & PREVIEW ONLY)
To test Sentry error capture without adding production UI buttons:
- **JS Console Helper**:
  - `window.__LYANN_SENTRY_TEST__.triggerException('Custom Test Message')`
  - `window.__LYANN_SENTRY_TEST__.triggerRejection('Custom Test Rejection')`
- **URL Query Trigger** (Blocked in production):
  - `https://your-preview-url.vercel.app/?sentry_test=exception`
  - `https://your-preview-url.vercel.app/?sentry_test=rejection`

---

## 9. REMAINING STEPS BEFORE PRODUCTION
1. Supply the production Sentry DSN into `window.LYANN_SENTRY_DSN` or Vercel environment config.
2. Verify live event ingestion in Sentry Dashboard after production deployment.
