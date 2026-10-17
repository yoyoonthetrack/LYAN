const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const HYGIENE_SCRIPT_TAG = '<script src="production-hygiene.js?v=20260922w" defer></script>';
const SHARED_RUNTIME_TAGS = [
  '<script src="sentry-init.js?v=20260916-5"></script>',
  '<script src="surface-manager.js?v=20261015j"></script>',
  '<script src="app-router.js?v=20260916-5"></script>',
  '<script src="safety-repository.js?v=20260916-5"></script>',
  '<script src="legacy-compat.js?v=20260916-5"></script>',
  '<script src="pull-to-refresh.js?v=20261007a"></script>',
  '<script src="payout-account.js?v=20261015j"></script>',
  '<script src="finance-policy-ui.js"></script>'
];
const SHARED_RUNTIME_ANCHORS = [
  'sentry-init.js',
  'api-client.js',
  'app-shell.js',
  'messaging-ui.js',
  'script.js'
];

function sanitizeStaticHtml(html) {
  let out = String(html || '');

  out = out
    .replace(/Coup de pouce/g, 'Service de confiance')
    .replace(/coup de pouce/g, 'service de confiance')
    .replace(/\s*\(Simulé\)/gi, '')
    .replace(/Bonjour David\b/g, 'Bonjour')
    .replace(/Zone de Test/g, 'Fonctionnalité')
    .replace(/David\.M/g, 'Utilisateur')
    .replace(/Tati Huguette/g, 'Membre LYANN');

  const markers = ['Utilisateur', 'Membre LYANN', 'Fonctionnalité'];
  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const divCard = new RegExp(`<div\\b[^>]*class="[^"]*(?:demo|test)[^"]*"[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/div>`, 'gi');
    const article = new RegExp(`<article\\b[^>]*(?:data-demo|data-test-fixture)[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/article>`, 'gi');
    out = out.replace(divCard, '').replace(article, '');
  }

  return out;
}

function injectScriptOnce(html, tag, needle) {
  let out = String(html || '');
  if (out.includes(needle)) return out;
  return out.includes('</body>')
    ? out.replace('</body>', `  ${tag}\n</body>`)
    : `${out}\n${tag}\n`;
}

function isAuthCallbackPage(html) {
  return String(html || '').includes('data-lyann-auth-callback');
}

function injectRuntimeConfigScript(html) {
  let out = String(html || '');
  if (out.includes('lyann-runtime-config.js') || !out.includes('api-client.js')) return out;
  const tag = '    <script src="lyann-runtime-config.js"></script>\n';
  const apiAt = out.indexOf('api-client.js');
  const scriptAt = out.lastIndexOf('<script', apiAt);
  if (scriptAt >= 0) return `${out.slice(0, scriptAt)}${tag}${out.slice(scriptAt)}`;
  return out;
}

function injectSharedRuntime(html) {
  const out = injectRuntimeConfigScript(String(html || ''));
  if (isAuthCallbackPage(out)) return out;
  const missingTags = SHARED_RUNTIME_TAGS.filter((tag) => {
    const match = tag.match(/src="([^"]+)"/);
    const needle = match ? match[1].split('?')[0] : tag;
    return !out.includes(needle);
  });

  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '';
  let dsnTag = '';
  if (dsn && !out.includes('window.LYANN_SENTRY_DSN')) {
    dsnTag = `    <script>window.LYANN_SENTRY_DSN=${JSON.stringify(dsn)};</script>\n`;
  }

  if (!missingTags.length) return dsnTag ? out.replace('</head>', `${dsnTag}</head>`) : out;

  const block = `${dsnTag}${missingTags.map((tag) => `    ${tag}`).join('\n')}\n`;
  const anchorPositions = SHARED_RUNTIME_ANCHORS
    .map((anchor) => {
      const idx = out.indexOf(anchor);
      if (idx < 0) return -1;
      return out.lastIndexOf('<script', idx);
    })
    .filter((position) => position >= 0);

  if (anchorPositions.length) {
    const insertAt = Math.min(...anchorPositions);
    return `${out.slice(0, insertAt)}${block}${out.slice(insertAt)}`;
  }

  return out.includes('</body>')
    ? out.replace('</body>', `${block}</body>`)
    : `${out}\n${block}`;
}

