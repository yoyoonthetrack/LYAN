const { chromium } = require('@playwright/test');
const path = require('path');
const OUT = path.join(__dirname, '..', 'artifacts', 'ui-audit');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: 'http://127.0.0.1:8080' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  await page.locator('#openMobileDrawerBtn').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'mobile-hamburger.png') });

  await page.locator('#mobileHamburgerDrawerOverlay .open-login-trigger').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'mobile-login.png') });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const loginClosed = await page.evaluate(() => !document.querySelector('#loginModal.active'));
  console.log('loginClosedAfterEscape', loginClosed);

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
