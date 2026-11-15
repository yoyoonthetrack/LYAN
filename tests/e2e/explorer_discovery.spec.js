const { test, expect } = require('@playwright/test');
const { installPublishedServiceFixture, installRequestFixtures } = require('./helpers/qa-fixtures');

function qaCredentials(actor) {
  const email = process.env[`LYANN_E2E_QA_${actor}_EMAIL`];
  const password = process.env[`LYANN_E2E_QA_${actor}_PASSWORD`];
  expect(email, `Existing QA ${actor} email is required`).toBeTruthy();
  expect(password, `Existing QA ${actor} password is required`).toBeTruthy();
  return { email, password };
}

// Public real-backend journeys. No synthetic profiles, Requests, or successful API mocks.
async function ready(page, mode = 'annonces', { member = mode === 'annonces' } = {}) {
  if (member) {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const error = await page.evaluate(async ({email,password}) => {
      const result = await window.LYANN_API_CLIENT.login(email, password);
      return result.error?.message || null;
    }, qaCredentials('B'));
    expect(error, 'Real repository QA login must succeed').toBeNull();
  }
  await page.goto(`/results.html?mode=${mode}&area=`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy', 'false', { timeout: 20000 });
  await expect(page.locator('#explorerResults')).not.toHaveAttribute('data-state', 'ERROR');
}
// 3.2C : la catégorie, le service et la zone vivent dans le panneau secondaire « Filtres et zone ».
async function openFilters(page) {
  if (!(await page.locator('#explorerFilters').evaluate(el => el.open || getComputedStyle(el).display !== 'none'))) await page.getByRole('button', { name: 'Filtres et zone' }).click();
}
async function applyFilters(page) { await page.getByRole('button', { name: 'Afficher les résultats' }).click(); }
function observe(page) {
  const errors = [], failures = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`); });
  page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  return { errors, failures };
}

test('Annonces renders persisted public Requests and opens their real detail', async ({ page }) => {
  const telemetry = observe(page);
  await ready(page);
  const rows = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests()).filter(r => r.status === 'OPEN'));
  expect(rows.length, 'Backend must contain an open public Request for this journey').toBeGreaterThan(0);
  expect(rows.every(r => Boolean(r.requester_id)), 'Authenticated discovery retains canonical requester identity').toBe(true);
  await expect(page.locator('#explorerResults [data-request-id]')).toHaveCount(rows.length);
  const card = page.locator(`#explorerResults [data-request-id="${rows[0].id}"]`);
  await expect(card).toContainText(rows[0].title);
  await card.locator('[data-action="detail"]').click();
  await expect(page.locator('#lyannDetailModal')).toBeVisible();
  await expect(page.locator('#lyannDetailTitle')).toHaveText(rows[0].title);
  await expect(page.locator('#lyannDetailBody')).toContainText(rows[0].description);
  expect(telemetry.errors).toEqual([]);
  expect(telemetry.failures).toEqual([]);
});

test('Lyanneurs queries real profiles/services and opens canonical profile (member)', async ({ page }) => {
  const telemetry = observe(page);
  await ready(page, 'lyanneurs', { member: true });
  const profile = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.services.length));
  expect(profile, 'Backend must contain a public profile with an active service').toBeTruthy();
  await page.getByRole('searchbox').fill(profile.services[0].title);
  await page.getByRole('searchbox').press('Enter');
  const card = page.locator(`#explorerResults [data-member-id="${profile.id}"]`);
  await expect(card).toBeVisible();
  await card.locator('.explorer-person-overlay').click();
  await expect(page.locator('#publicMemberProfileModal')).toBeVisible();
  await expect(page.locator('#publicMemberProfileModal')).toContainText(profile.services[0].title);
  await expect(page.locator('#publicMemberProfileModal [data-lyann-route="messages"]')).toHaveAttribute('data-contact-id', profile.id);
  expect(telemetry.errors).toEqual([]);
  expect(telemetry.failures).toEqual([]);
});

