const { test, expect } = require('@playwright/test');

for (const screen of [{ name: 'desktop', w: 1260, h: 850 }, { name: 'iPhone', w: 390, h: 844 }]) {
  test('Bokantaj Carte ' + screen.name + ': explore, filter and open a mapped post', async ({ page }) => {
    await page.setViewportSize({ width: screen.w, height: screen.h });
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      return ['localhost', '127.0.0.1'].includes(u.hostname) ? r.continue() : r.abort();
    });
    await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LYANN_BOKANTAJ_MAP?.switchView && window.LYANN_API_CLIENT?.getMappedBokantajPosts && window.L);
    await page.evaluate(() => {
      const now = new Date().toISOString();
      window.LYANN_API_CLIENT.getMappedBokantajPosts = async () => ({
        data: [
          { id: 'qa-traffic', type: 'trafic', content: 'Attention, bouchon vers Jarry', place_lat: 16.265, place_lng: -61.55, place_label: 'Jarry', public_moderation_status: 'approved', created_at: now, media_urls: [] },
          { id: 'qa-resto', type: 'restaurant', content: 'Un super petit resto à Sainte-Anne', place_lat: 16.223, place_lng: -61.382, place_label: 'Sainte-Anne', public_moderation_status: 'approved', created_at: now, media_urls: [] },
          { id: 'qa-hidden', type: 'info', content: 'Hidden post', place_lat: 16.23, place_lng: -61.38, place_label: 'Masqué', public_moderation_status: 'rejected', created_at: now, media_urls: [] }
        ]
      });
    });
    await page.locator('#bokantajViewMap').click();
    await expect(page.locator('#bokantajMapSection')).toBeVisible();
    await expect(page.locator('#bokantajFeedSection')).toBeHidden();
    await expect(page.locator('#bokantajMapStatus')).toContainText('2 partages');
    await expect(page.locator('#bokantajMapCanvas .bokantaj-map-pin')).toHaveCount(2);
    await page.locator('#bokantajMapFilters [data-map-type="trafic"]').click();
    await expect(page.locator('#bokantajMapStatus')).toContainText('1 partage');
    await expect(page.locator('#bokantajMapCanvas .bokantaj-map-pin')).toHaveCount(1);
    await page.locator('#bokantajMapCanvas .bokantaj-map-pin').click();
    await expect(page.locator('#bokantajMapDetail')).toContainText('Jarry');
    await expect(page.locator('#bokantajMapDetail')).toContainText('bouchon');
    await page.screenshot({ path: 'test-results/bokantaj-map-' + screen.name + '.png', animations: 'disabled' });
    await page.locator('#bokantajViewFeed').click();
    await expect(page.locator('#bokantajFeedSection')).toBeVisible();
    await expect(page.locator('#bokantajMapSection')).toBeHidden();
    expect(await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.publiclyVisible({
      id:'x', place_lat: 16, place_lng:-61, place_label:'X', public_moderation_status:'pending'
    }))).toBe(false);
  });

  test('Bokantaj Carte ' + screen.name + ': optional location and existing publish flow', async ({ page }) => {
    await page.setViewportSize({ width: screen.w, height: screen.h });
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      return ['localhost', '127.0.0.1'].includes(u.hostname) ? r.continue() : r.abort();
    });
    await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LYANN_BOKANTAJ_MAP?.getComposerPlace && window.openBokantajComposer && window.LYANN_API_CLIENT?.createPost && window.L);
    await page.evaluate(() => {
      window.LYANN_AUTH_STATE = {
        ...window.LYANN_AUTH_STATE,
        isAuthenticated: () => true,
        getSnapshot: () => ({ userId: 'qa-composer' })
      };
      window.LYANN_CURRENT_USER = { id: 'qa-composer' };
      document.body.classList.add('user-is-logged-in');
      window.LYANN_API_CLIENT.createPost = async (payload) => {
        window.__qaCreatedPayload = payload;
        return { id: 'qa-post', public_moderation_status: 'pending' };
      };
      window.loadBokantajFeedFromSupabase = async () => {};
    });
    await page.locator('#bokantajComposerOpen').click();
    await expect(page.locator('#createFlashForm')).toBeVisible();
    await expect(page.locator('.bokantaj-type-picks input')).toHaveCount(6);
    await page.locator('#flashContentInput').fill('Mon info du quartier');
    await page.locator('#bokantajPlaceTrigger').click();
    await expect(page.locator('#bokantajPlacePicker')).toBeVisible();
    await page.locator('#bokantajPickerMap').click({ position: { x: 130, y: 90 } });
    await page.locator('#bokantajPlaceName').fill('Rond-point de Jarry');
    await page.locator('#bokantajPlaceSave').click();
    await expect(page.locator('#bokantajPlaceTriggerLabel')).toContainText('Jarry');
    expect(await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toEqual(expect.objectContaining({ label: 'Rond-point de Jarry' }));
    await page.locator('input[name="bokantajPostType"][value="trafic"]').check({ force: true });
    await page.locator('#createFlashForm').evaluate(form => form.requestSubmit());
    await expect.poll(async () => page.evaluate(() => window.__qaCreatedPayload?.type)).toBe('trafic');
    const post = await page.evaluate(() => window.__qaCreatedPayload);
    expect(post.place).toEqual(expect.objectContaining({ label: 'Rond-point de Jarry' }));
    expect(post.place.lat).toBeGreaterThan(14);
    expect(post.place.lng).toBeLessThan(-60);
    await expect.poll(async () => page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toBeNull();
  });
}