function injectProductionHygiene(html) {
  if (isAuthCallbackPage(html)) return html;
  return injectScriptOnce(html, HYGIENE_SCRIPT_TAG, 'production-hygiene.js');
}

function injectSharedStylesheet(html) {
  let out = String(html || '');
  if (isAuthCallbackPage(out)) return out;
  // Ignore admin pages which use admin-style.css
  if (out.includes('admin-style.css')) return out;
  if (out.includes('style.css') && !out.includes('finance-desk.css')) {
    out = out.replace(
      /(<link rel="stylesheet" href="style\.css[^"]*">)/,
      '$1\n    <link rel="stylesheet" href="finance-desk.css">'
    );
  }
  if (!out.includes('style.css')) {
    const stylesheetTag = '    <link rel="stylesheet" href="style.css?v=20261007">';
    return out.includes('</head>')
      ? out.replace('</head>', `${stylesheetTag}\n</head>`)
      : `${stylesheetTag}\n${out}`;
  }
  return out;
}

const BOOT_SPLASH_SKIP_SCRIPT = `<style>html.lyann-boot-splash-skip .lyann-boot-splash{display:none!important}</style>
    <script>(function(){try{var skip=sessionStorage.getItem('lyann_boot_splash_seen')==='1'||/Playwright|HeadlessChrome/i.test(navigator.userAgent);if(skip)document.documentElement.classList.add('lyann-boot-splash-skip');}catch(e){}})();</script>`;
const BOOT_SPLASH_MARKUP = `<div id="lyannBootSplash" class="lyann-boot-splash" role="status" aria-label="Chargement de LYANN" style="position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#F8F8F5;border:0;margin:0;padding:0;box-shadow:none;">
  <img src="lyann-boot-logo.webp" alt="" width="132" height="132" decoding="async" style="width:132px;height:132px;border:0;outline:none;box-shadow:none;background:#F8F8F5;display:block;border-radius:0;mix-blend-mode:darken;">
</div>
<script>
(function(){
  var el=document.getElementById('lyannBootSplash');
  if(!el) return;
  var skip=false;
  try { skip=sessionStorage.getItem('lyann_boot_splash_seen')==='1'; } catch(e) {}
  if(skip || /Playwright|HeadlessChrome/i.test(navigator.userAgent) || (window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)){
    el.remove();
    return;
  }
  try { sessionStorage.setItem('lyann_boot_splash_seen','1'); } catch(e) {}
  function hide(){
    if(!el||!el.parentNode) return;
    el.classList.add('is-done');
    setTimeout(function(){ if(el&&el.parentNode) el.remove(); }, 380);
  }
  var shownAt=Date.now();
  function hideWhenReady(){ setTimeout(hide, Math.max(0, 1200-(Date.now()-shownAt))); }
  if(document.readyState==='complete') hideWhenReady(); else window.addEventListener('load', hideWhenReady, {once:true});
  setTimeout(hide, 4000);
})();
</script>`;

function injectBootSplash(html) {
  let out = String(html || '');
  if (out.includes('admin-style.css')) return out;
  if (out.includes('id="lyannBootSplash"')) return out;
  if (out.includes('Confirmation de votre adresse email')) return out;
  if (out.includes('data-lyann-auth-callback')) return out;
  if (out.includes('LYANN Enterprise')) return out;
  if (out.includes('</head>') && !out.includes('lyann-boot-splash-skip')) {
    out = out.replace('</head>', `    ${BOOT_SPLASH_SKIP_SCRIPT}\n</head>`);
  }
  if (/<body[^>]*>/i.test(out)) {
    return out.replace(/<body([^>]*)>/i, `<body$1>\n${BOOT_SPLASH_MARKUP}`);
  }
  return out;
}

