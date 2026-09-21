const { test, expect } = require('@playwright/test');

test.describe('LYANN V1 — Conditions & informations légales', () => {

  test('Footer Conditions opens the legal hub', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('footer a[href="legal.html"]').first().click();
    await expect(page).toHaveURL(/legal\.html/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Conditions & informations légales');
    await expect(page.locator('.legal-hub-card:not(.legal-help-card)')).toHaveCount(8);
    await expect(page.getByRole('link', { name: 'Consulter les CGU' })).toBeVisible();
  });

  test('Consulter les CGU reveals the long document', async ({ page }) => {
    await page.goto('/legal.html');
    await page.getByRole('link', { name: 'Consulter les CGU' }).click();
    await expect(page).toHaveURL(/legal\.html#cgu/);
    await expect(page.locator('#legalHub')).toBeHidden();
    await expect(page.locator('#cgu')).toBeVisible();
    await expect(page.locator('#cgu')).toContainText('Demandeurs');
    await expect(page.locator('#cgu')).toContainText('Lyanneurs');
  });

  test('Confidentialité footer link opens the privacy document', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('footer a[href="confidentialite.html"]').click();
    await expect(page).toHaveURL(/confidentialite\.html/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Politique de confidentialité');
    await expect(page.getByRole('heading', { name: /Réclamation auprès de la CNIL/ })).toBeVisible();
    await expect(page.getByText('Commission nationale de l’informatique et des libertés (CNIL)')).toBeVisible();
  });

  test('Signup requires a CGU checkbox linked to the CGU', async ({ page }) => {
    await page.goto('/index.html');
    await page.locator('.open-signup-trigger:visible').first().click();
    const box = page.locator('#obAcceptCgu');
    await expect(box).toBeVisible();
    await expect(page.locator('label[for="obAcceptCgu"] a[href="legal.html#cgu"]')).toBeVisible();
  });

});
