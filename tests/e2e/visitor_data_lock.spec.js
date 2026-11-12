// Phase 3.2C-3 — le visiteur ne reçoit AUCUNE donnée réservée aux membres, ni par l'écran, ni par l'API.
//
// Groupe A (toujours) : ce qui doit déjà être vrai sur Staging aujourd'hui.
// Groupe B (LYANN_E2E_EXPECT_MIGRATION_94=1) : le contrat de la migration 94. À lancer UNIQUEMENT après son application
//   autorisée ; avant, il échoue exactement sur les fuites que la migration ferme (preuve que le test détecte bien la fuite).
const { test, expect } = require('@playwright/test');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.LYANN_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.LYANN_SUPABASE_ANON_KEY;
const EXPECT_94 = process.env.LYANN_E2E_EXPECT_MIGRATION_94 === '1';

test.beforeAll(() => {
  expect(SUPABASE_URL, 'Supabase Staging URL (runner env)').toBeTruthy();
  expect(SUPABASE_URL, 'Production must never be probed').not.toContain('gzispjfoywklpqatjyop');
  expect(SUPABASE_URL).toContain('tdktfbtqceldlaeqjtow');
  expect(ANON).toBeTruthy();
});

const rest = (request, path, { token, method = 'GET', data } = {}) => request.fetch(`${SUPABASE_URL}${path}`, {
  method, data,
  headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' }
});
const rows = async (response) => { try { const b = await response.json(); return Array.isArray(b) ? b : null; } catch { return null; } };
const refusedOrEmpty = async (response) => response.status() >= 400 || (await rows(response))?.length === 0;

async function memberToken(request) {
  const email = process.env.LYANN_E2E_QA_A_EMAIL, password = process.env.LYANN_E2E_QA_A_PASSWORD;
  expect(email && password, 'QA identity supplied by the runner').toBeTruthy();
  const r = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { headers: { apikey: ANON, 'Content-Type': 'application/json' }, data: { email, password } });
  expect(r.status()).toBe(200);
  return (await r.json()).access_token;
}

// ── A. Toujours vrai ───────────────────────────────────────────────────────────────────────────────────────────
test.describe('A. Données privées déjà fermées au visiteur (Staging actuel)', () => {
  for (const table of ['requests', 'request_locations', 'messages', 'payments', 'conversations', 'user_favorites']) {
    test(`le visiteur ne lit pas ${table} en accès direct`, async ({ request }) => {
      const r = await rest(request, `/rest/v1/${table}?select=*&limit=5`);
      expect(await refusedOrEmpty(r), `${table}: ${r.status()}`).toBe(true);
    });
  }

  test('les champs de carte (nom, avatar, territoire, note) restent publics', async ({ request }) => {
    const r = await rest(request, '/rest/v1/public_profiles?select=id,first_name,last_name,avatar_url,territory,city,is_pro,average_rating,reviews_count&limit=5');
    expect(r.status()).toBe(200);
    expect((await rows(r)).length).toBeGreaterThan(0);
  });

  test('le visiteur ne peut rien écrire', async ({ request }) => {
    for (const [table, body] of [['reviews', { rating: 5 }], ['user_portfolio_items', { title: 'x' }], ['profiles', { bio: 'x' }]]) {
      const r = await rest(request, `/rest/v1/${table}`, { method: 'POST', data: body });
      expect(r.status(), `${table} write`).toBeGreaterThanOrEqual(400);
    }
  });

  test('la liste publique des annonces n’expose que la projection visiteur', async ({ request, baseURL }) => {
    const r = await request.get(`${baseURL}/v1/explorer/requests`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.requests.length).toBeGreaterThan(0);
    // Un paramètre inconnu est refusé : aucune porte dérobée de projection.
    expect((await request.get(`${baseURL}/v1/explorer/requests?select=*`)).status()).toBe(400);
    for (const row of body.requests) {
      for (const secret of ['requester_id', 'email', 'phone', 'visibility', 'internal_tags', 'safety_status']) expect(row).not.toHaveProperty(secret);
      expect(Object.keys(row.requester).sort()).toEqual(['avatar_url', 'average_rating', 'display_name', 'is_pro_verified', 'is_verified', 'reviews_count']);
    }
  });
});

