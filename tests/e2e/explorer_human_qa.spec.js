const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const vm = require('node:vm');

async function ready(page, mode='annonces') {
  await page.goto(`/results.html?mode=${mode}&area=`);
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#explorerResults')).not.toHaveAttribute('data-state','ERROR');
}
const telemetry = new WeakMap();
test.beforeEach(async({page})=>{
  const failures=[]; telemetry.set(page,failures);
  page.on('pageerror',e=>failures.push(e.message));
  page.on('console',m=>{if(m.type()==='error')failures.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)failures.push(`${r.status()} ${r.url()}`);});
  page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failures.push(r.url());});
});
test.afterEach(async({page})=>expect(telemetry.get(page)).toEqual([]));

test('Canonical OPEN is the only actionable status; Activity retains meaningful inactive labels',async()=>{
  // Isolated contract over the real helpers, never fixtures in the live database.
  const window={LyanAI:{normalizeText:v=>v.toLowerCase()},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('explorer-repository.js','utf8'),{window});
  const statuses=['OPEN','ASSIGNED','COMPLETED','CANCELLED','CLOSED','INACTIVE'];
  const records=statuses.map(status=>({status,title:'',description:'',created_at:'2026-01-01'}));
  expect(window.LYANN_EXPLORER_REPOSITORY.discover(records,[],{budget:'',status:''},'annonces').map(r=>r.status)).toEqual(['OPEN']);
  const source=fs.readFileSync('script.js','utf8');
  const start=source.indexOf('window.getRequestStatusBadge =');
  vm.runInNewContext(source.slice(start,source.indexOf('window.renderMonActiviteSubView',start)),{window});
  for(const status of ['OPEN','ACTIVE','PUBLISHED']) expect(window.getRequestStatusBadge(status).class).toBe('pill-green');
  for(const status of statuses.slice(1)) expect(window.getRequestStatusBadge(status).class).toBe('pill-red');
  expect(window.getRequestStatusBadge('ASSIGNED').label).toBe('Attribué');
});

test('No status filter or URL bypass; real public Requests remain actionable',async({page})=>{
  await ready(page);
  await page.goto('/results.html?mode=annonces&area=&status=COMPLETED');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(page.locator('#explorerStatus')).toHaveCount(0);
  await expect(page.locator('[data-remove="status"]')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('status')).toBe(false);
  const statuses=await page.evaluate(async()=> (await window.LYANN_EXPLORER_REPOSITORY.loadRequests()).map(r=>r.status));
  expect(statuses.length).toBeGreaterThan(0); expect(statuses.every(s=>s==='OPEN')).toBe(true);
});

