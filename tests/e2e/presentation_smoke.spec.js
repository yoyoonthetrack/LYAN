const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Presentation & Asset Delivery Smoke Test', () => {

  const PAGES = ['/index.html', '/feed.html', '/results.html', '/admin.html'];

  for (const pagePath of PAGES) {
    test(`CSS Asset Delivery and Computed Styling on ${pagePath}`, async ({ page }) => {
      // 1. Intercept network requests to capture stylesheet responses
      const stylesheetResponses = [];
      page.on('response', response => {
        const url = response.url();
        if (url.includes('.css')) {
          stylesheetResponses.push(response);
        }
      });

      // Navigate to the page
      await page.goto(pagePath, { waitUntil: 'domcontentloaded' });

      // 2. Verify required stylesheet responses are HTTP 200 and Content-Type is CSS
      expect(stylesheetResponses.length).toBeGreaterThan(0);
      for (const response of stylesheetResponses) {
        expect(response.status()).toBe(200);
        const contentType = response.headers()['content-type'] || '';
        expect(contentType).toContain('text/css');
      }

      // 3. Verify document.styleSheets contains expected LYANN stylesheets
      const styleSheetsCount = await page.evaluate(() => {
        return Array.from(document.styleSheets).filter(sheet => {
          return sheet.href && (sheet.href.includes('style.css') || sheet.href.includes('admin-style.css'));
        }).length;
      });
      expect(styleSheetsCount).toBeGreaterThan(0);

      // 4. Verify representative LYANN component has expected computed styles
      // Check the body font-family to ensure it's not the browser default
      const bodyFontFamily = await page.evaluate(() => {
        return window.getComputedStyle(document.body).fontFamily;
      });
      expect(bodyFontFamily.toLowerCase()).toContain('outfit');

      // 5. Verify page layout is not browser-default raw HTML (body background)
      const { bg, bgImg } = await page.evaluate(() => {
        const style = window.getComputedStyle(document.body);
        return { bg: style.backgroundColor, bgImg: style.backgroundImage };
      });
      // It should either have a non-transparent background color OR a gradient (background-image)
      const hasBackground = bg !== 'rgba(0, 0, 0, 0)' || (bgImg && bgImg !== 'none');
      expect(hasBackground).toBeTruthy();

      // 6. Verify drawer is NOT visibly expanded by default
      // Checking for .hamburger-drawer or #hamburgerDrawer if it exists on the page
      const hasDrawer = await page.locator('.hamburger-drawer, #hamburgerDrawer').count();
      if (hasDrawer > 0) {
         // Drawer should have a transform translateX that moves it off-screen, or display none, or opacity 0
         // We can check if it is visibly overlapping the viewport.
         const isDrawerVisible = await page.locator('.hamburger-drawer, #hamburgerDrawer').first().isVisible();
         
         // Depending on how it's styled (active class might be needed to make it visible)
         const drawerClass = await page.locator('.hamburger-drawer, #hamburgerDrawer').first().getAttribute('class');
         const hasActiveClass = drawerClass.includes('active') || drawerClass.includes('open');
         
         // Assert the drawer is strictly NOT active
         expect(hasActiveClass).toBeFalsy();
      }
      
      // Bonus: Ensure navigation links do not have default browser blue underline
      const hasLinks = await page.locator('a').count();
      if (hasLinks > 0) {
        const linkDecoration = await page.evaluate(() => {
          const link = document.querySelector('a');
          if (!link) return null;
          return window.getComputedStyle(link).textDecoration;
        });
        if (linkDecoration) {
           expect(linkDecoration).not.toContain('underline solid rgb(0, 0, 238)');
        }
      }
    });
  }
});
