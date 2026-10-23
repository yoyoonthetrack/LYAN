
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
  for(const width of [390,1280]){
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
    if(url.includes('/v1/business/me')){await route.fulfill({json:{plan:{code:'FREE',name:'Gratuit'},dossier:null,verified:false}});return;}
    await route.continue();
   });
   await page.goto(origin+'/pricing.html');
   await page.waitForFunction(()=>window.LYANN_BUSINESS && document.querySelector('#plansComparison table'));
   assert.equal(await page.locator('.pricing-main-section .pricing-card').count(),4);
   assert.match(await page.locator('.pricing-main-section').innerText(),/7,90/);
   assert.match(await page.locator('.pricing-main-section').innerText(),/19,90/);
   assert.equal(await page.locator('#plansComparison tr').filter({hasText:'Paiement par étape'}).locator('td').filter({hasText:'Inclus'}).count(),3);
   await page.getByRole('button',{name:'Découvrir Plus',exact:true}).click();
   assert.equal(await page.locator('#businessDialog').isVisible(),true);
   assert.match(await page.locator('#businessDialog').innerText(),/Aucun abonnement payant/);
   await page.keyboard.press('Escape');
   await page.getByRole('button',{name:'Nous contacter',exact:true}).click();
   await page.evaluate(()=>{window.apiClient.getSession=async()=>({data:{session:{access_token:'fixture'}}});window.getLyannBackendOrigin=()=>location.origin;});
   await page.locator('#businessContact [name=name]').fill('Test');
   await page.locator('#businessContact [name=organization]').fill('Atelier QA');
   await page.locator('#businessContact [name=email]').fill('test@example.invalid');
   await page.locator('#businessContact [name=message]').fill('Plusieurs établissements.');
   await page.locator('#businessContact button').click();
   await page.waitForFunction(()=>document.querySelector('#businessDialog #businessNotice').textContent.includes('enregistrée'));
   assert.equal(contacts,1);
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

   await page.close();console.log('PASS browser '+width+'px: prices, 4 plans, free staged payment, dialog, contact persistence response, private workspace session and server usage counters.');
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
