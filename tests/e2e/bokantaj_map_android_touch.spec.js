const { test, expect, devices } = require('@playwright/test');

// Android Chromium mobile emulation verifies the shared Capacitor WebView surface.
// A real-device Android WebView/Google Play build must still be tested separately.
test.use({ ...devices['Pixel 7'] });

test('Bokantaj Carte Pixel Android: tactile Fil/Carte, filtre, repère et zoom', async ({ page }) => {
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    return ['127.0.0.1', 'localhost'].includes(u.hostname) ? r.continue() : r.abort();
  });
  await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LYANN_BOKANTAJ_MAP?.switchView && window.LYANN_API_CLIENT?.getMappedBokantajPosts && window.L);
  await page.evaluate(() => {
    const now = new Date().toISOString();
    window.LYANN_API_CLIENT.getMappedBokantajPosts = async () => ({ data: [
      { id:'android-traffic', type:'trafic', content:'Trafic à Jarry', place_lat:16.265,place_lng:-61.55,place_label:'Jarry', public_moderation_status:'approved', created_at:now,media_urls:[] },
      { id:'android-food',type:'restaurant',content:'Resto du coin',place_lat:16.223,place_lng:-61.382,place_label:'Sainte-Anne',public_moderation_status:'approved',created_at:now,media_urls:[] },
      { id:'android-private',type:'info',content:'Pas visible',place_lat:16.27,place_lng:-61.51,place_label:'Masqué',public_moderation_status:'pending',created_at:now,media_urls:[] }
    ] });
  });
  await page.locator('#bokantajViewMap').tap();
  await expect(page.locator('#bokantajMapSection')).toBeVisible();
  await expect(page.locator('#bokantajMapStatus')).toContainText('2 partages');
  await expect(page.locator('.bokantaj-map-pin')).toHaveCount(2);
  await page.locator('#bokantajMapFilters [data-map-type="trafic"]').tap();
  await expect(page.locator('#bokantajMapStatus')).toContainText('1 partage');
  await expect(page.locator('.bokantaj-map-pin')).toHaveCount(1);
  await page.locator('.bokantaj-map-pin').tap();
  await expect(page.locator('#bokantajMapDetail')).toContainText('Jarry');
  const zoom = page.locator('#bokantajMapCanvas .leaflet-control-zoom-in');
  await expect(zoom).toBeVisible();
  await zoom.tap();
  await expect(page.locator('#bokantajMapSection')).toBeVisible();
  await page.locator('#bokantajViewFeed').tap();
  await expect(page.locator('#bokantajFeedSection')).toBeVisible();
});

test('Bokantaj Carte Pixel Android: publication et repère facultatif au toucher', async ({ page }) => {
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    return ['127.0.0.1', 'localhost'].includes(u.hostname) ? r.continue() : r.abort();
  });
  await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LYANN_BOKANTAJ_MAP?.getComposerPlace && window.openBokantajComposer && window.LYANN_API_CLIENT?.createPost && window.L);
  await page.evaluate(() => {
    window.LYANN_AUTH_STATE = { ...window.LYANN_AUTH_STATE, isAuthenticated:()=>true, getSnapshot:()=>({ userId:'qa-android-viewer' }) };
    window.LYANN_CURRENT_USER = { id:'qa-android-viewer' };
    document.body.classList.add('user-is-logged-in');
    window.LYANN_API_CLIENT.createPost = async payload => {
      window.__qaAndroidPayload=payload;
      return { id:'qa-android-post', public_moderation_status:'pending' };
    };
    window.loadBokantajFeedFromSupabase = async () => {};
  });
  await page.locator('#bokantajComposerOpen').tap();
  await expect(page.locator('#createFlashForm')).toBeVisible();
  await page.locator('#flashContentInput').fill('Une bonne adresse à Jarry');
  await expect(page.locator('#bokantajPlaceTrigger')).toBeVisible();
  await page.locator('#bokantajPlaceTrigger').tap();
  await expect(page.locator('#bokantajPlacePicker')).toBeVisible();
  await page.locator('#bokantajPickerMap').tap({ position: { x: 120, y: 90 } });
  await expect(page.locator('#bokantajPickerStatus')).toContainText('choisissez');
  await page.locator('#bokantajPlaceName').fill('Jarry');
  await page.locator('#bokantajShareQuarter').tap();
  await expect(page.locator('#bokantajPlaceTriggerLabel')).toContainText('Jarry');
  await page.locator('.bokantaj-type-picks label').filter({ hasText: 'Resto' }).tap();
  await expect(page.locator('input[name="bokantajPostType"][value="restaurant"]')).toBeChecked();
  await page.locator('#createFlashForm').evaluate(el=>el.requestSubmit());
  await expect.poll(async()=>page.evaluate(()=>window.__qaAndroidPayload?.type)).toBe('restaurant');
  const payload=await page.evaluate(()=>window.__qaAndroidPayload);
  expect(payload.place).toEqual(expect.objectContaining({label:'Jarry'}));
  expect(payload.place.lat).toBeGreaterThan(14);
  expect(payload.place.lng).toBeLessThan(-60);
  await expect.poll(async()=>page.evaluate(()=>window.LYANN_BOKANTAJ_MAP.getComposerPlace())).toBeNull();
});
