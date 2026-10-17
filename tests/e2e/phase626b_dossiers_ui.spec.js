const { test, expect } = require('@playwright/test');
const path = require('path');

const file = 'file://' + path.join(__dirname, '../../artifacts/staging-v2/phase626b/ui-mock.html');

async function overflowX(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe('6.26B mock dossiers UI', () => {
  test('390: three dossiers, no auto-pick, panel hidden until explicit choice', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file);
    const chips = page.locator('.chat-dossier-chip');
    await expect(chips).toHaveCount(3);
    await expect(page.locator('.chat-mission-banner-title')).toHaveText('Plusieurs dossiers');
    await expect(page.locator('[data-action-panel]')).toBeHidden();
    expect(await overflowX(page)).toBeFalsy();

    await page.locator('.chat-dossier-chip[data-request-id="R1"]').click();
    await expect(page.locator('[data-action-panel]')).toHaveAttribute('data-request-id', 'R1');
    await page.locator('.chat-dossier-chip[data-request-id="R2"]').click();
    await expect(page.locator('[data-action-panel]')).toHaveAttribute('data-request-id', 'R2');
    await expect(page.locator('[data-action-panel]')).not.toHaveAttribute('data-request-id', 'R1');
    await page.locator('.chat-dossier-chip[data-request-id="R3"]').click();
    await expect(page.locator('[data-action-panel]')).toHaveAttribute('data-request-id', 'R3');
    await page.locator('.chat-dossier-chip[data-request-id="R1"]').click();
    await expect(page.locator('[data-action-panel]')).toHaveAttribute('data-request-id', 'R1');
  });

  test('360: keyboard does not hide send; chat to dossier and back', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(file);
    await page.locator('.chat-dossier-chip').first().click();
    await page.locator('#chatInput').click();
    await expect(page.locator('#sendBtn')).toBeVisible();
    const box = await page.locator('#sendBtn').boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(640);
    await page.locator('#openDossier').click();
    await expect(page.locator('#dossierSheet')).toHaveClass(/is-open/);
    await expect(page.locator('#dossierRole')).toContainText('Vous demandez');
    await page.locator('#backToChat').click();
    await expect(page.locator('#dossierSheet')).not.toHaveClass(/is-open/);
    expect(await overflowX(page)).toBeFalsy();
    await page.screenshot({ path: 'artifacts/staging-v2/phase626b/mock-360.png', fullPage: true });
  });

  test('roles stay inverted across R1 and R2', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file);
    await page.locator('.chat-dossier-chip[data-request-id="R1"]').click();
    await expect(page.locator('.chat-mission-banner-meta')).toContainText('Vous demandez');
    await page.locator('.chat-dossier-chip[data-request-id="R2"]').click();
    await expect(page.locator('.chat-mission-banner-meta')).toContainText('Vous êtes Lyanneur');
    await page.screenshot({ path: 'artifacts/staging-v2/phase626b/mock-390.png', fullPage: true });
  });
});
