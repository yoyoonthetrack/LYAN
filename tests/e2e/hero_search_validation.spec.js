const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Hero Search Validation Regression', () => {

  test('Submitting empty hero search shows visible validation banner and does not navigate', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    await page.goto('/index.html');
    await page.waitForLoadState('domcontentloaded');

    // Find search form and input
    const searchForm = page.locator('#heroSearchForm');
    const searchInput = page.locator('#searchInput');

    await expect(searchForm).toBeVisible();
    await expect(searchInput).toBeVisible();

    // Ensure input is empty
    await searchInput.fill('');

    // Submit form
    await searchForm.evaluate(form => form.requestSubmit());

    // Expect validation banner or toast to be displayed
    const valBanner = page.locator('#heroSearchValidationError');
    await expect(valBanner).toBeVisible();
    await expect(valBanner).toContainText('Veuillez saisir un service ou un mot-clé');

    // Expect focus to return to searchInput
    await expect(searchInput).toBeFocused();

    // Expect no JS console errors
    expect(jsErrors).toEqual([]);
  });

});
