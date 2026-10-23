'use strict';
const {config,createVerifier,error}=require('./store-verification');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function registerStoreRoutes(app,{supabaseAdmin:db,env=process.env,verifier}){
 let remote;const verify=()=>remote||(remote=verifier||createVerifier(env));
 function checked(r){if(r.error)error(503,'Synchronisation des droits indisponible.');return r.data;}
 const wrap=fn=>async(req,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
   if(env.SUPABASE_URL!=='https://tdktfbtqceldlaeqjtow.supabase.co'||env.VERCEL_ENV==='production')error(403,'Achats réservés à Staging.');
   await fn(req,res);
  }catch(e){res.status(e.expose?e.status:503).json({error:e.expose?e.message:'Vérification du magasin indisponible. Réessayez sans racheter.'});}
 };
 async function user(req){
  const h=String(req.headers.authorization||'');if(!h.startsWith('Bearer '))error(401,'Connectez-vous à LYANN.');
  const r=await db.auth.getUser(h.slice(7));if(r.error||!r.data?.user)error(401,'Session expirée.');
  return r.data.user.id;
 }
 async function account(id){return checked(await db.rpc('lyann_store_account',{p_user:id}));}
 function proof(value,provider){
  if(typeof value!=='string'||!value||value.length>(provider==='apple'?32000:4096))error(400,'Preuve d’achat invalide.');
  return value;
 }
 async function sync(id,token,provider,value){
  // Timestamp precedes remote verification so an older in-flight response cannot win.
  const started=new Date().toISOString(),v=await verify()[provider](value,token);
  if(v.provider!==provider||v.accountToken!==token.toLowerCase())error(403,'Compte de facturation invalide.');
  checked(await db.rpc('lyann_apply_store_subscription',{
   p_user:id,p_account:token,p_provider:provider,p_key:v.purchaseKey,p_product:v.productId,p_plan:v.plan,
   p_status:v.status,p_expires:v.expiresAt,p_checked:started,p_environment:v.environment
  }));
  if(provider==='google'&&v.needsAcknowledgement)await verify().acknowledgeGoogle(value,v.productId);
  return {verified:true,rights:checked(await db.rpc('lyann_get_entitlements',{p_user:id}))};
 }
 app.get('/v1/store/config',wrap(async(req,res)=>{
  const id=await user(req),c=config(env,req.query.provider);
  const membership=checked(await db.from('lyann_plan_memberships').select('source,status,expires_at').eq('user_id',id).maybeSingle());
  const otherBilling=membership?.source==='stripe';
  const activeStore=['apple','google'].includes(membership?.source)&&['active','cancel_at_period_end'].includes(membership?.status)&&Date.parse(membership.expires_at)>Date.now();
  res.json({provider:c.provider,environment:c.provider==='apple'?'Sandbox':'Test',
   purchasesEnabled:c.enabled&&!otherBilling&&!activeStore,restoreEnabled:c.enabled&&!otherBilling,
   accountToken:c.enabled&&!otherBilling?await account(id):null,
   products:c.enabled&&!otherBilling?c.products:{},
   message:activeStore?'Un abonnement est déjà actif. Gérez-le dans son magasin pour éviter un double achat.':otherBilling?'Votre abonnement existant nécessite un examen avant un changement de magasin.':c.enabled?'Achats de test uniquement.':'Les abonnements du magasin ne sont pas encore activés.'});
 }));
 app.post('/v1/store/verify',wrap(async(req,res)=>{
  const id=await user(req),provider=req.body?.provider,c=config(env,provider);
  if(!c.enabled)error(503,'Les achats de test ne sont pas encore activés.');
  res.json(await sync(id,await account(id),provider,proof(req.body?.proof,provider)));
 }));
 async function notification(provider,req,res){
  const c=config(env,provider);if(!c.ready)error(503,'Notifications non configurées.');
  const event=provider==='apple'
   ?await verify().appleNotification({signedPayload:proof(req.body?.signedPayload,'apple')})
   :await verify().googleNotification(req);
  if(event.test)return res.json({received:true});
  if(!UUID.test(event.account||''))error(400,'Compte de notification invalide.');
  const row=checked(await db.from('lyann_store_accounts').select('user_id,account_token').eq('account_token',event.account).maybeSingle());
  if(!row)return res.json({received:true,ignored:true});
  await sync(row.user_id,row.account_token,provider,proof(event.proof,provider));
  res.json({received:true});
 }
 app.post('/v1/store/notifications/apple',wrap((req,res)=>notification('apple',req,res)));
 app.post('/v1/store/notifications/google',wrap((req,res)=>notification('google',req,res)));
}
module.exports={registerStoreRoutes};
