const { test, expect } = require('@playwright/test');
const express = require('express');
const { createPublicRequestsHandler } = require('../../api/public-explorer-requests');

const fields = ['id','category','taxonomy_id','title','description','budget','location','urgency','created_at',
  'date_mode','scheduled_at','price_mode','budget_max','requester'].sort();
const requesterFields = ['avatar_url','display_name','is_verified','is_pro_verified','average_rating','reviews_count'].sort();
function contract(body) {
  expect(Object.keys(body).sort()).toEqual(['nextOffset','requests']);
  for (const row of body.requests) {
    expect(Object.keys(row).sort()).toEqual(fields);
    expect(Object.keys(row.requester).sort()).toEqual(requesterFields);
  }
}
// Isolated HTTP security fixtures, never inserted into Supabase or used by application runtime.
const publicRow = { id:'test-public', category:'Ménage', taxonomy_id:null, title:'Ménage', description:'Besoin de ménage', budget:50,
  location:'42 rue privée, Les Abymes (971 - Guadeloupe)', urgency:'FLEXIBLE', created_at:'2026-09-17T00:00:00Z',
  date_mode:'EXACT', scheduled_at:'2026-10-03T18:00:00Z', price_mode:'RANGE', budget_max:120,
  requester_id:'test-author', visibility:'PUBLIC', status:'OPEN', safety_status:'SAFE', target_user_id:null,
  classification_status:'CLASSIFIED', classification_confidence:0.9, internal_tags:['secret'], future_internal_field:'secret' };
