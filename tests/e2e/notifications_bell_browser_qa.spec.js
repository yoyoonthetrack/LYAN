const { test, expect } = require('@playwright/test');

for (const device of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test('Notifications ' + device.name + ': opening the bell clears 105 unread, retaining history', async ({ page }) => {
    await page.setViewportSize({ width: device.width, height: device.height });
    await page.route('**/*', (route) => {
      const hostname = new URL(route.request().url()).hostname;
      return hostname === '127.0.0.1' || hostname === 'localhost' ? route.continue() : route.abort();
    });
    await page.goto('/feed.html?demo=true', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.openNotificationsModal && window.updateHeaderNotificationBadge && window.LyannNotificationEngine?.saveAllNotifications && window.LYANN_API_CLIENT?.listMyNotifications);
    await page.evaluate(() => {
      const id = 'qa-notif-member';
      window.LYANN_AUTH_STATE = {
        ...window.LYANN_AUTH_STATE,
        isAuthenticated: () => true,
        getSnapshot: () => ({ userId: id }),
      };
      window.LYANN_CURRENT_USER = { id };
      document.body.classList.add('user-is-logged-in');
      window.__qaServerNotifs = Array.from({ length: 105 }, (_, i) => ({
        id: 'qa-notif-' + i, user_id: id,
        title: 'QA notification ' + i, body: 'Safe test data',
        type: 'SYSTEM', read: false, created_at: new Date(2026, 9, 22, 10, 0, i).toISOString(),
      }));
      window.LyannNotificationEngine.saveAllNotifications([
        ...window.__qaServerNotifs,
        { id: 'qa-other-notif', user_id: 'qa-other-member', title: 'Private', type: 'SYSTEM', read: false, created_at: new Date().toISOString() },
      ]);
      window.LYANN_API_CLIENT.markAllNotificationsRead = () => new Promise((resolve) => {
        window.__qaResolveRead = () => {
          window.__qaServerNotifs.forEach((notif) => { notif.read = true; });
          resolve({ data: [] });
        };
      });
      window.LYANN_API_CLIENT.listMyNotifications = async () => ({ data: window.__qaServerNotifs });
      window.LYANN_API_CLIENT.getProfile = async () => ({ data: null });
      window.updateHeaderNotificationBadge({ messages: false });
    });
    const badge = page.locator('.notif-badge-count');
    await expect(badge).toHaveText('99+');
    await page.locator('#navNotifBtn').click();
    await expect(badge).toBeHidden();
    await expect(page.locator('#notificationsModal')).toHaveClass(/active/);
    await expect(page.locator('#notificationsModal .notif-item-card')).toHaveCount(105);
    await expect(page.locator('#notificationsModal')).toContainText('QA notification 0');
    await expect(page.evaluate(() => window.LyannNotificationEngine.getUnreadCount('qa-other-member', 'qa-other-member'))).resolves.toBe(1);

    await page.evaluate(() => window.__qaResolveRead());
    await expect.poll(async () => page.evaluate(() => window.LyannNotificationEngine.getUnreadCount('qa-notif-member', 'qa-notif-member'))).toBe(0);
    await expect(page.locator('#notificationsModal .notif-item-card')).toHaveCount(105);
    await expect(badge).toBeHidden();
    await page.screenshot({ path: 'test-results/qa-notifications-' + device.name + '.png', animations: 'disabled' });
  });
}
