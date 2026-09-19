const fs = require('fs');

const HYGIENE_SCRIPT_TAG = '<script src="production-hygiene.js?v=20260916-5" defer></script>';
const SHARED_RUNTIME_TAGS = [
  '<script src="sentry-init.js?v=20260916-5"></script>',
  '<script src="surface-manager.js?v=20260916-5"></script>',
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

  out = out.replace(
    /\n\s*<!-- ========== SECTION 5 : TALENTS DE NOS ÎLES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->)/,
    '\n'
  );
  out = out.replace(
    /\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION APERÇU : BOKANTAJ EN DIRECT ========== -->)/,
    '\n'
  );

  out = out.replace(
    /<span class="photo-category-sub">\s*\d+\s+(?:artisans?|passionnés?|électriciens?|plombiers?|accompagnateurs?)[^<]*<\/span>/gi,
    '<span class="photo-category-sub">Explorer cette activité</span>'
  );

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

function buildHtml(html) {
  return enforceScriptCacheBusting(injectSharedStylesheet(injectProductionHygiene(injectSharedRuntime(injectDataCache(sanitizeStaticHtml(html))))));
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
  buildHtml,
  buildHtmlFile
};
