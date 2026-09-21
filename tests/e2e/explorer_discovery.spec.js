const { test, expect } = require('@playwright/test');

function qaCredentials(actor) {
  const email = process.env[`LYANN_E2E_QA_${actor}_EMAIL`];
  const password = process.env[`LYANN_E2E_QA_${actor}_PASSWORD`];
  expect(email, `Existing QA ${actor} email is required`).toBeTruthy();
  expect(password, `Existing QA ${actor} password is required`).toBeTruthy();
  return { email, password };
}

// Public real-backend journeys. No synthetic profiles, Requests, or successful API mocks.
async function ready(page, mode = 'annonces') {
  if (mode === 'annonces') {
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
  await card.getByRole('button', { name: 'Détails', exact: true }).click();
  await expect(page.locator('#lyannDetailModal')).toBeVisible();
  await expect(page.locator('#lyannDetailTitle')).toHaveText(rows[0].title);
  await expect(page.locator('#lyannDetailBody')).toContainText(rows[0].description);
  expect(telemetry.errors).toEqual([]);
  expect(telemetry.failures).toEqual([]);
});

test('Lyanneurs queries real profiles/services and opens canonical profile', async ({ page }) => {
  const telemetry = observe(page);
  await ready(page, 'lyanneurs');
  const profile = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).find(p => p.services.length));
  expect(profile, 'Backend must contain a public profile with an active service').toBeTruthy();
  await page.getByRole('searchbox').fill(profile.services[0].title);
  await page.getByRole('button', { name: 'Rechercher', exact:true }).click();
  const card = page.locator(`#explorerResults [data-member-id="${profile.id}"]`);
  await expect(card).toBeVisible();
  await card.getByRole('button', {name:'Voir le profil',exact:true}).click();
  await expect(page.locator('#publicMemberProfileModal')).toBeVisible();
  await expect(page.locator('#publicMemberProfileModal')).toContainText(profile.services[0].title);
  await expect(page.locator('#publicMemberProfileModal [data-lyann-route="messages"]')).toHaveAttribute('data-contact-id', profile.id);
  expect(telemetry.errors).toEqual([]);
  expect(telemetry.failures).toEqual([]);
});

test('Both modes use the same database taxonomy and removable category filter', async ({page}) => {
  test.setTimeout(60000);
  await ready(page);
  const categories = await page.locator('#explorerCategory option').allTextContents();
  const category = await page.evaluate(async () => {
    const repo = window.LYANN_EXPLORER_REPOSITORY;
    const [requests, taxonomy] = await Promise.all([repo.loadRequests(), repo.taxonomy()]);
    return taxonomy.find(t => requests.some(r => r.taxonomy_id === t.id || r.category === t.category))?.category;
  });
  expect(category).toBeTruthy();
  await page.locator('#explorerCategory').selectOption(category);
  await expect(page.locator('#explorerActiveFilters')).toContainText(category);
  const requestIds = await page.locator('#explorerResults [data-request-id]').evaluateAll(nodes => nodes.map(n => n.dataset.requestId));
  expect(requestIds.length).toBeGreaterThan(0);
  await page.getByRole('tab', {name:/Lyanneurs/}).click();
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  expect(await page.locator('#explorerCategory option').allTextContents()).toEqual(categories);
  await expect(page.locator('#explorerCategory')).toHaveValue(category);
  await page.getByRole('button', {name:`Retirer le filtre ${category}`,exact:true}).click();
  await expect(page.locator('#explorerCategory')).toHaveValue('');
});

for (const mode of ['annonces', 'lyanneurs']) {
  test(`${mode}: useful empty state, recover filters, retain URL on reload`, async ({page}) => {
    test.setTimeout(60000);
    await ready(page, mode);
    await page.getByRole('searchbox').fill('zzzz_aucun_resultat_998877');
    await page.getByRole('button', {name:'Rechercher',exact:true}).click();
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
    await expect(page.getByRole('dialog',{name:'Affiner la recherche'})).toBeVisible();
    await page.locator('#explorerArea').fill('CommuneIntrouvable');
    await page.getByRole('button',{name:'Afficher les résultats'}).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
    await page.getByRole('button',{name:'Élargir la zone',exact:true}).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    await page.getByRole('tab',{name:/Annonces/}).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab',{name:/Lyanneurs/})).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const targets = await page.locator('#explorer button:visible, #explorer select:visible, #explorer input:visible').evaluateAll(nodes => nodes.map(n => ({text:n.textContent,height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
    expect(targets.filter(t => t.height < 44 || t.width < 44)).toEqual([]);
    await page.screenshot({path:`artifacts/explorer/lyanneurs-${width}.png`,fullPage:true});
    await page.getByRole('tab',{name:/Annonces/}).click();
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
    await page.screenshot({path:`artifacts/explorer/annonces-${width}.png`,fullPage:true});
    expect(telemetry.errors).toEqual([]);
    expect(telemetry.failures).toEqual([]);
  });
}

