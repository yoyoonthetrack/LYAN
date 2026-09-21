const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Accueil story and Explorer search', () => {

  test('Home keeps the greeting and story, without the old search block', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Qui peut vous aider');
    await expect(page.locator('.hero-subtitle')).toContainText('réseau de confiance');
    await expect(page.locator('.hero-story-video, .hero-story-still').first()).toBeVisible();
    await expect(page.locator('#heroSearchForm')).toHaveCount(0);
    await expect(page.locator('#searchV2IntentContainer')).toHaveCount(0);
    await expect(page.getByText('Comment peut-on t’aider ?')).toHaveCount(0);

    expect(jsErrors).toEqual([]);
  });

  test('Search lives in Explorer', async ({ page }) => {
    await page.goto('/results.html');
    await expect(page.locator('#explorerSearchForm')).toBeVisible();
    await expect(page.locator('#explorerSearchInput')).toBeVisible();
  });

});