// Exercise the actual query contract: visibility must survive the API response.
test('map API requests moderation status and recent traffic expires correctly', async ({ page }) => {
  await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.goto('/feed.html?demo=true');
  const result = await page.evaluate(async () => {
    let selection = '';
    const filters = [];
    const query = {
      select(s) { selection = s; return this; },
      eq(...args) { filters.push(args); return this; },
      not() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: [], error: null }); }
    };
    const original = window.LYANN_API_CLIENT.supabase;
    window.LYANN_API_CLIENT.supabase = { from: () => query };
    await window.LYANN_API_CLIENT.getMappedBokantajPosts({ south: 16, north: 17, west: -62, east: -61 });
    window.LYANN_API_CLIENT.supabase = original;
    const post = { type: 'trafic', place_lat: 16.25, place_lng: -61.55, place_label: 'Jarry', public_moderation_status: 'approved' };
    return { selection, filters,
      recent: window.LYANN_BOKANTAJ_MAP.publiclyVisible({ ...post, created_at: new Date().toISOString() }),
      expired: window.LYANN_BOKANTAJ_MAP.publiclyVisible({ ...post, created_at: new Date(Date.now() - 25 * 3600000).toISOString() }) };
  });
  expect(result.selection.split(', ')).toContain('public_moderation_status');
  expect(result.filters).toContainEqual(['public_moderation_status', 'approved']);
  expect(result.recent).toBe(true);
  expect(result.expired).toBe(false);
});

for (const mobile of [false, true]) {
  test('real vector streets and accessible pins ' + (mobile ? 'touch mobile' : 'desktop'), async ({ browser }) => {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1260, height: 900 }, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    await page.route('**/*', r => {
      const host = new URL(r.request().url()).hostname;
      return ['localhost', '127.0.0.1', 'tiles.openfreemap.org'].includes(host) ? r.continue() : r.abort();
    });
    await page.goto('/feed.html?demo=true');
    await page.evaluate(() => {
      window.LYANN_API_CLIENT.getMappedBokantajPosts = async () => ({ data: [
        { id: 'real-map-test', type: 'restaurant', content: 'Publication de test, carte réelle.', place_lat: 16.242, place_lng: -61.534, place_label: 'Pointe-à-Pitre', public_moderation_status: 'approved', created_at: new Date().toISOString(), media_urls: [] }
      ] });
      window.LYANN_BOKANTAJ_MAP.showPost('real-map-test', { place_lat: 16.242, place_lng: -61.534 });
    });
    await expect(page.locator('#bokantajMapCanvas')).toHaveAttribute('data-basemap', 'ready', { timeout: 25000 });
    await expect(page.locator('#bokantajMapCanvas canvas')).toBeVisible();
    await expect(page.getByRole('link', { name: '© OpenStreetMap', exact: true })).toBeVisible();
    const marker = page.locator('#bokantajMapCanvas .bokantaj-map-pin');
    await expect(marker).toHaveAttribute('title', 'Resto · Pointe-à-Pitre');
    await marker.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bokantajMapDetail')).toContainText('Publication de test');
    await page.locator('#bokantajMapSection').screenshot({ path: 'test-results/bokantaj-map-real-' + (mobile ? 'mobile' : 'desktop') + '.png' });
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await expect(page.locator('#bokantajMapCanvas')).toHaveAttribute('data-basemap', 'ready');
    await context.close();
  });
}