test('Lyanneur avatar and name open the canonical profile, not only the explicit button (member)', async ({page}) => {
  const telemetry = observe(page);
  await ready(page, 'lyanneurs', { member: true });
  const profile = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.services.length));
  expect(profile, 'Backend must contain a public profile with an active service').toBeTruthy();
  // 3.2C : la zone d'identité est le bouton « Voir le profil de … » (44 × 44) ; la carte entière n'ouvre plus rien d'autre.
  const trigger = page.locator(`#explorerResults [data-member-id="${profile.id}"]`).getByRole('button', {name:/^Voir le profil de /});
  const box = await trigger.boundingBox();
  expect(box.width, 'Avatar zone stays a real touch target').toBeGreaterThanOrEqual(44);
  expect(box.height, 'Avatar zone stays a real touch target').toBeGreaterThanOrEqual(44);
  for (const position of [{x:20, y:22}, {x:box.width - 10, y:14}]) {
    await trigger.click({position});
    await expect(page.locator('#publicMemberProfileModal')).toBeVisible();
    await expect(page.locator('#publicMemberProfileModal')).toContainText(profile.services[0].title);
    await page.locator('#closePublicProfileModalBtn').click();
    await expect(page.locator('#publicMemberProfileModal')).not.toBeVisible();
  }
  expect(telemetry.errors).toEqual([]);
  expect(telemetry.failures).toEqual([]);
});

