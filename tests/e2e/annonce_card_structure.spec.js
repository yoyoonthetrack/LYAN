const { test, expect } = require('@playwright/test');

// Structure of the annonce card and of the annonce detail surface.
// These tests need no QA account: the anonymous discovery endpoint is either read
// live or stubbed, so they cover the renderer itself rather than a signed-in session.

const ABYMES = [16.2678, -61.4967];

// The wizard reads a day and an hour from the author, then stores the instant. The
// fixture is built the same way so the expected label holds in any test timezone.
const SCHEDULED_LOCAL = new Date(2026, 9, 3, 18, 0, 0);

// A signed-in reader receives the municipality and, after migration 37, the
// structured date/price plus the author reputation. The public endpoint withholds
// the municipality, which explorer_public_contract.spec.js asserts separately; this
// payload is a renderer fixture, never a statement of what anonymous callers may see.
const enrichedRequest = (overrides = {}) => ({
  id: '11111111-2222-3333-4444-555555555555',
  category: 'Photographie',
  taxonomy_id: null,
  title: 'Photographe pour un anniversaire',
  description: "Ma fille a 18 ans le 3 octobre. On aimerait un reportage de la soirée, environ trois heures sur place, avec des photos de groupe et des retouches légères.",
  budget: 150,
  budget_max: 300,
  price_mode: 'RANGE',
  date_mode: 'EXACT',
  scheduled_at: SCHEDULED_LOCAL.toISOString(),
  location: 'Le Gosier (971 - Guadeloupe)',
  urgency: 'date',
  created_at: new Date(Date.now() - 23 * 60 * 1000).toISOString(),
  requester: {
    display_name: 'Sarah.M',
    avatar_url: null,
    is_verified: true,
    is_pro_verified: true,
    average_rating: 4.8,
    reviews_count: 12
  },
  ...overrides
});

async function openWithStub(page, requests, { preciseFix = null } = {}) {
  if (preciseFix) {
    await page.addInitScript(fix => {
      sessionStorage.setItem('lyann_geo_precise_fix', JSON.stringify({ lat: fix[0], lon: fix[1], at: Date.now() }));
    }, preciseFix);
  }
  await page.route('**/v1/explorer/requests*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ requests, nextOffset: null })
  }));
  await page.goto('/results.html?mode=annonces&area=');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
}

