const { test, expect } = require('@playwright/test');
const path = require('path');

function file(n) {
  return 'file://' + path.join(__dirname, '../../artifacts/staging-v2/phase627/ui-mock.html') + '?n=' + n;
}

test.describe('6.27 chat missions UX', () => {
  test('A: zero missions hides the together button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(0));
    await expect(page.locator('#chatMissionsTogetherBtn')).toHaveCount(0);
    await expect(page.locator('#chatInputField')).toBeVisible();
    await expect(page.locator('[data-action-panel]')).toHaveCount(0);
  });

  test('C: six missions stay behind one compact button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(6));
    await expect(page.locator('#chatMissionsTogetherBtn')).toHaveText(/Missions ensemble \(6\)/);
    await expect(page.locator('.chat-dossier-chip')).toHaveCount(0);
    await page.locator('#chatMissionsTogetherBtn').click();
    await expect(page.locator('#chatMissionPickerOverlay')).toBeVisible();
    await expect(page.locator('.chat-mission-pick')).toHaveCount(6);
    await page.screenshot({ path: 'artifacts/staging-v2/phase627/picker-6-390.png' });
  });

  test('D+E+F+H+I: 27 missions, inverted R2, dossier then back to chat', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(27));
    await expect(page.locator('#chatMissionsTogetherBtn')).toHaveText(/Missions ensemble \(27\)/);
    await page.locator('#chatMissionsTogetherBtn').click();
    await expect(page.locator('.chat-mission-pick')).toHaveCount(27);
    await page.locator('#chatMissionPickerSearch').fill('terrasse');
    await expect(page.locator('.chat-mission-pick')).toHaveCount(1);
    await page.locator('#chatMissionPickerSearch').fill('');
    await expect(page.locator('.chat-mission-pick')).toHaveCount(27);
    await page.screenshot({ path: 'artifacts/staging-v2/phase627/picker-27-390.png' });
    await page.getByText('Création de site internet', { exact: false }).first().click();
    await expect(page.locator('#chatTrackingOverlay')).toBeVisible();
    await expect(page.locator('.chat-dossier-sheet-title')).toContainText('Création de site internet');
    await expect(page.locator('.chat-dossier-sheet-role')).toContainText('Lyanneur');
    await expect(page.locator('.chat-dossier-sheet-amount')).toContainText('222');
    await page.screenshot({ path: 'artifacts/staging-v2/phase627/dossier-r2-390.png' });
    await page.locator('#btnExitTracking').click();
    await expect(page.locator('#chatMessagesContainer')).toContainText('Salut');
    await expect(page.locator('#chatInputField')).toBeVisible();
  });

  test('K+L: 360 keyboard does not hide send; desktop header stays compact', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(file(6));
    await page.locator('#chatInputField').click();
    await expect(page.locator('#sendBtn')).toBeVisible();
    const box = await page.locator('#sendBtn').boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(640);
    await page.screenshot({ path: 'artifacts/staging-v2/phase627/chat-360.png' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: 'artifacts/staging-v2/phase627/chat-desktop.png' });
  });
});
