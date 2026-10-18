const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SHOTS = path.join(__dirname, '../../artifacts/staging-v2/phase629');

function file(n) {
  return 'file://' + path.join(__dirname, '../../artifacts/staging-v2/phase627/ui-mock.html') + '?n=' + n;
}

test.beforeAll(() => {
  fs.mkdirSync(SHOTS, { recursive: true });
});

test.describe('6.29 dossier actions UX', () => {
  test('no quote: requester waits, lyanneur can propose on inverted R2 after refuse', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(6));
    await page.locator('#chatMissionsTogetherBtn').click();
    await expect(page.locator('.chat-mission-pick-status').first()).toBeVisible();
    await page.getByText('Mission 5', { exact: false }).first().click();
    await expect(page.locator('.chat-dossier-sheet-title')).toContainText('Mission 5');
    await expect(page.locator('.chat-dossier-sheet-quote')).toContainText('Pas encore de devis');
    await expect(page.locator('[data-deal-action]')).toHaveCount(0);
    await expect(page.locator('.chat-dossier-wait')).toBeVisible();
    await page.locator('#btnExitTracking').click();
    await page.locator('#chatMissionsTogetherBtn').click();
    await page.getByText('Création de site internet', { exact: false }).first().click();
    await expect(page.locator('.chat-dossier-sheet-role')).toContainText('Lyanneur');
    await expect(page.locator('.chat-dossier-sheet-amount')).toContainText('222');
    await expect(page.locator('[data-deal-action="propose"]')).toHaveCount(1);
    await expect(page.locator('[data-deal-action="accept"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, 'dossier-after-r2-390.png') });
  });

  test('SENT requester can accept/decline; replaced quote shows newest SENT only', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(file(6));
    await page.locator('#chatMissionsTogetherBtn').click();
    await page.getByText('Réparation de terrasse', { exact: false }).first().click();
    await expect(page.locator('.chat-dossier-sheet-desc')).toContainText('Planches');
    await expect(page.locator('[data-deal-action="accept"]')).toHaveCount(1);
    await expect(page.locator('[data-deal-action="decline"]')).toHaveCount(1);
    await expect(page.locator('[data-deal-action="propose"]')).toHaveCount(0);
    await expect(page.locator('[data-dossier-request="R1"]')).toHaveCount(2);
    await page.screenshot({ path: path.join(SHOTS, 'dossier-sent-360.png') });
    await page.locator('#btnExitTracking').click();
    await page.locator('#chatMissionsTogetherBtn').click();
    await page.getByText('Mission 4', { exact: false }).first().click();
    await expect(page.locator('.chat-dossier-sheet-amount')).toContainText('90');
    await expect(page.locator('.chat-dossier-sheet-quote')).toContainText('Devis en attente');
    await expect(page.locator('[data-deal-action="accept"]')).toHaveCount(1);
    await page.screenshot({ path: path.join(SHOTS, 'dossier-replaced-360.png') });
  });

  test('ACCEPTED requester sees pay from missionCard, not lyanneur propose', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(file(6));
    await page.locator('#chatMissionsTogetherBtn').click();
    await page.getByText('Mission 3', { exact: false }).first().click();
    await expect(page.locator('.chat-dossier-sheet-quote')).toContainText('Devis accepté');
    await expect(page.locator('[data-deal-action="pay"]')).toHaveCount(1);
    await expect(page.locator('[data-deal-action="propose"]')).toHaveCount(0);
    await expect(page.locator('[data-deal-action="done"]')).toHaveCount(0);
    await page.locator('#btnExitTracking').click();
    await expect(page.locator('#chatInputField')).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'chat-after-dossier-390.png') });
  });
});