test('The card carries taxonomy, age, short title and one fact per line, never the full description', async ({ page }) => {
  const row = enrichedRequest();
  await openWithStub(page, [row], { preciseFix: ABYMES });
  const card = page.locator(`[data-request-id="${row.id}"]`);

  await expect(card.locator('.explorer-annonce-taxonomy')).toHaveText('Photographie');
  await expect(card.locator('.explorer-annonce-age')).toHaveText('il y a 23 min');
  await expect(card.locator('h2')).toHaveText('Photographe pour un anniversaire');

  // Each line carries a visually hidden label, so assertions match on substrings.
  const facts = card.locator('.explorer-annonce-facts li');
  await expect(facts).toHaveCount(3);
  // The two commune centres are roughly 5 km apart, so a distance is rendered.
  await expect(facts.nth(0)).toContainText('Lieu : Le Gosier');
  await expect(facts.nth(0)).toContainText('km');
  await expect(facts.nth(0)).toHaveAttribute('title', 'Distance approximative entre communes');
  await expect(facts.nth(1)).toContainText('Sam. 3 oct. · 18h');
  await expect(facts.nth(2)).toContainText('150 – 300 €');

  await expect(card.locator('.explorer-person-badge')).toHaveText('Pro vérifié');
  await expect(card.locator('.explorer-person-rating')).toContainText('4,8 (12)');

  // The long description belongs to the detail surface only.
  await expect(card).not.toContainText('trois heures sur place');
  await expect(card.getByRole('button', { name: 'Détails', exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Lyanner', exact: true })).toBeVisible();
});

test('A record without a real date, price or rating drops those lines instead of inventing them', async ({ page }) => {
  const row = enrichedRequest({
    id: '99999999-8888-7777-6666-555555555555',
    date_mode: null, scheduled_at: null, urgency: null,
    price_mode: null, budget: null, budget_max: null,
    location: 'Guadeloupe (971)',
    requester: { display_name: 'Lyanneur', avatar_url: null, is_verified: false, is_pro_verified: false, average_rating: null, reviews_count: 0 }
  });
  await openWithStub(page, [row]);
  const card = page.locator(`[data-request-id="${row.id}"]`);

  const facts = card.locator('.explorer-annonce-facts li');
  // Location and "Sur devis" remain; the unknown date line is absent.
  await expect(facts).toHaveCount(2);
  await expect(facts.nth(1)).toContainText('Prix : Sur devis');
  await expect(card).not.toContainText('km');
  await expect(card.locator('.explorer-person-badge')).toHaveCount(0);
  await expect(card.locator('.explorer-person-rating')).toHaveCount(0);
});

test('A legacy budget of zero reads as a quote, never as a free job', async ({ page }) => {
  const row = enrichedRequest({ id: '12121212-3434-5656-7878-909090909090', price_mode: null, budget: 0, budget_max: null });
  await openWithStub(page, [row]);
  const facts = page.locator(`[data-request-id="${row.id}"] .explorer-annonce-facts li`);
  await expect(facts.last()).toContainText('Prix : Sur devis');
  await expect(facts.last()).not.toContainText('0 €');
});

test('Détails reveals the complete description and the structured facts', async ({ page }) => {
  const row = enrichedRequest();
  await openWithStub(page, [row], { preciseFix: ABYMES });
  await page.locator(`[data-request-id="${row.id}"]`).getByRole('button', { name: 'Détails', exact: true }).click();

  await expect(page.locator('#lyannDetailTitle')).toHaveText(row.title);
  await expect(page.locator('#lyannDetailAge')).toContainText('il y a 23 min');
  const body = page.locator('#lyannDetailBody');
  await expect(body).toContainText('trois heures sur place');
  await expect(body).toContainText('Le Gosier');
  await expect(body).toContainText('Sam. 3 oct. · 18h');
  await expect(body).toContainText('Fourchette annoncée');
  await expect(body).toContainText('150 – 300 €');
  await expect(body).toContainText('Pro vérifié');
  await expect(body).toContainText('4,8 (12)');
});

for (const width of [390, 1440]) {
  test(`The restructured card has no overflow, no console error at ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize({ width, height: 900 });
    await openWithStub(page, [enrichedRequest(), enrichedRequest({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })], { preciseFix: ABYMES });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('The publishing wizard asks for a 60-character title, a date mode and a price mode', async ({ page }) => {
  await page.goto('/results.html?mode=annonces&area=');
  await page.evaluate(() => {
    const modal = document.getElementById('modal-request-help');
    modal.classList.add('active');
    modal.style.display = 'flex';
  });
  const modal = page.locator('#modal-request-help');
  await expect(modal).toBeVisible();

  await page.locator('#wizardDescInput').fill("Bonjour, j'ai une fuite sous mon évier de cuisine, il me faudrait quelqu'un pour réparer ça ce week-end.");
  await expect(page.locator('#wizardTitleBlock')).toBeVisible();
  await expect(page.locator('#wizardTitleInput')).toHaveAttribute('maxlength', '60');
  await expect.poll(async () => page.locator('#wizardTitleInput').inputValue()).not.toBe('');
  expect((await page.locator('#wizardTitleInput').inputValue()).length).toBeLessThanOrEqual(60);

  await page.locator('#wizardBtnNext').click();
  await expect(page.locator('.wizard-step[data-step="2"]')).toBeVisible();
  await page.locator('#wizardBtnNext').click();
  await expect(page.locator('.wizard-step[data-step="4"]')).toBeVisible();
  await expect(page.locator('#wizardDateType option[value="EXACT"]')).toHaveCount(1);
  await expect(page.locator('#wizardDateType option[value="TO_AGREE"]')).toHaveCount(1);
  await expect(page.locator('#wizardExactDateRow')).toBeHidden();
  await page.locator('#wizardDateType').selectOption('EXACT');
  await expect(page.locator('#wizardExactDateRow')).toBeVisible();
  await expect(page.locator('#wizardDateInput')).toBeVisible();
  await expect(page.locator('#wizardTimeInput')).toBeVisible();

  await page.locator('#wizardBtnNext').click();
  await expect(page.locator('.wizard-step[data-step="5"]')).toBeVisible();
  await expect(page.locator('input[name="wizardBudget"][value="devis"]')).toBeVisible();
  await expect(page.locator('input[name="wizardBudget"][value="fixe"]')).toBeVisible();
  await expect(page.locator('input[name="wizardBudget"][value="fourchette"]')).toBeVisible();
});

