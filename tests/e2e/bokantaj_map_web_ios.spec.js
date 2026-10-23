const { test, expect } = require('@playwright/test');

test('LYANN map style uses vector geographic sources only', () => {
  const style = require('../../assets/maps/lyann-liberty.json');
  const sourceKinds = Object.values(style.sources).map((source) => source.type);
  expect(sourceKinds).toEqual(['vector']);
  expect(style.layers.some((layer) => layer.type === 'raster' || layer.type === 'hillshade')).toBe(false);
  expect(style.layers.some((layer) => layer['source-layer'] === 'transportation')).toBe(true);
  expect(style.layers.some((layer) => layer['source-layer'] === 'building')).toBe(true);
  expect(style.layers.some((layer) => layer['source-layer'] === 'water')).toBe(true);
  expect(style.layers.some((layer) => layer.type === 'symbol' && layer.layout?.['text-field'])).toBe(true);
});


test('LYANN map typography uses real Nunito Sans glyph bundles, not CSS-only labels', async ({ request }) => {
  const style = require('../../assets/maps/lyann-liberty.json');
  const fonts = new Set(style.layers.filter(x => x.type === 'symbol')
    .flatMap(x => x.layout?.['text-font'] || []));
  expect([...fonts].sort()).toEqual(['Nunito Sans Bold', 'Nunito Sans Italic', 'Nunito Sans Regular']);
  expect(Object.values(style.sources).map(x => x.type)).toEqual(['vector']);
  const base = process.env.LYANN_E2E_BASE_URL || 'http://127.0.0.1:8090';
  for (const font of fonts) {
    for (const range of ['0-255', '256-511', '1024-1279']) {
      const endpoint = base + '/assets/maps/glyphs/' + encodeURIComponent(font) + '/' + range + '.pbf';
      const response = await request.get(endpoint);
      expect(response.status(), 'missing glyph ' + font + ' ' + range).toBe(200);
      expect((await response.body()).byteLength).toBeGreaterThan(100);
    }
  }
});

test('legacy Staging photo URLs resolve to local Preview, never Production', async ({ page }) => {
  await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.LYANN_BOKANTAJ_RESOLVE_MEDIA_URL === 'function');
  const result = await page.evaluate(() => {
    window.LYANN_SUPABASE_URL = 'https://tdktfbtqceldlaeqjtow.supabase.co';
    window.LYANN_SUPABASE_LOCK = 'tdktfbtqceldlaeqjtow';
    window.LYANN_BACKEND_ORIGIN = '';
    return window.LYANN_BOKANTAJ_RESOLVE_MEDIA_URL('https://lyann.app/v1/media/bokantaj-media-hold/example/post.jpg');
  });
  expect(result).toContain('/v1/media/bokantaj-media-hold/example/post.jpg');
  expect(result).toMatch(/^http:\/\/127\.0\.0\.1:/);
  expect(result).not.toContain('lyann.app');
});

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
    await expect(page.locator('#bokantajMapDetail')).toContainText('Voir le Bokantaj');
    await page.evaluate(() => {
      window.LYANN_API_CLIENT.getApprovedBokantajPost = async (id) => id === 'qa-traffic' ? {
        id: 'qa-traffic', author_id: 'qa-author', type: 'trafic', content: 'Attention, bouchon vers Jarry',
        place_label: 'Jarry', place_lat: 16.265, place_lng: -61.55, public_moderation_status: 'approved',
        author_name: 'Vim', created_at: new Date().toISOString(), media_urls: []
      } : null;
    });
    await page.locator('#bokantajMapDetail .bokantaj-preview-open').click();
    await expect(page.locator('#bokantajFeedSection')).toBeVisible();
    await expect(page.locator('#qa-traffic')).toBeVisible();
    await expect(page.locator('#qa-traffic')).toHaveClass(/is-map-focus/);
    await expect(page.locator('#qa-traffic')).toContainText('bouchon');
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
        return {
          id: 'qa-post',
          author_id: 'qa-composer',
          content: payload.content,
          type: payload.type,
          public_moderation_status: 'pending',
          place_lat: payload.place && payload.place.lat,
          place_lng: payload.place && payload.place.lng,
          place_label: payload.place && payload.place.label,
          created_at: new Date().toISOString()
        };
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
    // One intentional map tap must persist a point, even before optional naming.
    await expect(page.locator('#bokantajPlaceTriggerLabel')).toContainText('Repère partagé');
    expect(await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toEqual(expect.objectContaining({ label: 'Repère partagé' }));
    await page.locator('#bokantajPlaceName').fill('Rond-point de Jarry');
    await page.locator('#bokantajPlaceSave').click();
    await expect(page.locator('#bokantajPlaceTriggerLabel')).toContainText('Jarry');
    expect(await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toEqual(expect.objectContaining({ label: 'Rond-point de Jarry' }));
    // Exercise the visible label, not a forced click on a visually hidden native radio.
    await page.locator('.bokantaj-type-picks label').filter({ has: page.locator('input[value="trafic"]') }).click();
    await expect(page.locator('input[name="bokantajPostType"][value="trafic"]')).toBeChecked();
    await page.locator('#createFlashForm').evaluate(form => form.requestSubmit());
    await expect.poll(async () => page.evaluate(() => window.__qaCreatedPayload?.type)).toBe('trafic');
    const post = await page.evaluate(() => window.__qaCreatedPayload);
    expect(post.place).toEqual(expect.objectContaining({ label: 'Rond-point de Jarry' }));
    expect(post.place.lat).toBeGreaterThan(14);
    expect(post.place.lng).toBeLessThan(-60);
    await expect.poll(async () => page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toBeNull();
    expect(post.place.exact).toBe(false);
    const rounded = await page.evaluate((place) => window.LYANN_BOKANTAJ_MAP.publicCoordinate(place.lat, place.lng, false), post.place);
    expect(post.place.lat).toBe(rounded.lat);
    expect(post.place.lng).toBe(rounded.lng);
    await expect(page.locator('#qa-post')).toBeVisible();
    await expect(page.locator('#qa-post')).toContainText('Mon info du quartier');
    await expect(page.locator('#qa-post')).toContainText('En cours de chargement');
  });
}

