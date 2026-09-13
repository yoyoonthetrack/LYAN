const fs = require('fs');

const HYGIENE_SCRIPT_TAG = '<script src="production-hygiene.js?v=20260914" defer></script>';
const SHARED_RUNTIME_TAGS = [
  '<script src="surface-manager.js?v=20260914" defer></script>',
  '<script src="app-router.js?v=20260914" defer></script>',
  '<script src="legacy-compat.js?v=20260914" defer></script>'
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
  let out = String(html || '');
  for (const tag of SHARED_RUNTIME_TAGS) {
    const match = tag.match(/src="([^"]+)"/);
    const needle = match ? match[1].split('?')[0] : tag;
    out = injectScriptOnce(out, tag, needle);
  }
  return out;
}

function injectProductionHygiene(html) {
  return injectScriptOnce(html, HYGIENE_SCRIPT_TAG, 'production-hygiene.js');
}

function buildHtml(html) {
  return injectProductionHygiene(injectSharedRuntime(sanitizeStaticHtml(html)));
}

function buildHtmlFile(sourcePath, destinationPath = sourcePath) {
  const html = buildHtml(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(destinationPath, html, 'utf8');
  return html;
}

module.exports = {
  HYGIENE_SCRIPT_TAG,
  SHARED_RUNTIME_TAGS,
  sanitizeStaticHtml,
  injectSharedRuntime,
  injectProductionHygiene,
  buildHtml,
  buildHtmlFile
};