// ── A'. Navigation visiteur : aucune requête de détail privée ──────────────────────────────────────────────────
const PRIVATE_READS = [
  /\/rest\/v1\/reviews(\?|$)/, /\/rest\/v1\/user_portfolio_items(\?|$)/, /\/rest\/v1\/recommendations(\?|$)/,
  /\/rest\/v1\/rpc\/get_user_trust_and_reputation/, /\/rest\/v1\/rpc\/get_public_profile_pro_status/,
  /\/rest\/v1\/(requests|request_locations|messages|payments|conversations|user_favorites)(\?|$)/,
  /\/rest\/v1\/public_profiles\?[^#]*\bbio\b/, /\/v1\/explorer\/requests\/[0-9a-f-]{36}/
];
function watchPrivateReads(page) {
  const hits = [];
  page.on('request', (r) => { const u = r.url(); if (PRIVATE_READS.some((re) => re.test(u))) hits.push(`${r.method()} ${u}`); });
  return hits;
}

test.describe("A'. Un visiteur qui navigue ne déclenche aucune lecture privée", () => {
  test('Lyanneurs : liste, recherche, filtre, puis clic sur une fiche → invitation, aucune lecture privée', async ({ page }) => {
    const hits = watchPrivateReads(page);
    await page.goto('/results.html?mode=lyanneurs&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
    await page.locator('#explorerSearchInput').fill('a');
    await page.locator('#explorerSearchForm').evaluate((f) => f.requestSubmit());
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
    const family = page.locator('.lyann-family').first();
    if (await family.count()) { await family.click(); await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', /SUCCESS|EMPTY/); }
    await page.locator('#explorerResults .explorer-person-overlay').first().scrollIntoViewIfNeeded();
    await page.locator('#explorerResults .explorer-person-overlay').first().click();
    await expect(page.locator('#lyannVisitorGate')).toBeVisible();
    await expect(page.locator('#publicMemberProfileModal')).not.toHaveClass(/active/);
    expect(hits).toEqual([]);
  });

  test('Annonces : liste, recherche, clic sur « Voir l’annonce » → invitation, aucune lecture privée', async ({ page }) => {
    const hits = watchPrivateReads(page);
    await page.goto('/results.html?mode=annonces&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
    await page.locator('#explorerResults [data-action="detail"]').first().click();
    await expect(page.locator('#lyannVisitorGate')).toBeVisible();
    await expect(page.locator('#lyannDetailModal')).not.toBeVisible();
    expect(hits).toEqual([]);
  });

  test('Annonces : la carte publique s’ouvre sans lecture privée', async ({ page }) => {
    const hits = watchPrivateReads(page);
    await page.goto('/results.html?mode=annonces&area=');
    await expect(page.locator('#explorerResults')).toHaveAttribute('data-state', 'SUCCESS');
    const mapToggle = page.locator('button[data-view="map"]').first();
    await expect(mapToggle).toBeVisible();
    await mapToggle.click();
    await expect(mapToggle).toHaveAttribute('aria-pressed', 'true');
    expect(hits).toEqual([]);
  });
});

// ── B. Contrat de la migration 94 ──────────────────────────────────────────────────────────────────────────────
test.describe(`B. Verrou visiteur (migration 94) — ${EXPECT_94 ? 'ATTENDU ACTIF' : 'non attendu : passer LYANN_E2E_EXPECT_MIGRATION_94=1 après application autorisée'}`, () => {
  test.skip(!EXPECT_94, 'La migration 94 n’est pas appliquée : ce groupe décrit l’état APRÈS application.');

  for (const table of ['reviews', 'user_portfolio_items', 'recommendations']) {
    test(`le visiteur obtient 0 ligne de ${table}`, async ({ request }) => {
      const r = await rest(request, `/rest/v1/${table}?select=*&limit=5`);
      expect(await refusedOrEmpty(r), `${table}: ${r.status()}`).toBe(true);
    });
  }

  test('le visiteur ne reçoit aucune bio et ne peut pas la deviner par recherche', async ({ request }) => {
    const all = await rows(await rest(request, '/rest/v1/public_profiles?select=id,bio&limit=200'));
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((p) => p.bio !== null && p.bio !== '')).toEqual([]);
    const oracle = await rows(await rest(request, '/rest/v1/public_profiles?select=id&bio=ilike.*a*&limit=5'));
    expect(oracle).toEqual([]);
    const star = await rest(request, '/rest/v1/public_profiles?select=*&limit=3');
    expect(star.status(), 'select=* reste valide pour les anciens clients').toBe(200);
  });

  for (const fn of ['get_user_trust_and_reputation', 'get_public_profile_pro_status']) {
    test(`${fn} : refusé au visiteur, valide pour un membre (même appel)`, async ({ request }) => {
      const id = (await rows(await rest(request, '/rest/v1/public_profiles?select=id&limit=1')))[0].id;
      const data = { p_target_user_id: id };
      // Le même appel réussit pour un membre : le refus du visiteur vient bien des droits, pas d'un mauvais argument.
      const asMember = await rest(request, `/rest/v1/rpc/${fn}`, { method: 'POST', token: await memberToken(request), data });
      expect(asMember.status(), 'membre').toBe(200);
      const asVisitor = await rest(request, `/rest/v1/rpc/${fn}`, { method: 'POST', data });
      expect([401, 403], 'visiteur').toContain(asVisitor.status());
      expect(JSON.stringify(await asVisitor.json())).toMatch(/permission denied|42501/i);
    });
  }

  test('le visiteur ne liste pas les photos d’annonces', async ({ request }) => {
    const r = await request.post(`${SUPABASE_URL}/storage/v1/object/list/request-photos`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, data: { prefix: '', limit: 10 } });
    expect(r.status() >= 400 || (await r.json()).length === 0).toBe(true);
  });

  test('un membre connecté conserve avis, bio et réputation', async ({ request }) => {
    const token = await memberToken(request);
    const reviews = await rows(await rest(request, '/rest/v1/reviews?select=id&limit=5', { token }));
    expect(reviews.length).toBeGreaterThan(0);
    const bios = await rows(await rest(request, '/rest/v1/public_profiles?select=id,bio&bio=not.is.null&limit=5', { token }));
    expect(bios.length).toBeGreaterThan(0);
    const id = bios[0].id;
    const trust = await rest(request, '/rest/v1/rpc/get_user_trust_and_reputation', { method: 'POST', token, data: { p_target_user_id: id } });
    expect(trust.status()).toBe(200);
  });
});
