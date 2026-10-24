'use strict';
(function(root){
 function selectProducts(config,products){
  return ['PLUS','PRO'].map(plan=>{
   const rule=config.products[plan];
   const product=(products||[]).find(p=>config.provider==='apple'?p.identifier===rule.productId
    :p.planIdentifier===rule.productId&&p.identifier===rule.basePlanId&&!p.offerId);
   if(!product||!product.priceString||product.subscriptionPeriod?.numberOfUnits!==1||product.subscriptionPeriod?.unitString!=='month'
    ||product.introductoryPrice||product.pricingTerms?.some(t=>t.commitmentInfo))throw Error('La formule mensuelle sans offre n’est pas disponible dans ce magasin.');
   return {plan,rule,product};
  });
 }
 function createController({plugin,request,provider,onChange=()=>{}}){
  let configuration=null,busy=false;
  async function setup(){
   configuration=await request('/v1/store/config?provider='+provider);
   if(configuration.provider!==provider)throw Error('Magasin invalide.');
   await plugin.configure({autoFinishTransactions:false});
   return configuration;
  }
  async function deliver(transaction){
   const proof=provider==='apple'?transaction.jwsRepresentation:transaction.purchaseToken;
   if(!proof)throw Error('La preuve du magasin manque. Réessayez avec Restaurer mes achats.');
   const result=await request('/v1/store/verify',{provider,proof});
   if(result.verified!==true)throw Error('Achat non confirmé par LYANN.');
   if(provider==='apple')await plugin.finishTransaction({transactionId:transaction.transactionId});
   // Google acknowledgment is performed by the server, after entitlement persistence.
   onChange(result.rights);return result;
  }
  async function exclusive(fn){
   if(busy)throw Error('Une opération est déjà en cours.');
   busy=true;try{return await fn();}finally{busy=false;}
  }
  return {
   async catalog(){const c=await setup();if(!c.restoreEnabled)return {config:c,items:[]};
    const data=await plugin.getProducts({productIdentifiers:Object.values(c.products).map(x=>x.productId),productType:'subs'});
    return {config:c,items:selectProducts(c,data.products)};
   },
   purchase(item){return exclusive(async()=>{
    const c=await setup();if(!c.purchasesEnabled)throw Error(c.message||'Achats indisponibles.');
    if(!c.products[item.plan]||c.products[item.plan].productId!==item.rule.productId)throw Error('Rechargez les formules avant de continuer.');
    const transaction=await plugin.purchaseProduct({productIdentifier:item.rule.productId,planIdentifier:item.rule.basePlanId,
     offerToken:item.product.offerToken,productType:'subs',appAccountToken:c.accountToken,autoAcknowledgePurchases:false});
    return deliver(transaction);
   });},
   restore(){return exclusive(async()=>{
    const c=await setup();if(!c.restoreEnabled)throw Error(c.message||'Restauration indisponible.');
    await plugin.restorePurchases();
    const {purchases}=await plugin.getPurchases({productType:'subs',onlyCurrentEntitlements:true});
    const {transactions=[]}=await plugin.getUnfinishedTransactions();
    const ids=new Set(),all=[...(purchases||[]),...transactions].filter(t=>{
     const id=t.purchaseToken||t.transactionId;if(ids.has(id))return false;ids.add(id);return true;
    });
    let restored=0,failed=0;
    for(const t of all){
     if(!Object.values(c.products).some(p=>p.productId===t.productIdentifier))continue;
     if(t.appAccountToken&&t.appAccountToken.toLowerCase()!==c.accountToken.toLowerCase()){failed++;continue;}
     try{await deliver(t);restored++;}catch(_){failed++;}
    }
    return {restored,failed};
   });},
   recover(){return exclusive(async()=>{
    const c=await setup();if(!c.restoreEnabled)return {restored:0,failed:0};
    const {transactions=[]}=await plugin.getUnfinishedTransactions();let restored=0,failed=0;
    for(const t of transactions){
     if(!Object.values(c.products).some(p=>p.productId===t.productIdentifier))continue;
     if(t.appAccountToken&&t.appAccountToken.toLowerCase()!==c.accountToken.toLowerCase())continue;
     try{await deliver(t);restored++;}catch(_){failed++;}
    }
    return {restored,failed};
   });},
   async manage(){await plugin.manageSubscriptions();}
  };
 }
 const exported={selectProducts,createController};
 if(typeof module!=='undefined'&&module.exports){module.exports=exported;return;}
 root.LYANN_STORE=exported;
 function paintStorePrice(plan, priceString){
  const slot=document.querySelector('[data-store-price="'+plan+'"]');
  if(!slot)return;
  slot.replaceChildren();
  const source=document.createElement('span');
  source.className='lyann-offer-source';
  source.textContent='Prix du magasin';
  slot.append(source, document.createTextNode(priceString+' '), Object.assign(document.createElement('small'),{textContent:'/ mois'}));
 }
 async function mount(){
  const host=document.querySelector('[data-store-subscriptions]');if(!host)return;
  const managed=host.dataset.storeLayout==='manage';
  if(!managed){
   host.innerHTML='<h2>Mon abonnement dans l’application</h2><p data-store-status role="status" aria-live="polite"></p><div data-store-products></div><button type="button" data-store-restore disabled>Restaurer mes achats</button> <button type="button" data-store-manage disabled>Gérer mon abonnement</button><p>Abonnement mensuel à renouvellement automatique. Le prix et les conditions du magasin sont présentés avant confirmation. Vous pouvez annuler le renouvellement dans votre magasin.</p><p><a href="legal.html">Conditions d’utilisation</a> · <a href="confidentialite.html">Confidentialité</a></p>';
  }
  const status=host.querySelector('[data-store-status]'),restore=host.querySelector('[data-store-restore]'),manage=host.querySelector('[data-store-manage]');
  if(root.LYANN_SUPABASE_LOCK!=='tdktfbtqceldlaeqjtow'){status.textContent='Les abonnements ne sont pas encore disponibles.';return;}
  if(!root.Capacitor?.isNativePlatform?.()){status.textContent='Les achats Apple et Google seront disponibles dans l’application mobile. Aucun achat Web n’est activé.';return;}
  const platform=root.Capacitor.getPlatform(),provider=platform==='ios'?'apple':platform==='android'?'google':null;
  if(!provider||!root.Capacitor.isPluginAvailable('NativePurchases')){status.textContent='Mettez à jour l’application pour accéder aux abonnements.';return;}
  const plugin=root.Capacitor.registerPlugin('NativePurchases');
  async function request(path,body){
   const session=await(root.LYANN_API_CLIENT||root.apiClient)?.getSession();
   const token=session?.data?.session?.access_token;if(!token)throw Error('Connectez-vous pour gérer votre abonnement.');
   const origin=typeof getLyannBackendOrigin==='function'?getLyannBackendOrigin():root.LYANN_BACKEND_ORIGIN;
   if(!origin)throw Error('La passerelle Staging doit être configurée.');
   const res=await fetch(origin+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Magasin indisponible.');return data;
  }
  const controller=createController({plugin,request,provider,onChange:()=>{
   root.LYANN_PROFILE_REPOSITORY?.invalidate?.();document.getElementById('refreshRights')?.click();
  }});
  async function action(fn){
   const buttons=[...host.querySelectorAll('button')],disabled=buttons.map(b=>b.disabled);
   buttons.forEach(b=>b.disabled=true);
   try{await fn();}catch(e){status.textContent=e.message||'Opération interrompue. Aucun droit accordé sans validation.';}
   finally{buttons.forEach((b,i)=>b.disabled=disabled[i]||b.dataset.storeLocked==='true');}
  }
  manage.disabled=false;manage.onclick=()=>action(()=>controller.manage());
  restore.onclick=()=>action(async()=>{const r=await controller.restore();status.textContent=r.failed
   ?'Certains achats n’ont pas pu être restaurés ou appartiennent à un autre compte LYANN. Réessayez sans racheter.'
   :r.restored?'Vos achats ont été vérifiés et vos droits actualisés.':'Aucun abonnement à restaurer pour ce compte.';});
  try{
   const {config,items}=await controller.catalog();status.textContent=config.message;
   restore.disabled=!config.restoreEnabled;
   if(config.restoreEnabled){
    const recover=async()=>{try{const r=await controller.recover();if(r.restored)status.textContent='Votre achat en attente a été confirmé.';else if(r.failed)status.textContent='Un achat reste à vérifier. Réessayez avec Restaurer mes achats, sans racheter.';}catch(_){}};
    if(plugin.addListener)await plugin.addListener('transactionUpdated',recover);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')recover();});
    await recover();
   }
   for(const item of items){
    paintStorePrice(item.plan, item.product.priceString);
    if(!config.purchasesEnabled)continue;
    const button=document.createElement('button');button.type='button';button.textContent=item.plan==='PRO'?'Pro':'Lyanneur Plus';
    button.textContent+=' — '+item.product.priceString+' / mois';
    button.onclick=()=>action(async()=>{await controller.purchase(item);status.textContent='Achat confirmé. Vos droits ont été actualisés.';for(const b of host.querySelectorAll('[data-store-products] button, [data-store-buy] button')){b.dataset.storeLocked='true';b.disabled=true;}});
    const slot=document.querySelector('[data-store-buy="'+item.plan+'"]')||host.querySelector('[data-store-products]');
    slot?.append(button);
   }
  }catch(e){status.textContent=e.message;}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})(typeof window==='undefined'?globalThis:window);
