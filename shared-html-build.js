const fs = require('fs');

const HYGIENE_SCRIPT_TAG = '<script src="production-hygiene.js?v=20260922w" defer></script>';
const SHARED_RUNTIME_TAGS = [
  '<script src="sentry-init.js?v=20260916-5"></script>',
  '<script src="surface-manager.js?v=20260922s"></script>',
  '<script src="app-router.js?v=20260916-5"></script>',
  '<script src="safety-repository.js?v=20260916-5"></script>',
  '<script src="legacy-compat.js?v=20260916-5"></script>'
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

function injectSharedRuntime(html) {
  const out = String(html || '');
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
  return injectScriptOnce(html, HYGIENE_SCRIPT_TAG, 'production-hygiene.js');
}

function injectSharedStylesheet(html) {
  let out = String(html || '');
  // Ignore admin pages which use admin-style.css
  if (out.includes('admin-style.css')) return out;
  if (!out.includes('style.css')) {
    const stylesheetTag = '    <link rel="stylesheet" href="style.css?v=20260916">';
    return out.includes('</head>')
      ? out.replace('</head>', `${stylesheetTag}\n</head>`)
      : `${stylesheetTag}\n${out}`;
  }
  return out;
}

const BOOT_SPLASH_SKIP_SCRIPT = `<style>html.lyann-boot-splash-skip .lyann-boot-splash{display:none!important}</style>
    <script>(function(){try{var skip=sessionStorage.getItem('lyann_boot_splash_seen')==='1'||/Playwright|HeadlessChrome/i.test(navigator.userAgent);if(skip)document.documentElement.classList.add('lyann-boot-splash-skip');}catch(e){}})();</script>`;
const BOOT_SPLASH_MARKUP = `<div id="lyannBootSplash" class="lyann-boot-splash" role="status" aria-label="Chargement de LYANN" style="position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#FFFFFF;border:0;margin:0;padding:0;box-shadow:none;">
  <img src="lyann-boot-logo.gif" alt="" width="88" height="88" decoding="async" style="width:88px;height:88px;border:0;outline:none;box-shadow:none;background:transparent;display:block;border-radius:0;mix-blend-mode:darken;">
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
  setTimeout(hide, 5000);
})();
</script>`;

function injectBootSplash(html) {
  let out = String(html || '');
  if (out.includes('admin-style.css')) return out;
  if (out.includes('id="lyannBootSplash"')) return out;
  if (out.includes('Confirmation de votre adresse email')) return out;
  if (out.includes('LYANN Enterprise')) return out;
  if (out.includes('</head>') && !out.includes('lyann-boot-splash-skip')) {
    out = out.replace('</head>', `    ${BOOT_SPLASH_SKIP_SCRIPT}\n</head>`);
  }
  if (/<body[^>]*>/i.test(out)) {
    return out.replace(/<body([^>]*)>/i, `<body$1>\n${BOOT_SPLASH_MARKUP}`);
  }
  return out;
}

function enforceScriptCacheBusting(html) {
  const version = '20260918-human-qa1';
  return String(html || '').replace(/src="([^"]+\.js)(?:\?v=[^"]*)?"/gi, (match, scriptPath) => {
    if (scriptPath.startsWith('http://') || scriptPath.startsWith('https://') || scriptPath.startsWith('//')) {
      return match;
    }
    return `src="${scriptPath}?v=${version}"`;
  });
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

function injectIsolatedSupabaseConfig(html) {
  if (process.env.VERCEL_ENV === 'production') return html;
  if (process.env.LYANN_E2E_ALLOW_WRITES !== '1') return html;
  const url = String(process.env.LYANN_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.LYANN_SUPABASE_ANON_KEY || '';
  if (!url || !anon) return html;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch (e) {
    return html;
  }
  if (host === 'gzispjfoywklpqatjyop.supabase.co') return html;
  if (!host.endsWith('.supabase.co')) return html;
  let out = String(html || '');
  if (out.includes('window.LYANN_SUPABASE_URL')) return out;
  const tag = `    <script>window.LYANN_SUPABASE_URL=${JSON.stringify(url)};window.LYANN_SUPABASE_ANON_KEY=${JSON.stringify(anon)};</script>\n`;
  const apiClientAt = out.indexOf('api-client.js');
  if (apiClientAt > 0) {
    const scriptAt = out.lastIndexOf('<script', apiClientAt);
    if (scriptAt >= 0) return `${out.slice(0, scriptAt)}${tag}${out.slice(scriptAt)}`;
  }
  return out.includes('</head>') ? out.replace('</head>', `${tag}</head>`) : `${tag}${out}`;
}

function buildHtml(html) {
  return enforceScriptCacheBusting(injectBootSplash(injectSharedStylesheet(injectProductionHygiene(injectSharedRuntime(injectDataCache(sanitizeStaticHtml(html)))))));
}

function buildHtmlFile(sourcePath, destinationPath = sourcePath) {
  const html = buildHtml(fs.readFileSync(sourcePath, 'utf8'));
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
  injectBootSplash,
  buildHtml,
  buildHtmlFile
};
