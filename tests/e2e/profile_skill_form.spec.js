const { test, expect } = require('@playwright/test');

// The form lives in script.js and is built on demand by the shared account
// chrome, so any product page carrying that chrome exercises the real code.
async function openSkillForm(page) {
  await page.goto('/results.html?mode=lyanneurs', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('btnAddNewServiceHub'));
  await page.evaluate(() => document.getElementById('btnAddNewServiceHub').click());
  await expect(page.locator('#addServiceModal')).toBeVisible();
}

test('a skill can be added with no price, and the optional fields say so', async ({ page }) => {
  await openSkillForm(page);

  await expect(page.locator('#serviceTitle')).toHaveAttribute('required', '');
  for (const field of ['servicePrice', 'serviceBilling', 'serviceDesc']) {
    await expect(page.locator(`#${field}`)).not.toHaveAttribute('required', /.*/);
    await expect(page.locator(`label[for="${field}"]`)).toContainText('facultatif');
  }
  await expect(page.locator('#addServiceModal .step-desc')).toContainText('Sur devis');

  const saved = [];
  await page.exposeFunction('qaRecordService', (args) => saved.push(args));
  await page.evaluate(() => {
    window.LYANN_API_CLIENT.addUserService = async (userId, title, price, billing, description) => {
      await window.qaRecordService({ title, price, billing, description });
      return { id: 'qa-service' };
    };
    window.lyannAlert = () => {};
  });

  await page.locator('#serviceTitle').fill('Réparation de clim');
  await page.locator('#addServiceForm button[type="submit"]').click();

  await expect.poll(() => saved.length).toBe(1);
  expect(saved[0].title).toBe('Réparation de clim');
  // No amount means "Sur devis"; a billing unit on its own would say nothing.
  expect(saved[0].price).toBe('Sur devis');
  expect(saved[0].billing).toBe('Sur devis');
});

test('keyboard open on a phone keeps the whole skill form above the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSkillForm(page);

  // iOS keeps innerHeight, vh and dvh at the full screen when the keyboard is
  // up; only visualViewport shrinks. That is what the keyboard engine publishes.
  const visible = 508;
  await page.locator('#serviceTitle').focus();
  // The engine republishes the viewport for 300ms after focus; a headless
  // browser has no keyboard, so the shrunken viewport is applied afterwards.
  await page.waitForTimeout(600);
  await page.evaluate((height) => {
    document.documentElement.style.setProperty('--lyann-vv-height', height + 'px');
    document.documentElement.style.setProperty('--lyann-vv-offset', '0px');
    document.body.classList.add('keyboard-open');
  }, visible);

  const layout = await page.evaluate(() => {
    const box = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    // Scrolling the body is how a member reaches the end of the form.
    const body = document.querySelector('#addServiceModal .modal-body');
    body.scrollTop = body.scrollHeight;
    return {
      card: box('#addServiceModal .modal-card'),
      body: box('#addServiceModal .modal-body'),
      submit: box('#addServiceForm button[type="submit"]')
    };
  });

  expect(layout.card.top).toBeGreaterThanOrEqual(0);
  expect(layout.card.bottom).toBeLessThanOrEqual(visible);
  expect(layout.body.bottom).toBeLessThanOrEqual(visible);
  // Enregistrer must end up on screen, not stranded under the keyboard.
  expect(layout.submit.bottom).toBeLessThanOrEqual(visible);

  await page.locator('#addServiceModal').screenshot({ path: 'test-results/skill-form-keyboard.png' });
});
