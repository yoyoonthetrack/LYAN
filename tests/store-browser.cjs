'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.route('**/*',r=>r.abort());
   await page.setContent('<section data-store-subscriptions></section>');
   await page.evaluate(()=>{
    window.LYANN_SUPABASE_LOCK='tdktfbtqceldlaeqjtow';
    window.getLyannBackendOrigin=()=> 'https://staging.example.invalid';
    window.LYANN_API_CLIENT={getSession:async()=>({data:{session:{access_token:'fixture'}}})};
    window.__store={fail:true,finishes:0,purchases:0,enabled:true};
    const transaction={transactionId:'fixture',jwsRepresentation:'signed-fixture',productIdentifier:'test.plus',appAccountToken:'fixture-account'};
    const plugin={configure:async()=>{},getProducts:async()=>({products:['plus','pro'].map(p=>({identifier:'test.'+p,priceString:p==='plus'?'7,90 €':'19,90 €',subscriptionPeriod:{numberOfUnits:1,unitString:'month'},introductoryPrice:null}))}),
     purchaseProduct:async()=>{window.__store.purchases++;return transaction;},finishTransaction:async()=>{window.__store.finishes++;},
     restorePurchases:async()=>{},getPurchases:async()=>({purchases:[transaction]}),getUnfinishedTransactions:async()=>({transactions:[]}),manageSubscriptions:async()=>{}};
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'ios',isPluginAvailable:()=>true,registerPlugin:()=>plugin};
    window.fetch=async(url)=>{
     if(url.includes('/config'))return {ok:true,json:async()=>({provider:'apple',purchasesEnabled:window.__store.enabled,restoreEnabled:window.__store.enabled,accountToken:'fixture-account',products:{PLUS:{productId:'test.plus'},PRO:{productId:'test.pro'}},message:'Achats de test uniquement.'})};
     return window.__store.fail?{ok:false,json:async()=>({error:'Vérification indisponible. Réessayez sans racheter.'})}:{ok:true,json:async()=>({verified:true,rights:{plan:'PLUS'}})};
    };
   });
   await page.addScriptTag({path:path.join(__dirname,'..','store-subscriptions.js')});
   const buy=page.getByRole('button',{name:'Lyanneur Plus — 7,90 € / mois',exact:true});
   await buy.waitFor();await buy.click();
   await page.waitForFunction(()=>document.querySelector('[data-store-status]').textContent.includes('sans racheter'));
   assert.equal(await page.evaluate(()=>window.__store.finishes),0);
   await page.evaluate(()=>window.__store.fail=false);
   await page.getByRole('button',{name:'Restaurer mes achats',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[data-store-status]').textContent.includes('actualisés'));
   assert.equal(await page.evaluate(()=>window.__store.finishes),1);
   assert.equal(await page.evaluate(()=>window.__store.purchases),1);
   assert.equal(await page.locator('a[href="legal.html"]').count(),1);
   assert.equal(await page.locator('a[href="confidentialite.html"]').count(),1);
   await page.close();console.log('PASS native UI fixture '+width+'px: store prices, failed validation leaves transaction unfinished, restore without repurchase.');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
