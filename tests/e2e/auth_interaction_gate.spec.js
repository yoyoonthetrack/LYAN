const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const vm = require('node:vm');

const browserTelemetry = new WeakMap();
test.beforeEach(async ({page}) => {
  const errors = [], failures = []; browserTelemetry.set(page, {errors, failures});
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (request.failure()?.errorText !== 'net::ERR_ABORTED') failures.push(request.url()); });
});
test.afterEach(async ({page}) => {
  const telemetry = browserTelemetry.get(page);
  expect(telemetry.errors, 'No unexpected browser errors').toEqual([]);
  expect(telemetry.failures, 'No unexpected failed requests').toEqual([]);
});

// Isolated policy tests execute the real router. Only browser/session and downstream
// action dependencies are substituted; no fixture is inserted into the live backend.
function harness(authenticated = false) {
  const storage = new Map(), calls = [], events = [];
  let readyStatus = 'ready';
  const document = {readyState:'loading',body:{style:{}},addEventListener(){},getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}};
  const window = {location:{origin:'https://lyann.test',href:'https://lyann.test/results.html?mode=annonces',pathname:'/results.html',search:'?mode=annonces',hash:'',assign:url=>calls.push(['navigate',url])},
    addEventListener(){},dispatchEvent:e=>events.push(e),openLoginModal:()=>calls.push(['login']),closeLoginModal(){},
    LYANN_AUTH_STATE:{isAuthenticated:()=>authenticated,getSnapshot:()=>({status:readyStatus,authenticated}),ready:async()=>{readyStatus='ready';}},
    openLyannWizard:query=>calls.push(['publish',query]),openLyannDetailModal:id=>calls.push(['request',id]),
    openPublicMemberProfile:id=>calls.push(['profile',id]),
    LYANN_MESSAGING:{openList:()=>calls.push(['inbox']),openConversation:p=>calls.push(['contact',p])}};
  vm.runInNewContext(fs.readFileSync('app-router.js','utf8'),{window,document,URL,URLSearchParams,console,setTimeout,clearTimeout,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  return {router:window.LYANN_ROUTER,calls,events,storage,authenticate:()=>{authenticated=true;},resolving:()=>{readyStatus='resolving';}};
}

test('Central policy separates public reading from every protected interaction domain', async () => {
  const h = harness();
  for (const action of ['home','explorer','bokantaj','requestDetail','publicProfile','search','filters']) {
    expect(await h.router.requireAuthForInteraction(action)).toBe(true);
  }
  expect(h.calls).toEqual([]);
  for (const action of ['favorite','messages','requestHelp','publish','comment','reaction','communityPublish','proposal','missionAction','account']) {
    expect(await h.router.requireAuthForInteraction(action,{entityId:'fixture-entity'})).toBe(false);
    expect(h.calls.at(-1)).toEqual(['login']);
    const intent=JSON.parse(h.storage.get('lyann_interaction_intent'));
    expect(intent.action).toBe(action);
    expect(intent.destination).toBe('/results.html?mode=annonces');
  }
  expect(()=>h.router.requireAuthForInteraction('unknown-action')).toThrow();
});

test('Authenticated dispatch, login return and single-use continuation keep the canonical context', async () => {
  const h=harness();
  await h.router.go('messages',{contactId:'fixture-person',name:'Person'});
  expect(h.calls).toEqual([['login']]);
  h.authenticate();
  expect(await h.router.resumeAuthIntent()).toBe(true);
  expect(h.calls.at(-1)).toEqual(['contact',{contactId:'fixture-person',name:'Person'}]);
  expect(await h.router.resumeAuthIntent()).toBe(false);
  await h.router.go('publish',{query:'Besoin de jardinage'});
  expect(h.calls.at(-1)).toEqual(['publish','Besoin de jardinage']);
});

for (const [action,payload,expected] of [
  ['publish',{query:'Jardinage'},['publish','Jardinage']],
  ['requestHelp',{requestId:'fixture-request'},['request','fixture-request']],
  ['favorite',{entityId:'fixture-request',entityType:'REQUEST'},['request','fixture-request']],
  ['favorite',{entityId:'fixture-person',entityType:'PROFILE'},['profile','fixture-person']]
]) test(`Login resumes ${action}/${payload.entityType || ''} safely at the exact entity`, async () => {
  const h=harness();
  await h.router.requireAuthForInteraction(action,payload);
  h.authenticate();
  await h.router.resumeAuthIntent();
  expect(h.calls).toEqual([['login'],expected]);
  expect(h.storage.has('lyann_interaction_intent')).toBe(false);
});

test('Contractual submissions never replay after login; cancellation and hostile destinations do not resume', async () => {
  for (const action of ['proposal','missionAction','communityPublish','reaction']) {
    const h=harness(); await h.router.requireAuthForInteraction(action);h.authenticate();await h.router.resumeAuthIntent();
    expect(h.calls).toEqual([['login']]);
  }
  const h=harness();await h.router.requireAuthForInteraction('publish');h.router.cancelAuthIntent();h.authenticate();
  expect(await h.router.resumeAuthIntent()).toBe(false);
  h.storage.set('lyann_interaction_intent',JSON.stringify({action:'publish',destination:'https://evil.test',createdAt:Date.now()}));
  expect(await h.router.resumeAuthIntent()).toBe(false);
});

async function publicExplorer(page, mode='annonces') {
  await page.goto(`/results.html?mode=${mode}&area=`);
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
}
for (const [label,mode,selector] of [
  ['Favorite','annonces','.btn-fav-toggle'],['Contact','lyanneurs','[data-action="contact"]'],
  ['Je peux aider','annonces','[data-action="help"]'],['Publish Request','annonces','.explorer-publish']
]) test(`Anonymous ${label} invokes the shared auth gate without a business write`, async ({page}) => {
  const writes=[];
  page.on('request',r=>{if(r.url().includes('/rest/v1/') && r.method()!=='GET')writes.push(r.url());});
  await publicExplorer(page,mode);
  await page.evaluate(()=>window.__gateActions=[]);
  await page.evaluate(()=>window.addEventListener('lyann:interaction-auth-required',e=>window.__gateActions.push(e.detail.action)));
  await page.locator(selector).first().click();
  await expect(page.locator('#loginModal')).toBeVisible();
  expect(await page.evaluate(()=>window.__gateActions.length)).toBeGreaterThan(0);
  expect(writes).toEqual([]);
});
for(const [label,selector] of [['Comment','.btn-comments-toggle'],['Reaction','.btn-like-flash']]) test(`Anonymous ${label} in public Bokantaj invokes the same gate`,async({page})=>{
  await page.goto('/feed.html');
  const button=page.locator(selector).first(); await expect(button).toBeVisible({timeout:15000});
  await button.click();await expect(page.locator('#loginModal')).toBeVisible();
  const pending=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lyann_interaction_intent')));
  expect(pending.action).toBe(label==='Comment'?'comment':'reaction');
  expect(pending.payload.entityId).toBeTruthy();
});

for(const action of ['publish','requestHelp','favorite']) test(`Real login returns anonymous ${action} to its correct public context without submitting`,async({page})=>{
  const email=process.env.LYANN_E2E_QA_B_EMAIL,password=process.env.LYANN_E2E_QA_B_PASSWORD;
  expect(email,'QA identity supplied through runner environment').toBeTruthy();expect(password).toBeTruthy();
  await publicExplorer(page);
  const card=page.locator('[data-request-id]').first();const id=await card.getAttribute('data-request-id');
  const writes=[];page.on('request',r=>{if(r.url().includes('/rest/v1/') && r.method()!=='GET')writes.push(r.url());});
  if(action==='publish')await page.locator('.explorer-publish').first().click();
  else await card.locator(action==='favorite'?'.btn-fav-toggle':'[data-action="help"]').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm button[type="submit"]').click();
  if(action==='publish')await expect(page.locator('#modal-request-help')).toBeVisible();
  else {
    await expect(page.locator('#lyannDetailModal')).toBeVisible();
    await expect(page.locator('#lyannDetailFavBtn')).toHaveAttribute('data-favorite-id',id);
    if(action==='favorite')await expect(page.locator('#lyannDetailFavBtn')).toBeFocused();
  }
  await expect(page.locator('#loginModal')).not.toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(()=>sessionStorage.getItem('lyann_interaction_intent'))).toBeNull();
});

