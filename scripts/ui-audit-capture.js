const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const BASE = process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8080';
const OUT = path.join(__dirname, '..', 'artifacts', 'ui-audit');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  '/index.html',
  '/feed.html',
  '/results.html',
  '/results.html?mode=lyanneurs',
  '/pricing.html',
  '/how-it-works.html',
  '/about.html',
  '/payment-portal.html'
];

function metricsScript() {
  return () => {
    const doc = document.documentElement;
    const body = document.body;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    const nav = document.querySelector('nav.navbar, .navbar');
    const hero = document.querySelector('.hero, header.hero, h1');
    let overlap = 0;
    if (nav && hero) {
      const n = nav.getBoundingClientRect();
      const h = hero.getBoundingClientRect();
      overlap = Math.max(0, Math.min(n.bottom, h.bottom) - Math.max(n.top, h.top));
    }
    const h1 = document.querySelector('h1');
    const h1Text = h1 ? h1.innerText.trim().slice(0, 80) : '';
    const h1Hidden = h1 ? window.getComputedStyle(h1).visibility === 'hidden' || h1.getClientRects().length === 0 : true;
    const small = [...document.querySelectorAll('button, a.btn, .nav-tab')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      return r.height < 40 || r.width < 40;
    }).slice(0, 8).map((el) => ({
      name: (el.getAttribute('aria-label') || el.innerText || el.id || '').trim().slice(0, 40),
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height)
    }));
    return {
      title: document.title,
      h1: h1Text,
      h1Hidden,
      overflowX,
      navHeroOverlap: Math.round(overlap),
      bodyTextLen: (body.innerText || '').replace(/\s+/g, ' ').length,
      welcome: !!document.querySelector('.app-welcome-screen'),
      bottomNav: !!document.querySelector('.mobile-bottom-nav'),
      loginOpen: !!document.querySelector('#loginModal.active'),
      smallTargets: small
    };
  };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

(async () => {
  const browser = await chromium.launch();
  const report = [];

  async function capturePage(contextLabel, viewport, urlPath, extra) {
    const context = await browser.newContext({ viewport, baseURL: BASE });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));
    await page.goto(urlPath, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    if (extra) await extra(page);
    const m = await page.evaluate(metricsScript());
    const slug = `${contextLabel}-${urlPath.replace(/[/?=&]/g, '_').replace(/^_/, '')}`;
    await shot(page, slug);
    report.push({ context: contextLabel, path: urlPath, ...m, jsErrors: jsErrors.slice(0, 3) });
    await context.close();
  }

  for (const vp of [{ name: 'desktop', w: 1440, h: 900 }, { name: 'mobile', w: 390, h: 844 }]) {
    for (const p of PAGES) {
      await capturePage(vp.name, { width: vp.w, height: vp.h }, p);
    }
  }

  const guest = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: BASE });
  const gp = await guest.newPage();
  await gp.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} };
  });
  await gp.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await gp.waitForTimeout(1200);
  await shot(gp, 'ios-welcome');
  report.push({ context: 'ios-mock', path: '/index.html#welcome', ...(await gp.evaluate(metricsScript())) });
  if (await gp.locator('#btnWelcomeGuest').isVisible().catch(() => false)) {
    await gp.locator('#btnWelcomeGuest').click();
    await gp.waitForTimeout(600);
    await shot(gp, 'ios-guest-home');
    report.push({ context: 'ios-mock-guest', path: '/index.html#guest', ...(await gp.evaluate(metricsScript())) });
  }
  await guest.close();

  const email = process.env.LYANN_E2E_QA_A_EMAIL;
  const password = process.env.LYANN_E2E_QA_A_PASSWORD;
  if (email && password) {
    const auth = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
    const ap = await auth.newPage();
    await ap.goto('/index.html');
    await ap.evaluate(async ({ email, password }) => {
      await window.LYANN_API_CLIENT.login(email, password);
    }, { email, password });
    await ap.goto('/feed.html');
    await ap.waitForTimeout(1000);
    await shot(ap, 'auth-feed');
    report.push({ context: 'auth-A', path: '/feed.html', ...(await ap.evaluate(metricsScript())) });
    await ap.evaluate(async () => window.LYANN_ROUTER.go('account'));
    await ap.waitForTimeout(800);
    await shot(ap, 'auth-account');
    await ap.evaluate(async () => window.LYANN_ROUTER.go('messages'));
    await ap.waitForTimeout(800);
    await shot(ap, 'auth-messages');
    await ap.goto('/results.html?mode=annonces');
    await ap.waitForTimeout(1200);
    await shot(ap, 'auth-explorer-annonces');
    await ap.goto('/results.html?mode=lyanneurs');
    await ap.waitForTimeout(1200);
    await shot(ap, 'auth-explorer-lyanneurs');
    await auth.close();
  }

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
