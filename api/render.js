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
    let html = fs.readFileSync(filePath, 'utf8');

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
