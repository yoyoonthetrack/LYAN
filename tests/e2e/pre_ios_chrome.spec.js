const { test, expect } = require('@playwright/test');
const path = require('path');

const shots = path.join(__dirname, '../../artifacts/pre-ios-audit');

async function openMenu(page) {
  await page.locator('#openMobileDrawerBtn').click();
  const drawer = page.locator('#mobileHamburgerDrawerOverlay');
  await expect(drawer).toHaveClass(/active/);
  return drawer;
}

test.describe('Pre-iOS chrome — mobile menu, opaque chat, readable profile', () => {
  for (const size of [{ width: 375, height: 812 }, { width: 393, height: 852 }]) {
    test(`guest menu at ${size.width}×${size.height} shows the five destinations and no Explorer label`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/index.html');
      const drawer = await openMenu(page);
      for (const [key, name] of [['bokantaj', 'Bokantaj'], ['lyanneurs', 'Lyanneurs'], ['annonces', 'Annonces'], ['messages', 'Messages'], ['profil', 'Profil']]) {
        const link = drawer.locator(`[data-drawer-nav="${key}"]`);
        await expect(link).toBeVisible();
        await expect(link).toContainText(name);
      }
      await expect(drawer.locator('.drawer-primary-nav')).not.toContainText('Explorer');
      await page.screenshot({ path: path.join(shots, `menu-${size.width}.png`), fullPage: false });
      await drawer.locator('.drawer-close-btn').first().click();
      await expect(drawer).not.toHaveClass(/active/);
    });
  }

  test('guest Messages and Profil open login instead of a dead page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html');
    const drawer = await openMenu(page);
    await drawer.locator('[data-drawer-nav="messages"]').click();
    await expect(page.locator('#loginModal')).toHaveClass(/active/);
    await page.locator('#closeLoginModalBtn').click();
    await expect(page.locator('#loginModal')).not.toHaveClass(/active/);

    const again = await openMenu(page);
    await again.locator('[data-drawer-nav="profil"]').click();
    await expect(page.locator('#loginModal')).toHaveClass(/active/);
  });

  test('Lyanneurs and Annonces open the right page and mark the active item', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto('/index.html');
    let drawer = await openMenu(page);
    await drawer.locator('[data-drawer-nav="lyanneurs"]').click();
    await page.waitForURL(/mode=lyanneurs/);
    await expect(page.locator('#explorerTitle')).toHaveText('Lyanneurs');

    await page.goto('/results.html?mode=annonces');
    drawer = await openMenu(page);
    await expect(drawer.locator('[data-drawer-nav="annonces"]')).toHaveAttribute('aria-current', 'page');
    await expect(drawer.locator('[data-drawer-nav="lyanneurs"]')).not.toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#explorerTitle')).toHaveText('Annonces');
  });

  test('conversation header stays opaque, including the native safe area', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html');
    const paint = await page.evaluate(() => {
      document.body.classList.add('is-native-app', 'lyann-messaging-open');
      const modal = document.getElementById('chatModal');
      modal.classList.add('active');
      const modalStyle = getComputedStyle(modal);
      const header = modal.querySelector('.chat-header-bar');
      const headerStyle = getComputedStyle(header);
      const css = [...document.styleSheets].flatMap((sheet) => {
        try { return [...sheet.cssRules].map((rule) => rule.cssText); } catch (_) { return []; }
      }).join('\n');
      return {
        modalBackground: modalStyle.backgroundColor,
        modalTop: modalStyle.top,
        headerBackground: headerStyle.backgroundColor,
        headerPaddingTop: headerStyle.paddingTop,
        offsetsStatusBar: css.includes('max(env(safe-area-inset-top, 0px), 54px)'),
        padsSafeArea: css.includes('env(safe-area-inset-top, 0px)')
      };
    });
    expect(paint.modalBackground).toBe('rgb(255, 255, 255)');
    expect(paint.modalTop).toBe('0px');
    expect(paint.headerBackground).toBe('rgb(255, 255, 255)');
    expect(parseFloat(paint.headerPaddingTop)).toBeGreaterThanOrEqual(10);
    expect(paint.offsetsStatusBar).toBe(false);
    expect(paint.padsSafeArea).toBe(true);
    await page.screenshot({ path: path.join(shots, 'chat-header-375.png') });
  });

  test('account name and location stay horizontal beside the avatar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/index.html');
    const box = await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'identityProbe';
      host.style.cssText = 'width:320px;padding:12px;background:#FAF7F2;';
      host.innerHTML = `
        <div class="identity-strip">
          <div class="identity-avatar-wrap">
            <img alt="" class="account-identity-avatar" src="lyann-avatar-placeholder.svg">
          </div>
          <div class="identity-strip-text">
            <strong class="identity-display-name">Marie-Thérèse Fontaine</strong>
            <span class="identity-location"><i class="ph ph-map-pin"></i> Le Gosier, Guadeloupe</span>
          </div>
          <button type="button" class="btn btn-outline btn-sm identity-edit-btn">Modifier mon profil public</button>
        </div>`;
      document.body.prepend(host);
      const name = host.querySelector('.identity-display-name');
      const location = host.querySelector('.identity-location');
      const button = host.querySelector('.identity-edit-btn');
      const nameBox = name.getBoundingClientRect();
      const locationBox = location.getBoundingClientRect();
      const buttonBox = button.getBoundingClientRect();
      const nameStyle = getComputedStyle(name);
      return {
        nameWidth: nameBox.width,
        nameHeight: nameBox.height,
        locationWidth: locationBox.width,
        writingMode: nameStyle.writingMode,
        wordBreak: nameStyle.wordBreak,
        overlapsButton: nameBox.right > buttonBox.left + 1 && nameBox.bottom > buttonBox.top + 1 && nameBox.top < buttonBox.bottom - 1
      };
    });
    expect(box.writingMode).toBe('horizontal-tb');
    expect(box.wordBreak).not.toBe('break-all');
    expect(box.nameWidth).toBeGreaterThan(100);
    expect(box.nameWidth).toBeGreaterThan(box.nameHeight);
    expect(box.locationWidth).toBeGreaterThan(80);
    expect(box.overlapsButton).toBe(false);
    await page.locator('#identityProbe').screenshot({ path: path.join(shots, 'identity-375.png') });
  });
});
