const { test, expect } = require('@playwright/test');

for (const device of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test('Bokantaj ' + device.name + ': comment visibility and favorites without server writes', async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.route('**/*', (route) => {
      const hostname = new URL(route.request().url()).hostname;
      return hostname === '127.0.0.1' || hostname === 'localhost' ? route.continue() : route.abort();
    });
    await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.loadBokantajFeedFromSupabase && window.LYANN_BOKANTAJ_REPOSITORY?.load && window.LyannFavoritesService?.getMyFavorites);
    await page.waitForFunction(() => document.querySelector('#flashFeedContainer')?.textContent?.includes('Le Bokantaj est encore calme'));
    await page.evaluate(async () => {
      window.__qaFeed = { post: true, comment: true, favorite: true };
      window.LYANN_AUTH_STATE = {
        ...window.LYANN_AUTH_STATE,
        isAuthenticated: () => true,
        getSnapshot: () => ({ userId: 'qa-viewer' }),
      };
      window.LYANN_CURRENT_USER = { id: 'qa-viewer' };
      document.body.classList.add('user-is-logged-in');
      const original = window.LYANN_BOKANTAJ_REPOSITORY;
      window.LYANN_BOKANTAJ_REPOSITORY = {
        ...original,
        hasMore: () => false,
        load: async () => window.__qaFeed.post ? [{
          id: 'qa-browser-post', item_type: 'POST',
          moderation_status: 'approved', public_moderation_status: 'approved',
          content: 'QA public visible post', author_name: 'QA',
          user_id: 'qa-author', created_at: new Date().toISOString(),
          comments_count: 1, likes: 0, category: 'Infos locales',
          city: 'Basse-Terre', territory: 'guadeloupe',
        }] : [],
      };
      window.LYANN_API_CLIENT.getComments = async () => window.__qaFeed.comment ? [{
        id: 'qa-comment', content: 'QA approved comment',
        user_id: 'qa-author', author_name: 'QA',
        public_moderation_status: 'approved', created_at: new Date().toISOString(),
      }] : [];
      window.LyannFavoritesService.getMyFavorites = async () => window.__qaFeed.favorite
        ? [{ entity_type: 'BOKANTAJ_POST', entity_id: 'qa-browser-post' }] : [];
      await window.loadBokantajFeedFromSupabase({ force: true });
      await window.syncFavoriteButtonStates();
    });
    const card = page.locator('.flash-card').filter({ hasText: 'QA public visible post' });
    const fav = page.locator('.btn-fav-toggle[data-favorite-id="qa-browser-post"]');
    const drawer = page.locator('#comments-drawer-qa-browser-post');

    await expect(card).toHaveCount(1);
    await expect(fav).toHaveClass(/is-favorite/);
    await page.locator('.btn-comments-toggle[data-target-id="qa-browser-post"]').click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('QA approved comment');
    await page.evaluate(() => { window.__qaFeed.comment = false; window.refreshPublicBokantajQuietly(); });
    await expect(drawer).not.toContainText('QA approved comment');
    await expect(drawer).toBeVisible();
    await page.evaluate(() => { window.__qaFeed.comment = true; window.refreshPublicBokantajQuietly(); });
    await expect(drawer).toContainText('QA approved comment');
    await page.evaluate(async () => { window.__qaFeed.favorite = false; await window.syncFavoriteButtonStates(); });
    await expect(fav).not.toHaveClass(/is-favorite/);
    await page.evaluate(async () => { window.__qaFeed.favorite = true; await window.syncFavoriteButtonStates(); });
    await expect(fav).toHaveClass(/is-favorite/);
    await page.evaluate(() => { window.__qaFeed.post = false; window.refreshPublicBokantajQuietly(); });
    await expect(card).toHaveCount(0);
    await page.evaluate(() => { window.__qaFeed.post = true; window.refreshPublicBokantajQuietly(); });
    await expect(card).toHaveCount(1);
  });
}
