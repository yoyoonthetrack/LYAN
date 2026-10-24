'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {config,normalizeApple,normalizeGoogle,key,APP}=require('../api/store-verification');
const {registerStoreRoutes}=require('../api/store-routes');
const {createController,selectProducts}=require('../store-subscriptions');
const user='86000000-0000-4000-a000-000000000001',account='86000000-0000-4000-a000-000000000002';
const products={PLUS:{productId:'test.plus',basePlanId:'monthly'},PRO:{productId:'test.pro',basePlanId:'monthly'}};
const env={SUPABASE_URL:'https://tdktfbtqceldlaeqjtow.supabase.co',VERCEL_ENV:'preview',
 LYANN_STORE_TEST_PURCHASES_ENABLED:'true',
 LYANN_APPLE_PRODUCTS:JSON.stringify(products),LYANN_APPLE_ISSUER_ID:'fixture',LYANN_APPLE_KEY_ID:'fixture',LYANN_APPLE_PRIVATE_KEY:'fixture',LYANN_APPLE_ROOT_CERTIFICATES:'fixture',LYANN_APPLE_NOTIFICATIONS_READY:'true',
 LYANN_GOOGLE_PRODUCTS:JSON.stringify(products),LYANN_GOOGLE_SERVICE_ACCOUNT:'fixture',LYANN_GOOGLE_PUSH_AUDIENCE:'fixture',LYANN_GOOGLE_PUSH_EMAIL:'fixture',LYANN_GOOGLE_NOTIFICATIONS_READY:'true'};
