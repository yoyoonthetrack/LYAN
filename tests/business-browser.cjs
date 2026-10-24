
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require('playwright');
const {buildHtml}=require('../shared-html-build');
(async()=>{
 fs.mkdirSync(path.join(__dirname,'..','work'),{recursive:true});
 const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'')||'pricing.html';
  if(name.includes('..')){res.writeHead(404).end();return;}
  const p=path.join(__dirname,'..',name);
  if(!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404).end();return;}
  const type=name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'application/octet-stream';
  res.setHeader('Content-Type',type);
  res.end(name.endsWith('.html')?buildHtml(fs.readFileSync(p,'utf8')):fs.readFileSync(p));
 }).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [375,390,430,768,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   let contacts=0;
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(origin)){await route.abort();return;}
    if(url.includes('/v1/business/contact')){
     contacts++;const body=route.request().postDataJSON();assert.equal(body.kind,'enterprise');assert.equal(body.organization,'Atelier QA');
     await route.fulfill({json:{id:'fixture',message:'Votre demande est enregistrée.'}});return;
    }
    if(url.includes('/v1/business/rights')){await route.fulfill({json:{plan:'FREE',enforced:true,limits:{missions:2,photos:5,categories:1},usage:{missions:1,photos:3,categories:1},resets_at:'2026-11-01T00:00:00Z'}});return;}
    if(url.includes('/v1/business/me')){await route.fulfill({json:{plan:{code:'FREE',name:'Gratuit'},dossier:null,verified:false,purchasesEnabled:false}});return;}
    await route.continue();
   });
   await page.goto(origin+'/pricing.html');
   await page.waitForFunction(()=>window.LYANN_BUSINESS && document.querySelector('#plansComparison table'));
   assert.equal(await page.locator('.lyann-offer').count(),4);
   assert.match(await page.locator('h1').innerText(),/À chacun son rythme/);
   assert.match(await page.locator('.pricing-main-section').innerText(),/7,99 €/);
   assert.match(await page.locator('.pricing-main-section').innerText(),/19,99 €/);
   assert.doesNotMatch(await page.locator('.pricing-main-section').innerText(),/7,90|19,90/);
   assert.match(await page.locator('#lyannPlanState').innerText(),/ne sont pas encore ouverts/);
   assert.equal(await page.locator('[data-store-buy] button').count(),0);
   assert.doesNotMatch(await page.locator('[data-store-status]').innerText(),/Vérification des achats/);
   assert.match(await page.locator('#plansComparison summary').innerText(),/Comparer les formules/);
   await page.getByRole('button',{name:'Choisir Pro',exact:true}).click();
   assert.equal(await page.locator('[data-offer="PRO"].is-picked').count(),1);
   assert.match(await page.locator('#lyannOfferChoice').innerText(),/Pro/);
   assert.equal(await page.locator('#plansComparison tr').filter({hasText:'Paiement par étape'}).locator('td').filter({hasText:'Inclus'}).count(),3);
   await page.locator('#plansComparison summary').click();
   if(width<800){
    await page.getByRole('tab',{name:'Plus'}).click();
    assert.match(await page.locator('.lyann-compare-mobile').innerText(),/pas encore disponible/);
    await page.getByRole('tab',{name:'Pro'}).click();
    assert.match(await page.locator('.lyann-compare-mobile').innerText(),/50/);
    assert.match(await page.locator('.lyann-compare-mobile').innerText(),/pas encore disponible/);
   }else{
    assert.match(await page.locator('#plansComparison').innerText(),/pas encore disponible/);
   }
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
   assert.equal(overflow,false);
   if(width===390){
    await page.evaluate(()=>{document.documentElement.style.fontSize='22px';});
    const large=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+1);
    assert.equal(large,false);
    await page.evaluate(()=>{document.documentElement.style.fontSize='';});
   }
   await page.getByRole('button',{name:'Nous contacter',exact:true}).click();
   await page.evaluate(()=>{window.apiClient.getSession=async()=>({data:{session:{access_token:'fixture'}}});window.getLyannBackendOrigin=()=>location.origin;});
   await page.locator('#businessContact [name=name]').fill('Test');
   await page.locator('#businessContact [name=organization]').fill('Atelier QA');
   await page.locator('#businessContact [name=email]').fill('test@example.invalid');
   await page.locator('#businessContact [name=message]').fill('Plusieurs établissements.');
   await page.locator('#businessContact button').click();
   await page.waitForFunction(()=>document.querySelector('#businessDialog #businessNotice').textContent.includes('enregistrée'));
   assert.equal(contacts,1);
   contacts=0;
   await page.keyboard.press('Escape');
   await page.screenshot({path:'work/plans-'+width+'.png',fullPage:true});
   await page.goto(origin+'/professional.html');
   await page.waitForFunction(()=>window.LYANN_BUSINESS);
   await page.evaluate(async()=>{
    window.apiClient.getSession=async()=>({data:{session:{access_token:'fixture'}}});window.getLyannBackendOrigin=()=>location.origin;
    const data=await window.LYANN_BUSINESS.request('/v1/business/me');window.__qaPlan=data.plan.code;
   });
   assert.equal(await page.evaluate(()=>window.__qaPlan),'FREE');
   await page.locator('#refreshRights').click();
   await page.waitForFunction(()=>document.querySelector('#businessRights').textContent.includes('1 / 2'));
   assert.ok((await page.locator('#businessRights').innerText()).includes('3 / 5'));
   assert.match(await page.locator('#businessRights').innerText(),/00 h UTC/);
   assert.equal(await page.locator('text=Back-office').count(),0);
   assert.equal(await page.locator('.navbar').count(),1);
   await page.evaluate(async()=>{
    window.apiClient.getSession=async()=>({data:{session:{access_token:'fixture'}}});window.getLyannBackendOrigin=()=>location.origin;
    await window.LYANN_BUSINESS.loadMe();
   });
   assert.equal(await page.locator('#proToolsGate').isVisible(),true);
   assert.equal(await page.locator('[data-pro-verify]:visible').count(),0);
   assert.equal(await page.locator('#proIdentity').isVisible(),false);
   assert.equal(await page.locator('[data-pro-tools]').count(),3);
   assert.equal(await page.locator('[data-pro-tools]:visible').count(),0);
   assert.doesNotMatch(await page.locator('body').innerText(),/Découverte|Premium/);

   await page.close();console.log('PASS browser '+width+'px: prices, 4 plans, free staged payment, dialog, contact persistence response, private workspace session and server usage counters.');
  }
  const statePage=await browser.newPage({viewport:{width:390,height:900}});
  let planMode='error';
  await statePage.addInitScript(()=>{
   let client;
   Object.defineProperty(window,'apiClient',{configurable:true,enumerable:true,get(){return client;},set(value){
    value.getSession=async()=>({data:{session:{access_token:'fixture'}}});
    client=value;
    window.getLyannBackendOrigin=()=>location.origin;
   }});
  });
  await statePage.route('**/*',async route=>{
   const url=route.request().url();
   if(!url.startsWith(origin)){await route.abort();return;}
   if(url.includes('/v1/business/me')){
    const headers={'cache-control':'no-store'};
    if(planMode==='error')await route.fulfill({status:503,headers,json:{error:'indisponible'}});
    else await route.fulfill({status:200,headers,json:{plan:{code:'PLUS',name:'Plus'},purchasesEnabled:false}});
    return;
   }
   await route.continue();
  });
  await statePage.goto(origin+'/pricing.html');
  await statePage.waitForFunction(()=>document.querySelector('#lyannPlanState').textContent.includes('pas pu être vérifiée'));
  assert.equal(await statePage.locator('.is-current').count(),0);
  assert.equal(await statePage.locator('[data-store-restore]').isDisabled(),true);
  assert.equal(await statePage.locator('[data-store-manage]').isDisabled(),true);
  assert.equal(await statePage.locator('[data-store-buy] button').count(),0);
  planMode='plus';
  await statePage.reload();
  await statePage.waitForFunction(()=>document.querySelector('#lyannPlanState').textContent.includes('Votre formule : Plus'));
  assert.equal(await statePage.locator('[data-offer="PLUS"].is-current').count(),1);
  assert.equal(await statePage.locator('#lyannJoinFree').isHidden(),true);
  assert.equal(await statePage.locator('[data-offer="FREE"].is-current').count(),0);
  await statePage.screenshot({path:'work/plans-plus-390.png',fullPage:true});
  await statePage.close();
  console.log('PASS plan states: network error stays unverified, Plus is current, purchases stay closed.');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