function assetVersion() {
  const fromEnv = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || '';
  if (fromEnv) {
    return fromEnv.replace(/[^A-Za-z0-9]/g, '').slice(-12);
  }
  const hash = crypto.createHash('sha1');
  for (const file of fs.readdirSync(__dirname).filter((f) => /\.(js|css)$/.test(f)).sort()) {
    hash.update(file).update(fs.readFileSync(path.join(__dirname, file)));
  }
  return hash.digest('hex').slice(0, 12);
}

const QUIET_CONSOLE_SCRIPT = "(function(){try{var h=location.hostname,p=location.protocol;var prod=h==='lyann.app'||h==='www.lyann.app'||p==='capacitor:';if(!prod||/lyann_debug=1/.test(location.search)||localStorage.getItem('lyann_debug')==='1')return;var n=function(){};console.log=n;console.debug=n;console.info=n;}catch(e){}})();";

function isRemoteAsset(assetPath) {
  return /^(?:[a-z]+:)?\/\//i.test(assetPath) || assetPath.startsWith('data:');
}

function enforceScriptCacheBusting(html) {
  const version = assetVersion();
  return String(html || '')
    .replace(/src="([^"]+\.js)(?:\?(?:v|build)=[^"]*)?"/gi, (match, scriptPath) => (
      isRemoteAsset(scriptPath) ? match : `src="${scriptPath}?build=${version}"`
    ))
    .replace(/href="([^"]+\.css)(?:\?(?:v|build)=[^"]*)?"/gi, (match, stylePath) => (
      isRemoteAsset(stylePath) ? match : `href="${stylePath}?build=${version}"`
    ))
    .replace('</head>', `    <script>window.LYANN_ASSET_VERSION=${JSON.stringify(version)};${QUIET_CONSOLE_SCRIPT}</script>\n</head>`);
}

function injectDataCache(html) {
  let out = String(html || '');
  if (out.includes('data-cache.js')) return out;
  if (out.includes('auth-state.js')) {
    return out.replace(
      /(<script src="auth-state\.js[^"]*"><\/script>)/,
      '$1\n    <script src="data-cache.js"></script>'
    );
  }
  return out;
}

function lanIpv4() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets || {})) {
      for (const net of nets[name] || []) {
        const family = net.family === 'IPv4' || net.family === 4;
        if (family && !net.internal && net.address && !net.address.startsWith('169.254.')) return net.address;
      }
    }
  } catch (_) {}
  return '';
}

function isLoopbackHttpOrigin(value) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(String(value || '').replace(/\/$/, ''));
}

function nativeBuildStamp() {
  const id = String(process.env.LYANN_NATIVE_BUILD_ID || '').trim();
  const at = String(process.env.LYANN_NATIVE_BUILD_AT || '').trim();
  if (!id) return null;
  return { id, at };
}

function resolveInjectedBackendOrigin() {
  let backend = process.env.LYANN_E2E_BASE_URL != null
    ? String(process.env.LYANN_E2E_BASE_URL).replace(/\/$/, '')
    : '';
  if (process.env.LYANN_MOBILE_BUILD !== '1') return backend;
  if (!isLoopbackHttpOrigin(backend)) return backend;
  const portMatch = String(backend).match(/:(\d+)$/);
  const port = portMatch ? portMatch[1] : '8098';
  const lan = String(process.env.LYANN_NATIVE_BACKEND_ORIGIN || '').replace(/\/$/, '') || lanIpv4();
  if (!lan) return '';
  if (/^https?:\/\//i.test(lan)) return isLoopbackHttpOrigin(lan) ? '' : lan;
  return 'http://' + lan.replace(/^\[|\]$/g, '') + ':' + port;
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return payload.role || null;
  } catch (_) {
    return null;
  }
}

function jwtRef(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return payload.ref || null;
  } catch (_) {
    return null;
  }
}