function apple(){return {bundleId:APP,environment:'Sandbox',type:'Auto-Renewable Subscription',inAppOwnershipType:'PURCHASED',originalTransactionId:'123',appAccountToken:account,productId:'test.plus',expiresDate:Date.now()+3600000};}
function renewal(){return {originalTransactionId:'123',environment:'Sandbox',autoRenewStatus:1};}
function google(){return {testPurchase:{},externalAccountIdentifiers:{obfuscatedExternalAccountId:account},subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'test.plus',offerDetails:{basePlanId:'monthly'},autoRenewingPlan:{autoRenewEnabled:true},expiryTime:new Date(Date.now()+3600000).toISOString()}]};}
test('store configuration remains off without explicit test gates, exact scope and both mapped products',()=>{
 assert.equal(config({...env,LYANN_STORE_TEST_PURCHASES_ENABLED:''},'apple').enabled,false);
 assert.equal(config({...env,LYANN_APPLE_NOTIFICATIONS_READY:''},'apple').enabled,false);
 assert.equal(config({...env,LYANN_APPLE_PRODUCTS:'{}'},'apple').enabled,false);
 assert.throws(()=>config({...env,VERCEL_ENV:'production'},'apple'));
 assert.throws(()=>config({...env,SUPABASE_URL:'https://other.supabase.co'},'apple'));
 assert.throws(()=>config(env,'stripe'));
});
test('Apple grants only verified sandbox owned subscriptions with a known product and current server status',()=>{
 const c=config(env,'apple');assert.equal(normalizeApple(c,apple(),renewal(),1,account).status,'active');
 for(const patch of [{environment:'Production'},{bundleId:'other'},{appAccountToken:user},{productId:'unknown'},{inAppOwnershipType:'FAMILY_SHARED'},{isUpgraded:true}])
  assert.throws(()=>normalizeApple(c,{...apple(),...patch},renewal(),1,account));
 assert.equal(normalizeApple(c,apple(),renewal(),5,account).status,'revoked');
 assert.equal(normalizeApple(c,apple(),{...renewal(),autoRenewStatus:0},1,account).status,'cancel_at_period_end');
 assert.equal(normalizeApple(c,apple(),renewal(),2,account).status,'expired');
 assert.throws(()=>normalizeApple(c,apple(),{...renewal(),originalTransactionId:'other'},1,account));
 assert.equal(normalizeApple(c,apple(),{...renewal(),gracePeriodExpiresDate:Date.now()+2000},4,account).status,'active');
});
test('Google requires license-test purchase, account binding, exact base plan and an active state',()=>{
 const c=config(env,'google');assert.equal(normalizeGoogle(c,google(),'token',account).needsAcknowledgement,true);
 for(const patch of [{testPurchase:undefined},{externalAccountIdentifiers:{obfuscatedExternalAccountId:user}},{subscriptionState:'SUBSCRIPTION_STATE_PENDING'}])
  assert.throws(()=>normalizeGoogle(c,{...google(),...patch},'token',account));
 const g=google();g.lineItems[0].offerDetails.basePlanId='annual';assert.throws(()=>normalizeGoogle(c,g,'token',account));
 assert.equal(normalizeGoogle(c,{...google(),subscriptionState:'SUBSCRIPTION_STATE_ON_HOLD'},'token',account).status,'expired');
 assert.equal(key('apple','token').length,64);assert.notEqual(key('apple','token'),key('google','token'));
});
async function apiFixture(fn,overrides={}){
 const state={applied:[],ack:0,failVerify:false,failPersist:false,membership:null};
 const verified=()=>normalizeGoogle(config(env,'google'),google(),'proof',account);
 const db={auth:{async getUser(token){return token==='valid'?{data:{user:{id:user}}}:{error:true};}},
 from(table){const q={select(){return q;},eq(){return q;},async maybeSingle(){return {data:table==='lyann_store_accounts'?{user_id:user,account_token:account}:state.membership};}};return q;},
 async rpc(name,args){
  if(name==='lyann_store_account')return {data:account};
  if(name==='lyann_apply_store_subscription'){if(state.failPersist)return {error:true};state.applied.push(args);return {data:{applied:true}};}
  return {data:{plan:'PLUS'}};
 }};
 const verifier={async google(){if(state.failVerify)throw Error('signature invalid');return verified();},async acknowledgeGoogle(){state.ack++;},
 async googleNotification(){return {account,proof:'proof'};},async appleNotification(){return {test:true};}};
 const app=express();app.use(express.json());registerStoreRoutes(app,{supabaseAdmin:db,env:{...env,...overrides},verifier});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=(path,body,token='valid')=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{await fn(state,call);}finally{await new Promise(r=>server.close(r));}
}
test('verification authenticates the session, ignores client plan/user and acknowledges only persisted rights',()=>apiFixture(async(s,call)=>{
 assert.equal((await call('/v1/store/verify',{provider:'google',proof:'proof'},'bad')).status,401);
 let r=await call('/v1/store/verify',{provider:'google',proof:'proof',user_id:account,plan:'PRO',expiresAt:'2099-01-01'});
 assert.equal(r.status,200);assert.equal(s.applied[0].p_user,user);assert.equal(s.applied[0].p_plan,'PLUS');assert.equal(s.ack,1);
 s.failVerify=true;r=await call('/v1/store/verify',{provider:'google',proof:'forged'});assert.equal(r.status,503);assert.equal(s.applied.length,1);assert.equal(s.ack,1);
 s.failVerify=false;s.failPersist=true;r=await call('/v1/store/verify',{provider:'google',proof:'proof'});assert.equal(r.status,503);assert.equal(s.ack,1);
}));
test('disabled purchase API cannot grant rights; config omits products and account token',()=>apiFixture(async(s,call)=>{
 const r=await call('/v1/store/config?provider=google'),c=await r.json();assert.equal(c.purchasesEnabled,false);assert.equal(c.accountToken,null);assert.deepEqual(c.products,{});
 assert.equal((await call('/v1/store/verify',{provider:'google',proof:'proof'})).status,503);assert.equal(s.applied.length,0);
},{LYANN_STORE_TEST_PURCHASES_ENABLED:''}));
test('an active subscription blocks another purchase while restoration remains available',()=>apiFixture(async(s,call)=>{
 s.membership={source:'apple',status:'active',expires_at:'2099-01-01'};
 const c=await(await call('/v1/store/config?provider=google')).json();assert.equal(c.purchasesEnabled,false);assert.equal(c.restoreEnabled,true);
}));
function nativeFixture(){
 const state={finishes:0,purchases:0,fail:false,ackFlag:null,configs:[]};
 const p={identifier:'test.plus',priceString:'7,90 €',subscriptionPeriod:{numberOfUnits:1,unitString:'month'},introductoryPrice:null};
 const cfg={provider:'apple',purchasesEnabled:true,restoreEnabled:true,accountToken:account,products};
 const plugin={async configure(o){state.configs.push(o);},async getProducts(){return {products:[p,{...p,identifier:'test.pro'}]};},
 async purchaseProduct(o){state.purchases++;state.ackFlag=o.autoAcknowledgePurchases;return {transactionId:'1',jwsRepresentation:'signed',productIdentifier:'test.plus',appAccountToken:account};},
 async finishTransaction(){state.finishes++;},async restorePurchases(){},async getPurchases(){return {purchases:[{transactionId:'1',jwsRepresentation:'signed',productIdentifier:'test.plus',appAccountToken:account}]};},
 async getUnfinishedTransactions(){return {transactions:[]};}};
 const controller=createController({plugin,provider:'apple',request:async(path)=>{if(path.includes('/config'))return cfg;if(state.fail)throw Error('backend unavailable');return {verified:true,rights:{plan:'PLUS'}};}});
 return {state,plugin,p,cfg,controller};
}
test('native purchase uses account token and finishes only after server confirmation',async()=>{
 const f=nativeFixture(),{items}=await f.controller.catalog();
 f.state.fail=true;await assert.rejects(f.controller.purchase(items[0]));assert.equal(f.state.finishes,0);assert.equal(f.state.ackFlag,false);
 f.state.fail=false;await f.controller.restore();assert.equal(f.state.finishes,1);assert.ok(f.state.configs.every(c=>c.autoFinishTransactions===false));
});
test('native catalog selects Android base-plan identifiers correctly and rejects annual or introductory offers',()=>{
 const c={provider:'google',products};const p={identifier:'monthly',planIdentifier:'test.plus',priceString:'7,90 €',subscriptionPeriod:{numberOfUnits:1,unitString:'month'},introductoryPrice:null};
 assert.equal(selectProducts(c,[p,{...p,planIdentifier:'test.pro'}])[0].rule.productId,'test.plus');
 assert.throws(()=>selectProducts(c,[{...p,offerId:'trial'},{...p,planIdentifier:'test.pro'}]));
 assert.throws(()=>selectProducts(c,[{...p,subscriptionPeriod:{numberOfUnits:1,unitString:'year'}},{...p,planIdentifier:'test.pro'}]));
});
test('double taps cannot open concurrent purchase flows',async()=>{
 const f=nativeFixture(),{items}=await f.controller.catalog();let release;f.plugin.purchaseProduct=()=>new Promise(r=>release=r);
 const first=f.controller.purchase(items[0]);await new Promise(r=>setImmediate(r));await assert.rejects(f.controller.purchase(items[0]),/déjà/);
 release({transactionId:'1',jwsRepresentation:'signed'});await first;assert.equal(f.state.finishes,1);
});

