const { test, expect } = require('@playwright/test');

// The feed used to fetch every photo at once and every video only once it was
// on screen, so each post the member reached still had to download. The window
// is twenty posts, in order, and the fifteenth opens the next twenty.
test('Bokantaj loads posts in order, twenty at a time, and the 15th opens the next window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seen = [];
  await page.route('**/v1/media/**', async (route) => {
    const request = route.request();
    const name = new URL(request.url()).pathname.split('/').pop();
    if (request.resourceType() === 'fetch' && /^\d+\.(jpg|mp4)$/.test(name)) seen.push(name);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    });
  });
  await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LYANN_BOKANTAJ_REPOSITORY && window.loadBokantajFeedFromSupabase);

  await page.evaluate(() => {
    const repo = window.LYANN_BOKANTAJ_REPOSITORY;
    const posts = Array.from({ length: 25 }, (_, index) => ({
      id: 'preload-' + index,
      item_type: 'POST',
      type: 'info',
      content: 'Publication ' + (index + 1),
      moderation_status: 'approved',
      created_at: new Date(Date.now() - index * 60000).toISOString(),
      author_name: 'Qa',
      author_id: 'qa-preload',
      images: index === 5 ? [] : ['http://127.0.0.1:8098/v1/media/bokantaj-media/qa/' + index + '.jpg'],
      videos: index === 5 ? ['http://127.0.0.1:8098/v1/media/bokantaj-media/qa/5.mp4'] : []
    }));
    window.LYANN_BOKANTAJ_REPOSITORY = {
      load: async () => posts,
      hasMore: () => false,
      invalidate() {},
      isPubliclyVisible: repo.isPubliclyVisible,
      sanitizeFeed: repo.sanitizeFeed
    };
  });
  await page.evaluate(() => window.loadBokantajFeedFromSupabase({ force: true }));
  await expect(page.locator('#preload-0')).toBeVisible();

  const firstWindow = [...Array(20).keys()].map((index) => index + (index === 5 ? '.mp4' : '.jpg'));
  await expect.poll(() => seen.length, { timeout: 15000 }).toBe(20);
  expect(seen.slice(0, 20)).toEqual(firstWindow);
  // The 15th post is still below the fold, so the next window stays closed.
  expect(seen).not.toContain('20.jpg');

  await page.locator('#preload-14').scrollIntoViewIfNeeded();
  await expect.poll(() => seen.length, { timeout: 15000 }).toBe(25);
  expect(seen.slice(20)).toEqual(['20.jpg', '21.jpg', '22.jpg', '23.jpg', '24.jpg']);
});
