'use strict';
const {createHash}=require('node:crypto');
const APP='app.lyann.mobile';
function error(status,message){const e=new Error(message);e.status=status;e.expose=true;throw e;}
function config(env,provider){
 if(env.SUPABASE_URL!=='https://tdktfbtqceldlaeqjtow.supabase.co'||env.VERCEL_ENV==='production')error(403,'Achats réservés à Staging.');
 if(!['apple','google'].includes(provider))error(400,'Magasin invalide.');
 const prefix=provider==='apple'?'LYANN_APPLE':'LYANN_GOOGLE';
 let products;try{products=JSON.parse(env[prefix+'_PRODUCTS']||'null');}catch(_){}
 const valid=products&&['PLUS','PRO'].every(p=>typeof products[p]?.productId==='string'&&/^[A-Za-z0-9._-]{1,200}$/.test(products[p].productId)
 &&(provider!=='google'||/^[a-z0-9-]{1,100}$/.test(products[p].basePlanId||'')))
 &&products.PLUS.productId!==products.PRO.productId;
 const keys=provider==='apple'?['ISSUER_ID','KEY_ID','PRIVATE_KEY','ROOT_CERTIFICATES']:['SERVICE_ACCOUNT','PUSH_AUDIENCE','PUSH_EMAIL'];
 const ready=!!valid&&keys.every(k=>!!env[prefix+'_'+k])&&env[prefix+'_NOTIFICATIONS_READY']==='true';
 return {provider,app:APP,products:valid?products:{},ready,enabled:ready&&env.LYANN_STORE_TEST_PURCHASES_ENABLED==='true'};
}
function selected(c,id,basePlan){
 const item=Object.entries(c.products).find(([,v])=>v.productId===id&&(c.provider!=='google'||v.basePlanId===basePlan));
 if(!item)error(400,'Produit non autorisé.');
 return item[0];
}
function key(provider,value){return createHash('sha256').update(provider+':'+value).digest('hex');}
function normalizeApple(c,t,r,status,expectedAccount,now=Date.now()){
 if(t.bundleId!==APP||t.environment!=='Sandbox'||t.type!=='Auto-Renewable Subscription'||t.inAppOwnershipType!=='PURCHASED'||t.isUpgraded===true)error(400,'Transaction Apple non admissible.');
 if(!t.appAccountToken||t.appAccountToken.toLowerCase()!==expectedAccount.toLowerCase())error(403,'Cet achat appartient à un autre compte LYANN.');
 if(!t.originalTransactionId||r.originalTransactionId!==t.originalTransactionId||r.environment!=='Sandbox')error(400,'Renouvellement Apple invalide.');
 const plan=selected(c,t.productId);
 let expiry=Number(t.expiresDate);
 if(status===4)expiry=Number(r.gracePeriodExpiresDate);
 if(!Number.isFinite(expiry)||expiry<=0)error(400,'Échéance Apple invalide.');
 const active=[1,4].includes(status)&&!t.revocationDate&&expiry>now;
 return {provider:'apple',purchaseKey:key('apple',t.originalTransactionId),productId:t.productId,plan,
 status:t.revocationDate||status===5?'revoked':active?(r.autoRenewStatus===0?'cancel_at_period_end':'active'):'expired',
 expiresAt:new Date(expiry).toISOString(),environment:'Sandbox',accountToken:t.appAccountToken.toLowerCase()};
}
function normalizeGoogle(c,data,token,expectedAccount,now=Date.now()){
 if(!data.testPurchase||typeof data.testPurchase!=='object')error(400,'Seuls les achats Google de test sont acceptés.');
 const account=data.externalAccountIdentifiers?.obfuscatedExternalAccountId;
 if(!account||account.toLowerCase()!==expectedAccount.toLowerCase())error(403,'Cet achat appartient à un autre compte LYANN.');
 if(['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(data.subscriptionState))error(409,'Achat en attente ou annulé.');
 if(!Array.isArray(data.lineItems)||data.lineItems.length!==1)error(400,'Abonnement Google non pris en charge.');
 const item=data.lineItems[0],plan=selected(c,item.productId,item.offerDetails?.basePlanId);
 if(item.offerDetails?.offerId||!item.autoRenewingPlan)error(400,'Seule la formule mensuelle sans offre est prise en charge.');
 const expiry=Date.parse(item.expiryTime);if(!Number.isFinite(expiry))error(400,'Échéance Google invalide.');
 const active=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(data.subscriptionState)&&expiry>now;
 return {provider:'google',purchaseKey:key('google',token),productId:item.productId,plan,
 status:active?(item.autoRenewingPlan.autoRenewEnabled===false?'cancel_at_period_end':'active'):'expired',
 expiresAt:new Date(expiry).toISOString(),environment:'Test',accountToken:account.toLowerCase(),
 needsAcknowledgement:active&&data.acknowledgementState==='ACKNOWLEDGEMENT_STATE_PENDING'};
}
function validateGooglePushClaims(p,email){
 if(!p||!['accounts.google.com','https://accounts.google.com'].includes(p.iss)||p.email!==email||p.email_verified!==true)error(401,'Émetteur de notification invalide.');
}
function createVerifier(env){
 const {AppStoreServerAPIClient,SignedDataVerifier,Environment}=require('@apple/app-store-server-library');
 const {GoogleAuth,OAuth2Client}=require('google-auth-library');
 let apple,google;
 function appleClients(){
  if(!apple){
   const roots=JSON.parse(env.LYANN_APPLE_ROOT_CERTIFICATES).map(x=>Buffer.from(x,'base64'));
   if(!roots.length)error(503,'Certificats Apple non configurés.');
   apple={api:new AppStoreServerAPIClient(env.LYANN_APPLE_PRIVATE_KEY.replace(/\\n/g,'\n'),env.LYANN_APPLE_KEY_ID,env.LYANN_APPLE_ISSUER_ID,APP,Environment.SANDBOX),
   verifier:new SignedDataVerifier(roots,true,Environment.SANDBOX,APP)};
  }return apple;
 }
 async function googleClient(){
  if(!google)google=await new GoogleAuth({credentials:JSON.parse(env.LYANN_GOOGLE_SERVICE_ACCOUNT),scopes:['https://www.googleapis.com/auth/androidpublisher']}).getClient();
  return google;
 }
 async function googleGet(token){
  const client=await googleClient();
  const res=await client.request({url:'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+APP+'/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token),timeout:15000});
  return res.data;
 }
 return {
  async apple(jws,account){
   const c=config(env,'apple'),{api,verifier}=appleClients();
   const hint=await verifier.verifyAndDecodeTransaction(jws);
   if(hint.appAccountToken?.toLowerCase()!==account.toLowerCase())error(403,'Cet achat appartient à un autre compte LYANN.');
   const response=await api.getAllSubscriptionStatuses(hint.originalTransactionId);
   if(response.environment!=='Sandbox'||response.bundleId!==APP)error(400,'Environnement Apple invalide.');
   const item=(response.data||[]).flatMap(g=>g.lastTransactions||[]).find(x=>x.originalTransactionId===hint.originalTransactionId);
   if(!item?.signedTransactionInfo||!item.signedRenewalInfo)error(503,'État Apple indisponible.');
   const t=await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo),r=await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo);
   return normalizeApple(c,t,r,item.status,account);
  },
  async google(token,account){return normalizeGoogle(config(env,'google'),await googleGet(token),token,account);},
  async acknowledgeGoogle(token,productId){
   const client=await googleClient();await client.request({method:'POST',url:'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+APP+'/purchases/subscriptions/'+encodeURIComponent(productId)+'/tokens/'+encodeURIComponent(token)+':acknowledge',data:{},timeout:15000});
  },
  async appleNotification(body){
   const {verifier}=appleClients();const n=await verifier.verifyAndDecodeNotification(body.signedPayload);
   if(n.notificationType==='TEST')return {test:true};
   if(!n.data?.signedTransactionInfo)error(400,'Notification Apple invalide.');
   const t=await verifier.verifyAndDecodeTransaction(n.data.signedTransactionInfo);
   return {account:t.appAccountToken?.toLowerCase(),proof:n.data.signedTransactionInfo};
  },
  async googleNotification(req){
   const bearer=String(req.headers.authorization||'');if(!bearer.startsWith('Bearer '))error(401,'Notification non authentifiée.');
   const ticket=await new OAuth2Client().verifyIdToken({idToken:bearer.slice(7),audience:env.LYANN_GOOGLE_PUSH_AUDIENCE});
   const p=ticket.getPayload();
   validateGooglePushClaims(p,env.LYANN_GOOGLE_PUSH_EMAIL);
   let n;try{n=JSON.parse(Buffer.from(req.body?.message?.data||'','base64').toString('utf8'));}catch(_){error(400,'Notification invalide.');}
   if(n.packageName!==APP)error(400,'Application Google invalide.');
   if(n.testNotification)return {test:true};
   const token=n.subscriptionNotification?.purchaseToken;if(typeof token!=='string'||token.length>4096)error(400,'Jeton Google invalide.');
   const data=await googleGet(token);if(!data.testPurchase)error(400,'Notification hors test.');
   return {account:data.externalAccountIdentifiers?.obfuscatedExternalAccountId?.toLowerCase(),proof:token};
  }
 };
}
module.exports={APP,error,config,selected,key,normalizeApple,normalizeGoogle,validateGooglePushClaims,createVerifier};
