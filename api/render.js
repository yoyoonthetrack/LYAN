const fs = require('fs');
const path = require('path');

const ALLOWED_PAGES = new Set([
  'index.html',
  'feed.html',
  'results.html',
  'payment-portal.html',
  'pricing.html',
  'how-it-works.html',
  'about.html',
  'confirm-signup.html'
]);

function sanitizeStaticHtml(html) {
  let out = html;

  // Remove the historical homepage fixture sections at the source-response level.
  out = out.replace(
    /\n\s*<!-- ========== SECTION 5 : TALENTS DE NOS ÎLES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->)/,
    '\n'
  );
  out = out.replace(
    /\n\s*<!-- ========== SECTION 6 : TÉMOIGNAGES ========== -->[\s\S]*?(?=\n\s*<!-- ========== SECTION APERÇU : BOKANTAJ EN DIRECT ========== -->)/,
    '\n'
  );

  // Replace fake availability numbers with neutral navigation copy.
  out = out.replace(/<span class="photo-category-sub">\s*\d+\s+(?:artisans?|passionnés?|électriciens?|plombiers?|accompagnateurs?)[^<]*<\/span>/gi,
    '<span class="photo-category-sub">Explorer cette activité</span>');

  // Legacy/demo wording should never ship in the raw production HTML.
  out = out
    .replace(/Coup de pouce/g, 'Service de confiance')
    .replace(/coup de pouce/g, 'service de confiance')
    .replace(/\s*\(Simulé\)/gi, '')
    .replace(/Bonjour David\b/g, 'Bonjour')
    .replace(/Zone de Test/g, 'Fonctionnalité')
    .replace(/David\.M/g, 'Utilisateur')
    .replace(/Tati Huguette/g, 'Membre LYANN');

  // Conservative removal of known historical test cards/blocks outside the
  // dedicated sections above. Only remove bounded card/article containers.
  const markers = ['Utilisateur', 'Membre LYANN', 'Fonctionnalité'];
  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const divCard = new RegExp(`<div\\b[^>]*class="[^"]*(?:demo|test)[^"]*"[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/div>`, 'gi');
    const article = new RegExp(`<article\\b[^>]*(?:data-demo|data-test-fixture)[^>]*>[\\s\\S]*?${escaped}[\\s\\S]*?<\\/article>`, 'gi');
    out = out.replace(divCard, '').replace(article, '');
  }

  return out;
}

module.exports = function handler(req, res) {
  const requested = Array.isArray(req.query?.file) ? req.query.file[0] : req.query?.file;
  const file = typeof requested === 'string' ? requested : 'index.html';

  if (!ALLOWED_PAGES.has(file)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }

  try {
    const filePath = path.join(process.cwd(), file);
    let html = sanitizeStaticHtml(fs.readFileSync(filePath, 'utf8'));

    // Defense in depth for any fixture-like DOM injected later by client code.
    const hygieneScript = '<script src="/production-hygiene.js?v=20260911" defer></script>';
    if (!html.includes('production-hygiene.js')) {
      html = html.includes('</body>')
        ? html.replace('</body>', `  ${hygieneScript}\n</body>`)
        : `${html}\n${hygieneScript}`;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.end(html);
  } catch (error) {
    console.error('[LYANN render] unable to render page', { file, message: error.message });
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Unable to render page');
  }
};
