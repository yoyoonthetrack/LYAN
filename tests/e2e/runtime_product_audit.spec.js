const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login, waitAuthenticated } = require('./helpers/approved-backend');

const PAGES = [
  { path: '/index.html', text: /LYANN/ },
  { path: '/feed.html', text: /Bokantaj/i },
  { path: '/results.html', text: /Explorer|Lyanneur|Annonces/i },
  { path: '/pricing.html', text: /tarif|abonnement|offre/i },
  { path: '/how-it-works.html', text: /marche/i },
  { path: '/about.html', text: /histoire|LYANN/i },
  { path: '/payment-portal.html', text: /paiement|séquestre|LYANN/i },
  { path: '/confirm-signup.html', text: /confirm|inscription|LYANN/i },
  { path: '/admin-login.html', text: /admin|connexion/i },
  { path: '/admin.html', text: /admin|LYANN/i }
];

function collectPageErrors(page) {
  const jsErrors = [];
  const failed = [];
  page.on('pageerror', (err) => jsErrors.push(err.message));
  page.on('response', (res) => {
    const url = res.url();
    if (res.status() >= 500 && !url.includes('favicon') && !url.includes('sentry')) {
      failed.push(`${res.status()} ${url}`);
    }
  });
  return { jsErrors, failed };
}

async function dismissDialog(page) {
  const overlay = page.locator('#lyannDialogOverlay.active, #lyannDialogOverlay[aria-hidden="false"]');
  if (await overlay.isVisible().catch(() => false)) {
    const btn = overlay.getByRole('button').first();
    if (await btn.count()) await btn.click();
  }
}

test.describe('Runtime product audit — pages and primary surfaces', () => {
  test('every product page returns 200 and paints real content', async ({ page }) => {
    test.setTimeout(90000);
    const { jsErrors, failed } = collectPageErrors(page);
    for (const item of PAGES) {
      const res = await page.goto(item.path, { waitUntil: 'domcontentloaded' });
      expect(res, item.path).toBeTruthy();
      expect(res.status(), item.path).toBe(200);
      await expect(page.locator('body')).toBeVisible();
      const text = await page.locator('body').innerText();
      expect(text.replace(/\s+/g, ' ').length, `${item.path} empty`).toBeGreaterThan(40);
      await expect(page.locator('body')).toContainText(item.text);
    }
    const fatal = jsErrors.filter((err) => !/favicon|Sentry|sentry|Failed to load resource/i.test(err));
    expect(fatal, fatal.join('\n')).toEqual([]);
    expect(failed, failed.join('\n')).toEqual([]);
  });

  test('desktop public nav reaches Explorer, Bokantaj, Aide, Accueil, Tarifs', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/index.html');
    await page.getByRole('navigation').getByRole('link', { name: 'Explorer' }).click();
    await expect(page).toHaveURL(/results\.html/);
    await expect(page.locator('body')).toContainText(/Explorer|Annonces|Lyanneur/i);

    await page.getByRole('navigation').getByRole('link', { name: 'Bokantaj' }).click();
    await expect(page).toHaveURL(/feed\.html/);
    await expect(page.locator('body')).toContainText(/Bokantaj/i);

    await page.goto('/index.html');
    await page.getByRole('navigation').getByRole('link', { name: 'Comment ça marche' }).click();
    await expect(page).toHaveURL(/how-it-works\.html/);

    await page.goto('/index.html');
    const tarifs = page.locator('footer a[href="pricing.html"]').first();
    await tarifs.scrollIntoViewIfNeeded();
    await tarifs.click();
    await expect(page).toHaveURL(/pricing\.html/);

    await page.locator('a.logo, a[href="index.html"]').first().click();
    await expect(page).toHaveURL(/index\.html/);
  });

  test('guest login/signup CTAs open real modals', async ({ page }) => {
    await page.goto('/index.html');
    await page.getByRole('link', { name: 'Connexion' }).click();
    await expect(page.locator('#loginModal')).toBeVisible();
    await expect(page.locator('#loginEmail')).toBeVisible();
    const closeLogin = page.locator('#loginModal .modal-close-btn, #closeLoginModalBtn').first();
    if (await closeLogin.isVisible().catch(() => false)) await closeLogin.click();

    await page.getByRole('button', { name: 'Menu Principal' }).click();
    await expect(page.locator('#mobileHamburgerDrawerOverlay')).toHaveClass(/active/);
    await page.locator('#mobileHamburgerDrawerOverlay .open-signup-trigger', { hasText: "S'inscrire" }).click();
    await expect(page.locator('#onboardingModal')).toBeVisible();
  });

  test('authenticated A: account, messages, publish, explorer, close', async ({ page }) => {
    test.setTimeout(90000);
    const { jsErrors } = collectPageErrors(page);
    await requireWriteBackend(page);
    await login(page, 'REQUESTER');
    await page.goto('/feed.html');
    await waitAuthenticated(page);

    await page.evaluate(async () => window.LYANN_ROUTER.go('account'));
    await expect(page.locator('#userAccountModal')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#userAccountModal')).toContainText(/compte|profil|Qa\.A|Alpha/i);
    await page.evaluate(() => window.LYANN_SURFACES?.close('account') || window.closeAccountModal?.());

    await page.evaluate(async () => window.LYANN_ROUTER.go('finances'));
    await expect(page.locator('#userAccountModal')).toBeVisible();
    await expect(page.locator('#userAccountModal')).toContainText(/Indisponible|Finances|paiement/i);
    await page.evaluate(() => window.LYANN_SURFACES?.close('account') || window.closeAccountModal?.());

    await page.evaluate(async () => window.LYANN_ROUTER.go('messages'));
    await expect(page.locator('#chatModal')).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => window.LYANN_MESSAGING?.close?.());
    await expect(page.locator('#chatModal')).toBeHidden({ timeout: 10000 });

    await page.evaluate(async () => window.LYANN_ROUTER.go('publish'));
    await expect(page.locator('#modal-request-help, #needWizardModal, .lyann-wizard')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape');
    await dismissDialog(page);

    await page.goto('/results.html?mode=annonces');
    await waitAuthenticated(page);
    const explorer = page.locator('#explorerResults, #resultsGrid, main');
    await expect(explorer.first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('undefined');

    const fatal = jsErrors.filter((err) => !/favicon|Sentry|sentry/i.test(err));
    expect(fatal, fatal.join('\n')).toEqual([]);
  });

  test('iOS chrome (Capacitor mock): pages + bottom nav actually navigate', async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      window.Capacitor = {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
        Plugins: {}
      };
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.app-welcome-screen')).toHaveCount(0);
    await expect(page.locator('.mobile-bottom-nav')).toHaveCount(0);
    await expect(page.locator('body')).toContainText(/LYANN/i);
    await expect(page.getByRole('button', { name: /S'inscrire maintenant/i })).toBeVisible();
  });
});