for(const width of [390,1440]) test(`Territory and dependent commune at ${width}px preserve filters and clear incompatible communes`,async({page})=>{
  await page.setViewportSize({width,height:900});await ready(page,'lyanneurs');
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  const territory=page.locator('#explorerTerritory'), commune=page.locator('#explorerCommune');
  await expect(territory.locator('option')).toHaveText(['Tous les territoires','Guadeloupe','Martinique','Guyane','Réunion']);
  await expect(commune).toBeDisabled();
  for(const label of ['Guadeloupe (971)','Martinique (972)','Guyane (973)','La Réunion (974)']) {
    await territory.selectOption(label);
    const canonical=await page.evaluate(t=>[...new Set(Object.values(window.LYANN_TERRITORY_DATASET[t]).flat())].sort((a,b)=>a.localeCompare(b,'fr')),label);
    await expect(commune.locator('option')).toHaveText(['Toutes les communes',...canonical]);
  }
  await territory.selectOption('Guadeloupe (971)');await commune.selectOption('Le Gosier');
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await expect(page.locator('#explorerResults')).toHaveAttribute('aria-busy','false');
  const expected=await page.evaluate(async()=> (await window.LYANN_EXPLORER_REPOSITORY.load()).filter(p=>p.territory?.replace(/\s*\(\d+\)/g,'')==='Guadeloupe'&&p.city?.replace(/\s*\(\d+\)/g,'')==='Le Gosier').map(p=>p.id).sort());
  expect(await page.locator('[data-member-id]').evaluateAll(es=>es.map(e=>e.dataset.memberId).sort())).toEqual(expected);
  await page.reload();await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(territory).toHaveValue('Guadeloupe (971)');await expect(commune).toHaveValue('Le Gosier');
  await territory.selectOption('Martinique (972)');await expect(commune).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(page.locator('#explorerFilters')).not.toBeVisible();
  await page.getByRole('button',{name:'Filtres et zone'}).click();
  await expect(territory).toHaveValue('Guadeloupe (971)');await expect(commune).toHaveValue('Le Gosier');
  await territory.selectOption('Martinique (972)');await expect(commune).toHaveValue('');
  await expect(commune.locator('option[value="Le Gosier"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Afficher les résultats'}).click();
  await expect(page.locator('#explorerActiveFilters')).toContainText('Martinique');
  await page.locator('#explorerActiveFilters [data-remove="territory"]').click();
  await expect(page.locator('#explorerActiveFilters')).not.toContainText('Martinique');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Segmented selector and centered introduction support keyboard and clear selected state',async({page})=>{
  await page.setViewportSize({width:390,height:844});await ready(page);
  await expect(page.locator('.explorer-heading')).toContainText('Des besoins et des talents près de chez vous');
  expect(await page.locator('.explorer-heading').evaluate(e=>getComputedStyle(e).textAlign)).toBe('center');
  const first=page.getByRole('tab',{name:/Annonces/}), second=page.getByRole('tab',{name:/Lyanneurs/});
  expect((await first.boundingBox()).height).toBeGreaterThanOrEqual(60);
  expect((await first.boundingBox()).width).toBeGreaterThan(140);
  expect(await first.evaluate(e=>getComputedStyle(e).color)).not.toBe(await second.evaluate(e=>getComputedStyle(e).color));
  await first.focus();await first.press('ArrowRight');
  await expect(second).toBeFocused();await expect(second).toHaveAttribute('aria-selected','true');
  expect(await second.evaluate(e=>getComputedStyle(e).outlineStyle)).not.toBe('none');
  await second.press('Home');await expect(first).toBeFocused();await expect(first).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#explorerResults')).toHaveAttribute('data-state','SUCCESS');
  await page.screenshot({path:'artifacts/explorer/human-qa-mobile.png',fullPage:true});
});

test('Authenticated Activity reads all own historical Requests while Explorer restricts discovery',async({page})=>{
  await page.goto('/index.html');
  const email=process.env.LYANN_E2E_QA_A_EMAIL,password=process.env.LYANN_E2E_QA_A_PASSWORD;
  expect(email).toBeTruthy();expect(password).toBeTruthy();
  const result=await page.evaluate(async({email,password})=>{
    const client=window.LYANN_API_CLIENT;
    const auth=await client.login(email,password);if(auth.error)throw auth.error;
    await window.LYANN_AUTH_STATE.ready();
    const id=(await client.supabase.auth.getSession()).data.session.user.id;
    const {data,error}=await client.supabase.from('requests').select('id,status').eq('requester_id',id);
    if(error)throw error;
    const html=await window.renderMonActiviteSubView(id,'requests');
    const discovery=await window.LYANN_EXPLORER_REPOSITORY.loadRequests({force:true});
    return {rows:data,html,discovery:discovery.map(r=>({id:r.id,status:r.status,safety:r.safety_status,target:r.target_user_id,classification:r.classification_status}))};
  },{email,password});
  expect(result.rows.length).toBeGreaterThan(0);
  for(const row of result.rows)expect(result.html).toContain(row.id);
  expect(result.discovery.length).toBeGreaterThan(0);
  for(const row of result.discovery){expect(row.status).toBe('OPEN');expect(row.safety).toBe('SAFE');expect(row.target).toBeNull();expect(['CLASSIFIED','UNCLASSIFIED']).toContain(row.classification);}
});
