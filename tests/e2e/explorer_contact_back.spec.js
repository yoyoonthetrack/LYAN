const { test, expect } = require('@playwright/test');
const { requireWriteBackend, login } = require('./helpers/approved-backend');

test.describe('Back out of a thread opened from a listing — approved staging only', () => {
  test.beforeEach(async ({ page }) => { await requireWriteBackend(page); });

  test('Lyanneurs → Contacter → Retour lands back on the listing, where the member left it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const helperId = await login(page, 'HELPER');
    await page.goto('/results.html?mode=lyanneurs&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');

    const person = await page.evaluate(async helperId =>
      (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.id !== helperId), helperId);
    expect(person).toBeTruthy();
    const card = page.locator(`[data-member-id="${person.id}"]`);
    await card.scrollIntoViewIfNeeded();
    const leftAt = await page.evaluate(() => window.scrollY);
    expect(leftAt, 'the journey only means something part-way down the list').toBeGreaterThan(0);

    await card.locator('[data-action="contact"]').click();
    await expect(page.locator('#chatModal')).toBeVisible();
    await expect(page.locator('#chatHeaderName')).toHaveText(person.name);

    await page.locator('.chat-back-to-contacts-btn').click();
    await expect(page.locator('#chatModal')).toBeHidden();
    await expect(page.locator('#explorerResults')).toBeVisible();
    // The inbox must not have been put in the way on the return path.
    await expect(page.locator('body')).not.toHaveClass(/chat-list-open/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(leftAt);
    await expect(card).toBeVisible();
  });

  test('a thread opened from the inbox still goes back to the inbox', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, 'HELPER');
    await page.goto('/results.html?mode=lyanneurs&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');

    await page.evaluate(() => window.LYANN_MESSAGING.openList());
    await expect(page.locator('#chatModal')).toBeVisible();
    const row = page.locator('#chatContactsList .chat-contact-item').first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.click();
    await expect(page.locator('body')).toHaveClass(/chat-conversation-open/);

    await page.locator('.chat-back-to-contacts-btn').click();
    await expect(page.locator('#chatModal')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/chat-list-open/);
  });
});
