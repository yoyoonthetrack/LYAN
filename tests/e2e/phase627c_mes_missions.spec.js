const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SHOTS = path.join(__dirname, '../../artifacts/staging-v2/phase627c');

function file(n) {
  return 'file://' + path.join(__dirname, '../../artifacts/staging-v2/phase627c/missions-mock.html') + '?n=' + n;
}

function titles(page) {
  return page.locator('#myMissionsResults [data-mission-title]');
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.describe('6.27C Mes missions search', () => {
  test('0 missions shows empty state', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(0));
    await expect(page.locator('#myMissionsZero')).toBeVisible();
    await expect(page.locator('#myMissionsSearch')).toHaveCount(0);
    await expect(titles(page)).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, 'empty-0-390.png') });
  });

  test('1 mission search and clear', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(1));
    await expect(titles(page)).toHaveCount(1);
    await page.locator('#myMissionsSearch').fill('QA-627B-R1');
    await expect(titles(page)).toHaveCount(1);
    await page.locator('#myMissionsSearch').fill('zzzz');
    await expect(page.locator('[data-missions-empty]')).toBeVisible();
    await expect(titles(page)).toHaveCount(0);
    await page.locator('#myMissionsSearch').fill('');
    await expect(titles(page)).toHaveCount(1);
  });

  test('6 and 27: R2 search removes R3 from DOM, Enter, filters, no dupes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(6));
    const six = await titles(page).count();
    expect(six).toBeGreaterThan(0);
    const sixKeys = await page.locator('[data-mission-request]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-mission-request')));
    expect(new Set(sixKeys).size).toBe(sixKeys.length);
    await page.screenshot({ path: path.join(SHOTS, 'list-6-390.png') });

    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(file(27));
    const openCount = await titles(page).count();
    expect(openCount).toBeGreaterThan(0);
    const keys = await page.locator('[data-mission-request]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-mission-request')));
    expect(new Set(keys).size).toBe(keys.length);
    await page.locator('#myMissionsSearch').fill('QA-627B-R2');
    await expect(titles(page)).toHaveCount(1);
    await expect(page.locator('[data-mission-title="QA-627B-R2-site"]')).toBeVisible();
    await expect(page.locator('[data-mission-title="QA-627B-R3-jardin"]')).toHaveCount(0);
    await expect(page.locator('#monActiviteContainer')).not.toContainText('QA-627B-R3');
    await page.screenshot({ path: path.join(SHOTS, 'search-r2-360.png') });
    await page.locator('#myMissionsSearch').press('Enter');
    await expect(titles(page)).toHaveCount(1);
    await expect(page.locator('[data-mission-title="QA-627B-R3-jardin"]')).toHaveCount(0);
    await page.locator('#myMissionsSearch').fill('');
    await expect(titles(page)).toHaveCount(openCount);
    await page.screenshot({ path: path.join(SHOTS, 'search-cleared-360.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(27));
    await page.locator('[data-mission-bucket-filter="waiting"]').click();
    const waiting = await page.locator('[data-mission-bucket="waiting"]').count();
    expect(waiting).toBe(await titles(page).count());
    await page.screenshot({ path: path.join(SHOTS, 'filter-waiting-390.png') });
    await page.locator('[data-mission-bucket-filter="active"]').click();
    const active = await titles(page).count();
    const activeBuckets = await page.locator('[data-mission-bucket="active"]').count();
    expect(activeBuckets).toBe(active);
    await page.screenshot({ path: path.join(SHOTS, 'filter-active-390.png') });
    await page.locator('[data-mission-bucket-filter="done"]').click();
    const done = await titles(page).count();
    expect(done).toBeGreaterThan(0);
    expect(await page.locator('[data-mission-bucket="done"]').count()).toBe(done);
    await page.screenshot({ path: path.join(SHOTS, 'filter-done-390.png') });
    await page.locator('[data-mission-bucket-filter="open"]').click();
    await page.screenshot({ path: path.join(SHOTS, 'filter-open-390.png') });
  });
});