// Exercise the actual query contract: visibility must survive the API response.
test('map API requests moderation status and recent traffic expires correctly', async ({ page }) => {
  await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.goto('/feed.html?demo=true');
  const result = await page.evaluate(async () => {
    const selections = [];
    const filters = [];
    const query = {
      select(columns) { selections.push(columns); return this; },
      eq(...args) { filters.push(args); return this; },
      not() { return this; }, gte() { return this; }, lt() { return this; }, lte() { return this; }, order() { return this; },
      limit() { return Promise.resolve({ data: [], error: null }); }
    };
    await window.LYANN_API_CLIENT.getMappedBokantajPosts.call({ supabase: { from: () => query } }, { south: 16, north: 17, west: -62, east: -61 });
    const post = { type: 'trafic', place_lat: 16.25, place_lng: -61.55, place_label: 'Jarry', public_moderation_status: 'approved' };
    return { selections, filters,
      recent: window.LYANN_BOKANTAJ_MAP.publiclyVisible({ ...post, created_at: new Date().toISOString() }),
      expired: window.LYANN_BOKANTAJ_MAP.publiclyVisible({ ...post, created_at: new Date(Date.now() - 25 * 3600000).toISOString() }) };
  });
  expect(result.selections.some(columns => columns.split(', ').includes('public_moderation_status'))).toBe(true);
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
    await page.evaluate(() => { document.getElementById('bokantajMapDetail').hidden = true; });
    await marker.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#bokantajMapDetail')).toBeVisible();
    await expect(page.locator('#bokantajMapDetail')).toContainText('Publication de test');
    await expect(page.locator('.bokantaj-popup .leaflet-popup-content')).toContainText('Pointe-à-Pitre');
    await page.locator('#bokantajMapSection').screenshot({ path: 'test-results/bokantaj-map-real-' + (mobile ? 'mobile' : 'desktop') + '.png' });
    await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await expect(page.locator('#bokantajMapCanvas')).toHaveAttribute('data-basemap', 'ready');
    await context.close();
  });
}

test('GPS place stays approximate until the author shares the exact point', async ({ page }) => {
  await page.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 16.24119, longitude: -61.53381 });
  await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LYANN_BOKANTAJ_MAP?.publicCoordinate && window.openBokantajComposer);
  await page.evaluate(() => {
    document.body.classList.add('user-is-logged-in');
    window.LYANN_AUTH_STATE = { ...window.LYANN_AUTH_STATE, isAuthenticated: () => true, getSnapshot: () => ({ userId: 'qa-geo' }) };
  });
  await page.locator('#bokantajComposerOpen').click();
  await page.locator('#bokantajPlaceTrigger').click();
  await page.locator('#bokantajLocateMe').click();
  await expect(page.locator('#bokantajPickerStatus')).toContainText('Repère placé');
  await expect(page.locator('#bokantajPlaceSummaryTitle')).toHaveText('Position actuelle');
  await expect(page.locator('#bokantajPlaceSummaryPrecision')).toContainText('quartier');
  await page.locator('#bokantajPlaceName').fill('Pointe-à-Pitre');
  await page.locator('#bokantajPlaceSave').click();
  const approx = await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace());
  expect(approx).toEqual({ lat: 16.241, lng: -61.534, label: 'Pointe-à-Pitre', exact: false });
  await page.locator('#bokantajPlaceTrigger').click();
  await page.locator('#bokantajLocateMe').click();
  await expect(page.locator('#bokantajPickerStatus')).toContainText('Repère placé');
  await page.locator('#bokantajPlaceExact').check();
  await page.locator('#bokantajPlaceSave').click();
  const exact = await page.evaluate(() => window.LYANN_BOKANTAJ_MAP.getComposerPlace());
  expect(exact.exact).toBe(true);
  expect(exact.lat).toBeCloseTo(16.24119, 5);
  expect(exact.lng).toBeCloseTo(-61.53381, 5);
});