function injectIsolatedSupabaseConfig(html) {
  if (process.env.VERCEL_ENV === 'production') return html;
  if (process.env.LYANN_E2E_ALLOW_WRITES !== '1') return html;
  const url = String(process.env.LYANN_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.LYANN_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const lock = String(process.env.LYANN_E2E_WRITE_PROJECT_REF || process.env.LYANN_SUPABASE_LOCK || '');
  if (!url || !anon) return html;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
    return html;
  }
  if (host === 'gzispjfoywklpqatjyop.supabase.co' || host.includes('gzispjfoywklpqatjyop')) return html;
  if (!host.endsWith('.supabase.co')) return html;
  if (lock === 'gzispjfoywklpqatjyop') return html;
  if (jwtRole(anon) === 'service_role') {
    throw new Error('injectIsolatedSupabaseConfig: refused service_role in browser inject');
  }
  if (jwtRef(anon) === 'gzispjfoywklpqatjyop') return html;
  const projectRef = host.replace(/\.supabase\.co$/i, '');
  const backend = resolveInjectedBackendOrigin();
  let out = String(html || '');
  if (out.includes('window.LYANN_SUPABASE_URL')) return out;
  if (!out.includes('lyann-runtime-config.js')) {
    const runtimeTag = '    <script src="lyann-runtime-config.js"></script>\n';
    const apiAt = out.indexOf('api-client.js');
    if (apiAt > 0) {
      const scriptAt = out.lastIndexOf('<script', apiAt);
      if (scriptAt >= 0) out = `${out.slice(0, scriptAt)}${runtimeTag}${out.slice(scriptAt)}`;
    }
  }
  const stamp = nativeBuildStamp();
  const stampAssign = stamp
    ? `window.LYANN_NATIVE_BUILD_ID=${JSON.stringify(stamp.id)};window.LYANN_NATIVE_BUILD_AT=${JSON.stringify(stamp.at)};`
    : '';
  const tag = `    <script>window.LYANN_SUPABASE_URL=${JSON.stringify(url)};window.LYANN_SUPABASE_ANON_KEY=${JSON.stringify(anon)};window.LYANN_SUPABASE_LOCK=${JSON.stringify(lock || projectRef)};window.LYANN_BACKEND_ORIGIN=${JSON.stringify(backend)};${stampAssign}</script>\n`;
  const apiClientAt = out.indexOf('api-client.js');
  if (apiClientAt > 0) {
    const scriptAt = out.lastIndexOf('<script', apiClientAt);
    if (scriptAt >= 0) return `${out.slice(0, scriptAt)}${tag}${out.slice(scriptAt)}`;
  }
  return out.includes('</head>') ? out.replace('</head>', `${tag}</head>`) : `${tag}${out}`;
}

function lazyLoadImages(html) {
  let seen = 0;
  return String(html || '').replace(/<img\b([^>]*)>/gi, (tag, attrs) => {
    seen += 1;
    if (seen <= 4 || /\bloading=|\bfetchpriority=|logo|hero|lyannBootSplash/i.test(attrs)) return tag;
    return `<img loading="lazy" decoding="async"${attrs}>`;
  });
}

const BUILT_MARKER = 'window.LYANN_ASSET_VERSION=';

function buildHtml(html) {
  if (String(html || '').includes(BUILT_MARKER)) return String(html);
  return lazyLoadImages(enforceScriptCacheBusting(injectBootSplash(injectSharedStylesheet(injectProductionHygiene(injectSharedRuntime(injectDataCache(sanitizeStaticHtml(html))))))));
}

function buildHtmlFile(sourcePath, destinationPath = sourcePath) {
  // Preview/isolated builds inject Staging config into static HTML because
  // Vercel serves built files before /api/render rewrites. Production
  // (VERCEL_ENV=production) is a no-op inside injectIsolatedSupabaseConfig.
  const html = injectIsolatedSupabaseConfig(buildHtml(fs.readFileSync(sourcePath, 'utf8')));
  fs.writeFileSync(destinationPath, html, 'utf8');
  return html;
}

module.exports = {
  HYGIENE_SCRIPT_TAG,
  SHARED_RUNTIME_TAGS,
  SHARED_RUNTIME_ANCHORS,
  sanitizeStaticHtml,
  injectSharedRuntime,
  injectProductionHygiene,
  injectIsolatedSupabaseConfig,
  injectRuntimeConfigScript,
  injectBootSplash,
  resolveInjectedBackendOrigin,
  nativeBuildStamp,
  buildHtml,
  buildHtmlFile
};