test('official Apple verifier rejects forged JWS without trusting client claims',async()=>{
 const {createVerifier}=require('../api/store-verification');
 const {X509Certificate}=require('node:crypto'),fs=require('node:fs');
 const cert=new X509Certificate(fs.readFileSync(require.resolve('./fixtures/store/apple-root-g3.pem')));
 assert.equal(cert.fingerprint256,'63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79');
 const verifier=createVerifier({...env,LYANN_APPLE_ROOT_CERTIFICATES:JSON.stringify([cert.raw.toString('base64')])});
 await assert.rejects(verifier.apple('not-a-signed-transaction',account));
 const fake=Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify(apple())).toString('base64url')+'.fake';
 await assert.rejects(verifier.apple(fake,account));
});
test('Google push claims require exact verified service identity after OIDC signature verification',()=>{
 const {validateGooglePushClaims}=require('../api/store-verification'),email='push@example.invalid';
 assert.doesNotThrow(()=>validateGooglePushClaims({iss:'https://accounts.google.com',email,email_verified:true},email));
 for(const p of [{iss:'evil',email,email_verified:true},{iss:'accounts.google.com',email:'other',email_verified:true},{iss:'accounts.google.com',email,email_verified:false}])assert.throws(()=>validateGooglePushClaims(p,email));
});

test('unfinished purchase recovery avoids a new purchase and does not prompt store restoration',async()=>{
 const f=nativeFixture();let prompts=0;
 f.plugin.restorePurchases=async()=>{prompts++;};
 f.plugin.getUnfinishedTransactions=async()=>({transactions:[{transactionId:'pending',jwsRepresentation:'signed',productIdentifier:'test.plus',appAccountToken:account}]});
 const r=await f.controller.recover();assert.equal(r.restored,1);assert.equal(f.state.finishes,1);assert.equal(f.state.purchases,0);assert.equal(prompts,0);
});