test('Public Request detail by id uses the canonical public reader, without raw anonymous Requests reads',async({page,request})=>{
  const response=await request.get('/v1/explorer/requests');expect(response.ok()).toBe(true);
  const row=(await response.json()).requests[0];expect(row).toBeTruthy();
  const raw=[];page.on('request',r=>{if(/\/rest\/v1\/requests(?:\?|$)/.test(r.url()))raw.push(r.url());});
  await page.goto('/index.html');
  await page.evaluate(id=>window.openLyannDetailModal(id),row.id);
  await expect(page.locator('#lyannDetailTitle')).toHaveText(row.title);
  await expect(page.locator('#loginModal')).not.toBeVisible();expect(raw).toEqual([]);
});

test('Authentication resolving does not mistake a restored session for an anonymous visitor',async()=>{
  const h=harness(true);h.resolving();
  expect(await h.router.requireAuthForInteraction('favorite')).toBe(true);
  expect(h.calls).toEqual([]);
});

const {requireWriteBackend}=require('./helpers/approved-backend');
for(const action of ['contact','favorite'])test(`Approved staging: anonymous ${action} → login → canonical persisted outcome`,async({page})=>{
  await requireWriteBackend(page);
  await publicExplorer(page,action==='contact'?'lyanneurs':'annonces');
  const card=page.locator(action==='contact'?'[data-member-id]':'[data-request-id]').first();
  const id=await card.getAttribute(action==='contact'?'data-member-id':'data-request-id');
  await card.locator(action==='contact'?'[data-action="contact"]':'.btn-fav-toggle').click();
  await expect(page.locator('#loginModal')).toBeVisible();
  await page.locator('#loginEmail').fill(process.env.LYANN_E2E_HELPER_EMAIL);
  await page.locator('#loginPassword').fill(process.env.LYANN_E2E_HELPER_PASSWORD);
  await page.locator('#loginForm button[type=submit]').click();
  if(action==='contact'){
    await expect(page.locator('#chatModal')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>window.LYANN_ACTIVE_CHAT_CONTACT?.id)).toBe(id);
    const name=await page.evaluate(async id=>{
      const {data,error}=await window.LYANN_API_CLIENT.supabase.from('public_profiles').select('first_name,last_name').eq('id',id).single();
      if(error)throw error;return window.formatPublicName(data,null,'Lyanneur');
    },id);
    await expect(page.locator('#chatHeaderName')).toHaveText(name);
  }else{
    const button=page.locator('#lyannDetailFavBtn');await expect(button).toHaveAttribute('data-favorite-id',id);
    const before=await page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id);
    await button.click();
    await expect.poll(()=>page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(!before);
    await page.reload();await page.evaluate(id=>window.openLyannDetailModal(id),id);
    await expect(button).toHaveAttribute('aria-pressed',String(!before));
    await button.click();
    await expect.poll(()=>page.evaluate(id=>window.LyannFavoritesService.isFavorite('REQUEST',id),id)).toBe(before);
  }
});

test('Cancellation clears the intent and login/register switching preserves it until cancellation',async({page})=>{
  await publicExplorer(page);
  await page.locator('.explorer-publish').first().click();
  await page.locator('#switchToSignupBtn').click();
  expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(true);
  await page.locator('#closeOnboardingBtn').click();
  expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(false);
});

test('Pending publication survives reload and resumes after real authentication',async({page})=>{
  const email=process.env.LYANN_E2E_QA_B_EMAIL,password=process.env.LYANN_E2E_QA_B_PASSWORD;
  expect(email).toBeTruthy();expect(password).toBeTruthy();
  await publicExplorer(page);await page.locator('.explorer-publish').first().click();await page.reload();
  expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(true);
  await page.evaluate(()=>window.openLoginModal());
  await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);
  await page.locator('#loginForm button[type=submit]').click();
  await expect(page.locator('#modal-request-help')).toBeVisible();
  expect(await page.evaluate(()=>window.LYANN_ROUTER.hasAuthIntent())).toBe(false);
});