test('Both modes use the same taxonomy families, and a family filter persists and is removable', async ({page}) => {
  test.setTimeout(60000);
  await ready(page);
  const tiles = async () => page.locator('.lyann-family').evaluateAll(nodes => nodes.map(n => n.dataset.family));
  const families = await tiles();
  expect(families.length).toBeGreaterThan(0);
  // 3.2C : la catégorie est une famille de la taxonomie V2 (tuile), plus un <select>.
  let chosen = null;
  for (const code of families) {
    await page.locator(`.lyann-family[data-family="${code}"]`).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', /SUCCESS|EMPTY/);
    if (await page.locator('#explorerResults [data-request-id]').count()) { chosen = code; break; }
  }
  expect(chosen, 'At least one family holds an open annonce').toBeTruthy();
  const active = page.locator(`.lyann-family[data-family="${chosen}"]`);
  await expect(active).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(new RegExp(`family=${chosen}`));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  expect(await tiles()).toEqual(families);
  await expect(page.locator(`.lyann-family[data-family="${chosen}"]`)).toHaveAttribute('aria-pressed', 'true');
  await page.locator(`.lyann-family[data-family="${chosen}"]`).click();   // second click removes the filter
  await expect(page.locator('.lyann-family[aria-pressed="true"]')).toHaveCount(0);
  await expect(page).not.toHaveURL(/family=/);
  await page.goto('/results.html?mode=lyanneurs&area=', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  expect(await tiles(), 'Lyanneurs and Annonces share the same families').toEqual(families);
  await expect(page.locator('#explorerTitle')).toHaveText('Lyanneurs');
  await expect(page.locator('#explorer')).toHaveAttribute('data-mode','lyanneurs');
});

for (const mode of ['annonces', 'lyanneurs']) {
  test(`${mode}: useful empty state, recover filters, retain URL on reload`, async ({page}) => {
    test.setTimeout(60000);
    await ready(page, mode);
    await page.getByRole('searchbox').fill('zzzz_aucun_resultat_998877');
    await page.getByRole('searchbox').press('Enter');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'EMPTY');
    await expect(page.locator('#explorerResults')).toContainText(mode === 'annonces' ? "Pas encore d'annonce correspondant à votre recherche." : 'Aucun Lyanneur trouvé pour cette recherche.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('searchbox')).toHaveValue('zzzz_aucun_resultat_998877');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY', { timeout: 20000 });
    await page.getByRole('button',{name:'Modifier les filtres',exact:true}).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  });
  test(`${mode}: failed backend is ERROR, retry returns real data`, async ({page}) => {
    test.setTimeout(60000);
    const table = mode === 'annonces' ? 'requests' : 'public_profiles';
    const pattern = `**/rest/v1/${table}?*`;
    await ready(page, mode);
    await page.route(pattern, route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Injected transport failure'})}));
    await page.goto(`/results.html?mode=${mode}&area=`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','ERROR',{timeout:20000});
    await expect(page.locator('#explorerResults')).not.toContainText('Aucun Lyanneur trouvé');
    await expect(page.locator('#explorerResults')).not.toContainText("Pas encore d'annonce");
    await page.unroute(pattern);
    await page.getByRole('button',{name:'Réessayer',exact:true}).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS',{timeout:15000});
  });
}

test('Bokantaj displays only real community posts and no transactional Requests', async ({page}) => {
  const telemetry = observe(page);
  const requestReads = [];
  page.on('request',r => { if (r.url().includes('/rest/v1/requests?')) requestReads.push(r.url()); });
  await page.goto('/feed.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#flashFeedContainer .flash-card').first()).toBeVisible({timeout:15000});
  await expect(page.locator('#topTalentsSidebarContainer')).toHaveAttribute('data-state','SUCCESS');
  const feed = await page.evaluate(() => window.LYANN_BOKANTAJ_REPOSITORY.load());
  expect(feed.length).toBeGreaterThan(0);
  expect(feed.every(p => p.item_type === 'POST' && !p.request_id)).toBe(true);
  await expect(page.locator('#flashFeedContainer')).toContainText(feed[0].content);
  await expect(page.locator('#flashFeedContainer .btn-help-lyann')).toHaveCount(0);
  expect(requestReads).toEqual([]);
  expect(telemetry.failures).toEqual([]);
  expect(telemetry.errors).toEqual([]);
});

for (const width of [390,1440]) {
  test(`Explorer ${width}px: filters, keyboard, no overflow, screenshot`, async ({page}) => {
    const telemetry = observe(page);
    await page.setViewportSize({width,height:900});
    await ready(page);
    await page.getByRole('button',{name:'Filtres et zone'}).click();
    await expect(page.getByRole('dialog',{name:'Filtrer les annonces'})).toBeVisible();
    await expect(page.locator('#explorerRequestFilters')).toBeHidden();
    await page.locator('#explorerCommune').evaluate(el => { el.add(new Option('CommuneIntrouvable', 'CommuneIntrouvable')); el.value = 'CommuneIntrouvable'; });
    await page.getByRole('button',{name:'Afficher les résultats'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
    await page.getByRole('button',{name:'Élargir la zone',exact:true}).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    await expect(page.locator('#explorer [role="tab"]')).toHaveCount(0);
    await expect(page.locator('#explorerTitle')).toHaveText('Annonces');
    await expect(page.locator('.explorer-results-heading .explorer-publish')).toBeVisible();
    await expect(page.locator('.explorer-results-heading .explorer-publish')).toHaveText(/Poster une annonce/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const targets = await page.locator('#explorer button:visible:not(.explorer-search-submit), #explorer select:visible, #explorer input:visible').evaluateAll(nodes => nodes.map(n => ({text:n.textContent,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
    expect(targets.filter(t => t.height < 44 || t.width < 44)).toEqual([]);
    await page.screenshot({path:`artifacts/explorer/annonces-${width}.png`,fullPage:true});
    await page.goto('/results.html?mode=lyanneurs&area=', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    await expect(page.locator('#explorerTitle')).toHaveText('Lyanneurs');
    await expect(page.locator('.explorer-results-heading .explorer-publish')).toBeHidden();
    await page.screenshot({path:`artifacts/explorer/lyanneurs-${width}.png`,fullPage:true});
    expect(telemetry.errors).toEqual([]);
    expect(telemetry.failures).toEqual([]);
  });
}

test('A family also selects real published services in Lyanneurs', async ({page}) => {
  await ready(page,'lyanneurs');
  const before = await page.locator('#explorerResults [data-member-id]').count();
  await page.locator('.lyann-family[data-family="entretien"]').click();
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  const rendered = await page.locator('#explorerResults [data-member-id]').evaluateAll(nodes => nodes.map(n => n.dataset.memberId));
  expect(rendered.length).toBeGreaterThan(0);
  expect(rendered.length, 'the family narrows the list').toBeLessThan(before);
  expect(new Set(rendered).size, 'no duplicated profile').toBe(rendered.length);
  await expect(page).toHaveURL(/family=entretien/);
});

test('Filter sheet Enter applies the search; Escape discards unapplied edits', async ({page}) => {
  await ready(page);
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerCommune').evaluate(el => { el.add(new Option('CommuneIntrouvable', 'CommuneIntrouvable')); el.value = 'CommuneIntrouvable'; });
  await page.locator('#explorerFilterForm').press('Enter');
  await expect(page.getByRole('dialog',{name:'Filtrer les annonces'})).not.toBeVisible();
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  await expect(page).toHaveURL(/commune=CommuneIntrouvable/);
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerCommune').selectOption({ index: 0 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerCommune')).toHaveValue('CommuneIntrouvable');
});

test('Territory chosen in Annonces is restored for that mode', async ({page}) => {
  await ready(page);
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerRequestFilters')).toBeHidden();
  await expect(page.locator('#explorerAreaLabel')).toBeHidden();
  await expect(page.locator('#explorerProfileGeography')).toBeVisible();
  await page.locator('#explorerTerritory').selectOption('Guadeloupe (971)');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await expect(page).toHaveURL(/territory=/);
  await expect(page).not.toHaveURL(/urgency=|budget=/);
  await page.goto('/results.html?mode=lyanneurs', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  await page.goto('/results.html?mode=annonces', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerTerritory')).toHaveValue('Guadeloupe (971)');
  await expect(page.locator('#explorerCommune')).toHaveValue('');
});

test('In-place authentication updates own-annonce actions without reload', async ({page}) => {
  const telemetry = observe(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({email,password}) => {
    const res = await window.LYANN_API_CLIENT.login(email, password);
    return {id:res.data?.user?.id,error:res.error?.message};
  }, qaCredentials('A'));
  expect(result.error).toBeFalsy();
  expect(result.id).toBeTruthy();
  // 3.2C : une carte de Lyanneur n'a plus d'action « Contacter » (la fiche, réservée aux membres, la porte). L'état « connecté » se lit donc sur
  // la carte d'annonce : sa propre annonce n'offre pas « Lyanner » ; déconnecté en place, la même carte l'offre.
  // Une annonce ouverte est ajoutée à la réponse du navigateur seulement (aucune écriture en base).
  await installRequestFixtures(page, result.id);
  await page.goto('/results.html?mode=annonces&area=', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  const own = await page.evaluate(async id => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests()).find(r => r.requester_id === id && r.status === 'OPEN'), result.id);
  expect(own, 'The browser fixture supplies one open annonce owned by the signed-in account').toBeTruthy();
  const card = page.locator(`#explorerResults [data-request-id="${own.id}"]`);
  await expect(card).toContainText('Votre annonce');
  await expect(card.locator('[data-action="help"]')).toHaveCount(0);
  await page.evaluate(() => window.LYANN_API_CLIENT.logout());
  await expect(card.locator('[data-action="help"]')).toBeVisible();
  await expect(card).not.toContainText('Votre annonce');
  expect(telemetry.failures).toEqual([]);
  expect(telemetry.errors).toEqual([]);
});

test('Bokantaj Request wizard reaches real-taxonomy review without writing or offering unpersisted photos', async ({page}) => {
  const telemetry = observe(page);
  const writes = [];
  page.on('request',r => {
    if (r.method() === 'POST' && /\/rest\/v1\/(requests|bokantaj_posts|rpc\/send_request_invitations)/.test(r.url())) writes.push(r.url());
  });
  await ready(page); // Publishing is an authenticated interaction; keep all wizard assertions.
  await page.goto('/discover.html', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-lyann-publish]').first().click();
  await page.locator('#wizardDescInput').fill('Une fuite sous mon évier, besoin de réparer la plomberie.');
  await expect(page.locator('#wizardTitleBlock')).toBeHidden();
  await page.locator('#wizardBtnNext').click();
  await expect(page.locator('.wizard-step[data-step="2"]')).toBeVisible();
  await expect(page.locator('#wizardTitleBlock')).toBeVisible();
  const titleChoice = page.locator('#wizardTitleChoices input[type="radio"]').first();
  const titleInput = page.locator('#wizardTitleInput');
  await expect(titleChoice.or(titleInput).first()).toBeVisible({ timeout: 20000 });
  if (await titleChoice.isVisible()) await titleChoice.check();
  else await titleInput.fill('Réparer une fuite sous évier');
  for (const step of [4,5,6]) {
    await page.locator('#wizardBtnNext').click();
    await expect(page.locator(`.wizard-step[data-step="${step}"]`)).toBeVisible();
  }
  const selected = await page.evaluate(async () => {
    const leaves = await window.LyanAI.fetchTaxonomyFromDB({strict:true});
    const category = document.getElementById('wizardCategory');
    const subcategory = document.getElementById('wizardSubCat');
    return leaves.find(t => t.universe === document.getElementById('wizardDomain').value &&
      t.category === category.selectedOptions[0].text && t.subcategory === subcategory.selectedOptions[0].text)?.id;
  });
  expect(selected,'The actual wizard selection must identify a persisted taxonomy leaf').toBeTruthy();
  await expect(page.locator('#wizardPhotoUploadZone')).not.toBeVisible();
  await expect(page.locator('#wizardSummaryDesc')).toContainText('fuite sous mon évier');
  await expect(page.locator('#wizardBtnSubmit')).toBeVisible();
  for (const step of [5,4,2,1]) {
    await page.locator('#wizardBtnPrev').click();
    await expect(page.locator(`.wizard-step[data-step="${step}"]`)).toBeVisible();
  }
  await expect(page.locator('#wizardDescInput')).toHaveValue('Une fuite sous mon évier, besoin de réparer la plomberie.');
  expect(writes).toEqual([]);
  const unexpected = telemetry.failures.filter(item => !(item.startsWith('503 ') && item.includes('/v1/requests/summary')));
  expect(unexpected).toEqual([]);
  const unexpectedErrors = telemetry.errors.filter(item => item !== 'Failed to load resource: the server responded with a status of 503 (Service Unavailable)');
  expect(unexpectedErrors).toEqual([]);
});

test('Own annonce card shows details and favorites but no help action', async ({page}) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const user = await page.evaluate(async ({email,password}) => {
    const res = await window.LYANN_API_CLIENT.login(email, password);
    return {id:res.data?.user?.id,error:res.error?.message};
  }, qaCredentials('A'));
  expect(user.error).toBeFalsy();
  expect(user.id).toBeTruthy();
  // Account A has no stored annonce. One open fixture is added to the browser
  // response so the own-card rules can be checked without a database write.
  await installRequestFixtures(page, user.id);
  await page.goto('/results.html?mode=annonces&area=', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  const own = await page.evaluate(async id => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests())
    .filter(r => r.requester_id === id && r.status === 'OPEN'), user.id);
  expect(own.length,'The browser fixture must supply one open annonce owned by the signed-in account').toBeGreaterThan(0);
  for (const request of own) {
    const card = page.locator(`#explorerResults [data-request-id="${request.id}"]`);
    await expect(card).toContainText('Votre annonce');
    await expect(card.locator('[data-action="help"]')).toHaveCount(0);
    await expect(card.locator('.btn-fav-toggle')).toBeVisible();
    await card.locator('[data-action="detail"]').click();
    await expect(page.locator('#lyannDetailTitle')).toHaveText(request.title);
    await expect(page.locator('#lyannDetailModal').getByRole('button',{name:'Lyanner',exact:true})).toHaveCount(0);
    await page.locator('#closeLyannDetailModalBtn').click();
  }
});

test('Saved territory label finds the same real Request despite reversed code/name order', async ({page}) => {
  await ready(page);
  const request = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests())
    .find(r => r.status === 'OPEN' && r.location?.includes('971 - Guadeloupe')));
  expect(request,'A real Request with the existing wizard territory format is required').toBeTruthy();
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerTerritory').selectOption('Guadeloupe (971)');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await expect(page.locator(`#explorerResults [data-request-id="${request.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`#explorerResults [data-request-id="${request.id}"]`)).toBeVisible();
});
