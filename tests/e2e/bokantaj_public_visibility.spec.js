const { test, expect } = require('@playwright/test');

test('Bokantaj public feed never paints pending or rejected posts', async ({ page }) => {
  await page.goto('/feed.html');
  await page.waitForFunction(() => typeof window.LYANN_BOKANTAJ_REPOSITORY?.sanitizeFeed === 'function');
  const visible = await page.evaluate(() => {
    const repo = window.LYANN_BOKANTAJ_REPOSITORY;
    return repo.sanitizeFeed([
      { id: 'ok', item_type: 'POST', moderation_status: 'approved', content: 'visible' },
      { id: 'pending', item_type: 'POST', public_moderation_status: 'pending', content: 'hidden-pending' },
      { id: 'rejected', item_type: 'POST', moderation_status: 'rejected', content: 'hidden-rejected' }
    ]).map((row) => row.id);
  });
  expect(visible).toEqual(['ok']);
});

test('mobile Bokantaj keeps the approved-only filter', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/feed.html');
  await page.waitForFunction(() => typeof window.LYANN_BOKANTAJ_REPOSITORY?.isPubliclyVisible === 'function');
  const allowed = await page.evaluate(() => window.LYANN_BOKANTAJ_REPOSITORY.isPubliclyVisible({ moderation_status: 'approved' }));
  const blocked = await page.evaluate(() => window.LYANN_BOKANTAJ_REPOSITORY.isPubliclyVisible({ moderation_status: 'rejected' }));
  expect(allowed).toBe(true);
  expect(blocked).toBe(false);
});