async function isolated(request, { rows = [publicRow], error = null, profileError = null, configured = true } = {}, query = '') {
  const calls = [];
  const db = { from(table) {
    const chain = { then(resolve) { return Promise.resolve({ data:table === 'requests' ? rows : [{id:'test-author', first_name:'Alice', last_name:'Confidentiel', avatar_url:null, email:'private@example.test'}], error:table === 'requests' ? error : profileError }).then(resolve); } };
    for (const method of ['select','eq','is','in','order','range']) chain[method] = (...args) => { calls.push([table,method,...args]); return chain; };
    return chain;
  } };
  const app = express();
  app.get('/v1/explorer/requests', createPublicRequestsHandler(db, configured));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const response = await request.get(`http://127.0.0.1:${server.address().port}/v1/explorer/requests${query}`);
    return { status:response.status(), body:await response.json(), calls };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('Public HTTP contract is an exact recursive allowlist, never raw rows or profiles', async ({request}) => {
  const result = await isolated(request);
  expect(result.status).toBe(200);
  contract(result.body);
  expect(result.body.requests[0].location).toBe('Guadeloupe (971)');
  // Structured date and price cross the boundary; the municipality never does.
  expect(result.body.requests[0]).toMatchObject({date_mode:'EXACT', scheduled_at:'2026-10-03T18:00:00Z', price_mode:'RANGE', budget_max:120});
  expect(result.body.requests[0].requester).toEqual({display_name:'Alice.C', avatar_url:null,
    is_verified:false, is_pro_verified:false, average_rating:null, reviews_count:0});
  expect(JSON.stringify(result.body)).not.toMatch(/secret|Confidentiel|private@example|42 rue|requester_id|target_user_id|internal_tags|classification|safety_status/);
  expect(result.calls).toEqual(expect.arrayContaining([
    ['requests','eq','visibility','PUBLIC'], ['requests','eq','status','OPEN'], ['requests','eq','safety_status','SAFE'],
    ['requests','is','target_user_id',null], ['requests','in','classification_status',['CLASSIFIED','UNCLASSIFIED']]
  ]));
  expect(result.calls.filter(c => c[1] === 'select').every(c => !c[2].includes('*'))).toBe(true);
});

test('Private, targeted, closed, unsafe and review-pending Requests are excluded defensively', async ({request}) => {
  const excluded = [{visibility:'PRIVATE'}, {target_user_id:'recipient'}, {status:'ASSIGNED'}, {status:'CANCELLED'},
    {status:'COMPLETED'}, ...['CAUTION','PRO_REQUIRED','RESTRICTED','PROHIBITED','SAFETY_REVIEW_REQUIRED',null].map(safety_status => ({safety_status})),
    {classification_status:'NEEDS_REVIEW'}, {classification_status:null}];
  const result = await isolated(request, {rows:[publicRow, ...excluded.map((changes,i) => ({...publicRow,id:`excluded-${i}`,...changes}))]});
  expect(result.body.requests.map(r => r.id)).toEqual(['test-public']);
});

test('Unknown or ambiguous unstructured locations are withheld', async ({request}) => {
  for (const location of ['42 rue privée, 75001 Paris', '16.123456, -61.123456', 'Guadeloupe ou Martinique', null]) {
    const result = await isolated(request, {rows:[{...publicRow,location}]});
    expect(result.body.requests[0].location).toBeNull();
  }
});

test('Database/configuration failures are HTTP errors without private error details', async ({request}) => {
  for (const options of [{error:{message:'secret SQL'}}, {profileError:{message:'secret SQL'}}, {configured:false}]) {
    const result = await isolated(request, options);
    expect(result.status).toBe(503);
    expect(result.body).toEqual({error:'Recherche temporairement indisponible.'});
  }
});

test('Projection degrades to the pre-migration columns instead of taking discovery down', async ({request}) => {
  // Migration 37 adds date_mode/scheduled_at/price_mode/budget_max and the author
  // reputation columns. Before it is applied the database rejects them.
  const legacyRow = {...publicRow};
  for (const column of ['date_mode','scheduled_at','price_mode','budget_max']) delete legacyRow[column];
  const selects = {requests:[], public_profiles:[]};
  const db = { from(table) {
    let selected = '';
    const chain = { then(resolve) {
      selects[table].push(selected);
      const rejected = /date_mode|is_verified/.test(selected);
      return Promise.resolve({
        data: rejected ? null : table === 'requests' ? [legacyRow]
          : [{id:'test-author', first_name:'Alice', last_name:'Confidentiel', avatar_url:null}],
        error: rejected ? {message:'column "date_mode" does not exist'} : null
      }).then(resolve);
    } };
    for (const method of ['select','eq','is','in','order','range']) {
      chain[method] = (...args) => { if (method === 'select') selected = String(args[0]); return chain; };
    }
    return chain;
  } };
  const app = express();
  app.get('/v1/explorer/requests', createPublicRequestsHandler(db, true));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/v1/explorer/requests`;
    const first = await request.get(url);
    expect(first.status()).toBe(200);
    const body = await first.json();
    contract(body);
    expect(body.requests[0]).toMatchObject({date_mode:null, scheduled_at:null, price_mode:null, budget_max:null});
    expect(body.requests[0].requester).toMatchObject({is_verified:false, average_rating:null, reviews_count:0});
    // The rejected projection is attempted once, then never again for this process.
    expect(selects.requests.filter(select => select.includes('date_mode'))).toHaveLength(1);
    expect((await request.get(url)).status()).toBe(200);
    expect(selects.requests.filter(select => select.includes('date_mode'))).toHaveLength(1);
    expect(selects.public_profiles.filter(select => select.includes('is_verified'))).toHaveLength(1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Caller cannot override privileged selection or eligibility; pagination stays bounded', async ({request}) => {
  for (const query of ['?select=*','?visibility=PRIVATE','?offset=-1','?offset=NaN']) {
    const result = await isolated(request, {}, query);
    expect(result.status).toBe(400);
    expect(result.calls).toEqual([]);
  }
  const result = await isolated(request, {rows:Array.from({length:101}, (_,i) => ({...publicRow,id:`fixture-${i}`}))});
  expect(result.body.requests).toHaveLength(100);
  expect(result.body.nextOffset).toBe(100);
  expect(result.calls).toContainEqual(['requests','range',0,100]);
});

test('Live anonymous HTTP endpoint returns persisted public Requests under the exact contract', async ({request}) => {
  const response = await request.get('/v1/explorer/requests');
  expect(response.status()).toBe(200);
  const body = await response.json();
  contract(body);
  expect(body.requests.length).toBeGreaterThan(0);
  for (const row of body.requests) expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
});

for (const width of [390,1440]) test(`Anonymous Explorer at ${width}px uses only the public endpoint and projected detail`, async ({page}) => {
  const errors = [], failures = [], rawReads = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if (m.type() === 'error') errors.push(m.text());});
  page.on('response', r => { if (r.status() >= 400) failures.push(r.url()); });
  page.on('requestfailed', r => {if (r.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(r.url());});
  page.on('request', r => {if (/\/rest\/v1\/requests(?:\?|$)/.test(r.url())) rawReads.push(r.url());});
  await page.setViewportSize({width,height:900});
  const responsePromise = page.waitForResponse(r => r.url().includes('/v1/explorer/requests'));
  await page.goto('/results.html?mode=annonces&area=');
  const body = await (await responsePromise).json();
  contract(body);
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  const card = page.locator(`[data-request-id="${body.requests[0].id}"]`);
  await expect(card).toContainText(body.requests[0].title);
  await expect(card.getByRole('button',{name:'Lyanner',exact:true})).toBeVisible();
  await card.getByRole('button',{name:'Détails',exact:true}).click();
  await expect(page.locator('#lyannDetailTitle')).toHaveText(body.requests[0].title);
  await page.locator('#btnHelpLyannFromModal').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('pending_lyann_help'))).toBeNull();
  await page.goto(`/results.html?mode=annonces&area=&openLyann=${body.requests[0].id}`);
  await expect(page.locator('#lyannDetailTitle')).toHaveText(body.requests[0].title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(rawReads).toEqual([]);
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test('Anonymous endpoint failure renders ERROR, never a false empty result', async ({page}) => {
  await page.route('**/v1/explorer/requests?*', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'indisponible'})}));
  await page.goto('/results.html?mode=annonces&area=');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','ERROR');
  await expect(page.locator('#explorerResults')).not.toContainText("Pas encore d'annonce");
});