test('A canonical category also selects a real published service in Lyanneurs', async ({page}) => {
  await ready(page,'lyanneurs');
  await page.locator('#explorerCategory').selectOption({label:'Ménage'});
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  await expect(page.locator('#explorerResults')).toContainText('Ménage & Entretien');
  const profiles = await page.evaluate(async () => (await window.LYANN_EXPLORER_REPOSITORY.load()).filter(p => p.services.some(s => s.title.includes('Ménage'))).map(p => p.id));
  const rendered = await page.locator('#explorerResults [data-member-id]').evaluateAll(nodes => nodes.map(n => n.dataset.memberId));
  expect(rendered.sort()).toEqual(profiles.sort());
});

test('Filter sheet Enter applies the search; Escape discards unapplied edits', async ({page}) => {
  await ready(page); // Text area remains an Annonces filter; Lyanneurs uses dependent selects.
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerArea').fill('CommuneIntrouvable');
  await page.locator('#explorerArea').press('Enter');
  await expect(page.getByRole('dialog',{name:'Affiner la recherche'})).not.toBeVisible();
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  await expect(page).toHaveURL(/area=CommuneIntrouvable/);
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerArea').fill('Guadeloupe');
  await page.keyboard.press('Escape');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','EMPTY');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerArea')).toHaveValue('CommuneIntrouvable');
});

test('Lyanneurs filters preserve Request-only criteria when switching modes', async ({page}) => {
  await ready(page);
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  const urgency = await page.locator('#explorerUrgency option').nth(1).getAttribute('value');
  expect(urgency).toBeTruthy();
  await page.locator('#explorerUrgency').selectOption(urgency);
  await page.locator('#explorerBudget').fill('150');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await page.getByRole('tab',{name:/Lyanneurs/}).click();
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await page.locator('#explorerTerritory').selectOption('Guadeloupe (971)');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await page.getByRole('tab',{name:/Annonces/}).click();
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerUrgency')).toHaveValue(urgency);
  await expect(page.locator('#explorerBudget')).toHaveValue('150');
});

test('In-place authentication updates own-profile actions without reload', async ({page}) => {
  const telemetry = observe(page);
  await ready(page,'lyanneurs');
  const result = await page.evaluate(async ({email,password}) => {
    const res = await window.LYANN_API_CLIENT.login(email, password);
    return {id:res.data?.user?.id,error:res.error?.message};
  }, qaCredentials('B'));
  expect(result.error).toBeFalsy();
  expect(result.id).toBeTruthy();
  const card = page.locator(`[data-member-id="${result.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator('[data-action="contact"]')).toHaveCount(0);
  await page.evaluate(() => window.LYANN_API_CLIENT.logout());
  await expect(card.locator('[data-action="contact"]')).toBeVisible();
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
  await page.goto('/results.html?mode=annonces', { waitUntil: 'domcontentloaded' });
  await page.locator('.explorer-results-heading .explorer-publish').click();
  await page.locator('#wizardDescInput').fill('Une fuite sous mon évier, besoin de réparer la plomberie.');
  for (const step of [2,4,5,6]) {
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
  expect(telemetry.failures).toEqual([]);
  expect(telemetry.errors).toEqual([]);
});

test('Own persisted Requests have details and favorites but no help action', async ({page}) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const user = await page.evaluate(async ({email,password}) => {
    const res = await window.LYANN_API_CLIENT.login(email, password);
    return {id:res.data?.user?.id,error:res.error?.message};
  }, qaCredentials('A'));
  expect(user.error).toBeFalsy();
  expect(user.id).toBeTruthy();
  await page.goto('/results.html?mode=annonces&area=', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  const own = await page.evaluate(async id => (await window.LYANN_EXPLORER_REPOSITORY.loadRequests())
    .filter(r => r.requester_id === id && r.status === 'OPEN'), user.id);
  expect(own.length,'Existing requester QA account must own a public Request').toBeGreaterThan(0);
  for (const request of own) {
    const card = page.locator(`#explorerResults [data-request-id="${request.id}"]`);
    await expect(card).toContainText('Votre annonce');
    await expect(card.locator('[data-action="help"]')).toHaveCount(0);
    await expect(card.locator('.btn-fav-toggle')).toBeVisible();
    await card.getByRole('button',{name:'Détails',exact:true}).click();
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
  await page.locator('#explorerArea').fill('Guadeloupe (971)');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await expect(page.locator(`#explorerResults [data-request-id="${request.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`#explorerResults [data-request-id="${request.id}"]`)).toBeVisible();
});
