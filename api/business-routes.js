'use strict';
const crypto = require('crypto');
const { PLANS, effectivePlan, verifiedBadge } = require('../lyann-plans');
const BUCKET = 'lyann-pro-private';
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['registration','representation','insurance','decennial','qualification'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
function checked(result) { if (result.error) fail(503,'Service temporairement indisponible.'); return result.data; }
function staging(url, env) { return url === 'https://tdktfbtqceldlaeqjtow.supabase.co' && env !== 'production'; }
function text(value, max, required = true) {
 if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(400,'Champ manquant ou trop long.');
 return value.trim();
}
function identityInput(body) {
 const identity = {
  legal_name:text(body.legal_name,160), business_name:text(body.business_name,160),
  siret:text(body.siret,14), address:text(body.address,300), representative:text(body.representative,160),
  activity:text(body.activity,40)
 };
 if (!/^\d{14}$/.test(identity.siret) || !['general','construction','regulated'].includes(identity.activity)) fail(400,'SIRET ou activité invalide.');
 return identity;
}
function requiredDocuments(identity) {
 return ['registration', ...(identity.activity === 'construction' ? ['insurance','decennial'] : []), ...(identity.activity === 'regulated' ? ['qualification','insurance'] : [])];
}
function validExpiry(value, now=Date.now()) {
 if (!value) return null;
 if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value || Date.parse(value+'T23:59:59Z')<=now) fail(400,'Date de validité invalide ou expirée.');
 return value;
}
function decodeDocument(body) {
 if (!TYPES.includes(body.kind) || typeof body.base64 !== 'string' || body.base64.length > Math.ceil(MAX_BYTES/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)) fail(400,'Document invalide (PDF, JPEG ou PNG, 2 Mo maximum).');
 const bytes=Buffer.from(body.base64,'base64');
 if (!bytes.length || bytes.length>MAX_BYTES) fail(400,'Document trop volumineux.');
 let mime;
 if(bytes.subarray(0,5).toString()==='%PDF-') mime='application/pdf';
 else if(bytes.subarray(0,3).equals(Buffer.from([255,216,255]))) mime='image/jpeg';
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) mime='image/png';
 else fail(400,'Le contenu du fichier doit être un PDF, JPEG ou PNG.');
 const expires_at=validExpiry(body.expires_at);
 if(['insurance','decennial'].includes(body.kind)&&!expires_at) fail(400,'Indiquez la date de fin de validité de cette assurance.');
 return {bytes,mime,expires_at,kind:body.kind,name:text(body.name,180).replace(/[\r\n]/g,' ')};
}
function assertComplete(dossier) {
 identityInput(dossier.identity);
 for(const kind of requiredDocuments(dossier.identity)) {
  if(!dossier.documents.some(d=>d.kind===kind)) fail(400,'Justificatif manquant : '+kind);
 }
 dossier.documents.forEach(d=>{if(d.expires_at)validExpiry(d.expires_at);});
}
function registerBusinessRoutes(app,{supabaseAdmin:db,verifyAdminPermission,env=process.env}) {
 const wrap = (handler) => async(req,res) => {
  res.set('Cache-Control','private, no-store');
  if(!staging(env.SUPABASE_URL,env.VERCEL_ENV)) return res.status(403).json({error:'Ce parcours est disponible uniquement sur Staging.'});
  try { await handler(req,res); } catch(e) { res.status(e.status||500).json({error:e.status?e.message:'Impossible de terminer cette opération.'}); }
 };
 async function user(req) {
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
  if(!String(req.headers.authorization||'').startsWith('Bearer ')) fail(401,'Connectez-vous pour continuer.');
  const result=await db.auth.getUser(token);
  if(result.error||!result.data?.user) fail(401,'Session expirée. Reconnectez-vous.');
  return result.data.user;
 }
 async function admin(req,permission) {
  const auth=await verifyAdminPermission(req,permission);
  if(!auth.authorized) fail(auth.status||403,'Accès administratif refusé.');
  return auth.userId;
 }
 async function plan(id) {
  const membership=checked(await db.from('lyann_plan_memberships').select('*').eq('user_id',id).maybeSingle());
  return effectivePlan(membership);
 }
 async function requirePro(id) { if((await plan(id)).code!=='PRO') fail(403,'Ce parcours est réservé à la formule Pro active.'); }
 async function dossier(id) { return checked(await db.from('lyann_pro_dossiers').select('*').eq('user_id',id).maybeSingle()); }
 async function save(current,patch) {
  const data=checked(await db.from('lyann_pro_dossiers').update({...patch,version:current.version+1,updated_at:new Date().toISOString()}).eq('user_id',current.user_id).eq('version',current.version).select('*').maybeSingle());
  if(!data) fail(409,'Le dossier a changé. Rechargez-le avant de continuer.');
  return data;
 }
 function safeDossier(d) {
  if(!d)return null;
  return {...d,documents:d.documents.map(({path,...doc})=>doc)};
 }
 app.get('/v1/business/me',wrap(async(req,res)=>{
  const u=await user(req);const p=await plan(u.id);const d=await dossier(u.id);
  res.json({plan:p,dossier:safeDossier(d),verified:verifiedBadge(p,d),purchasesEnabled:false});
 }));

 app.get('/v1/business/rights',wrap(async(req,res)=>{
  const u=await user(req);
  res.json(checked(await db.rpc('lyann_get_entitlements',{p_user:u.id})));
 }));
 app.post('/v1/admin/business/quota-test',wrap(async(req,res)=>{
  const actor=await admin(req,'settings.manage'),b=req.body||{};
  if(!UUID.test(b.user_id)||typeof b.enabled!=='boolean')fail(400,'Compte ou mode de test invalide.');
  const rights=checked(await db.rpc('lyann_set_entitlement_test',{p_user:b.user_id,p_enabled:b.enabled,p_actor:actor}));
  res.json({rights,message:b.enabled?'Limites activées pour ce compte de test pendant 24 heures. Aucun achat activé.':'Limites de test retirées pour ce compte.'});
 }));
 app.post('/v1/business/dossier',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);
  const identity=identityInput(req.body||{});const current=await dossier(u.id);
  if(current && ['submitted','approved','suspended'].includes(current.status)) fail(409,'Le dossier est verrouillé. Demandez sa réouverture à LYANN.');
  let next;
  if(!current) next=checked(await db.from('lyann_pro_dossiers').insert({user_id:u.id,identity}).select('*').single());
  else {
   if(req.body.version!==current.version) fail(409,'Rechargez votre dossier avant de modifier les informations.');
   next=await save(current,{identity,status:'draft',message:'',reviewed_at:null,reviewer_id:null});
  }
  res.json({dossier:safeDossier(next)});
 }));
 app.post('/v1/business/documents',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);
  const current=await dossier(u.id);
  if(!current||!['draft','needs_info','rejected'].includes(current.status)) fail(409,'Enregistrez ou rouvrez votre dossier avant de joindre une pièce.');
  if(req.body.version!==current.version) fail(409,'Rechargez votre dossier.');
  if(current.documents.length>=10) fail(400,'Dix documents maximum. Contactez LYANN pour un remplacement.');
  const file=decodeDocument(req.body);const id=crypto.randomUUID();const path=u.id+'/'+id;
  checked(await db.storage.from(BUCKET).upload(path,file.bytes,{contentType:file.mime,upsert:false}));
  const doc={id,path,kind:file.kind,name:file.name,mime:file.mime,size:file.bytes.length,expires_at:file.expires_at,decision:'pending',created_at:new Date().toISOString()};
  // A conflict leaves a private orphan for an independently reviewed retention pass, never deletes blindly.
  const next=await save(current,{documents:[...current.documents.filter(d=>d.kind!==file.kind),doc],status:'draft',message:'',reviewed_at:null,reviewer_id:null});
  res.json({dossier:safeDossier(next)});
 }));
 app.post('/v1/business/dossier/submit',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);const d=await dossier(u.id);
  if(!d||!['draft','needs_info','rejected'].includes(d.status)||req.body.version!==d.version) fail(409,'Rechargez le dossier avant de l’envoyer.');
  assertComplete(d);
  const next=await save(d,{status:'submitted',submitted_at:new Date().toISOString(),message:'Votre dossier a été envoyé à LYANN.',reviewer_id:null,reviewed_at:null});
  res.json({dossier:safeDossier(next)});
 }));
 app.get('/v1/business/documents/:owner/:id',wrap(async(req,res)=>{
  const u=await user(req);
  if(!UUID.test(req.params.owner)||!UUID.test(req.params.id)) fail(404,'Document introuvable.');
  if(u.id!==req.params.owner) await admin(req,'compliance.read');
  const d=await dossier(req.params.owner);const doc=d?.documents.find(x=>x.id===req.params.id);
  if(!doc) fail(404,'Document introuvable.');
  const blob=checked(await db.storage.from(BUCKET).download(doc.path));
  if(!blob) fail(404,'Document indisponible.');
  res.set('Content-Type',doc.mime);
  res.set('Content-Disposition','attachment; filename="justificatif-'+doc.id+(doc.mime==='application/pdf'?'.pdf':doc.mime==='image/png'?'.png':'.jpg')+'"');
  res.set('X-Content-Type-Options','nosniff');
  res.send(Buffer.from(await blob.arrayBuffer()));
 }));
 app.post('/v1/admin/business/test-membership',wrap(async(req,res)=>{
  await admin(req,'settings.manage');
  const b=req.body||{};if(!UUID.test(b.user_id)||!['PLUS','PRO'].includes(b.plan)) fail(400,'Compte ou formule invalide.');
  const old=checked(await db.from('lyann_plan_memberships').select('*').eq('user_id',b.user_id).maybeSingle());
  if(old&&old.source!=='staging_test') fail(409,'Un abonnement de paiement ne peut pas être remplacé par un test.');
  checked(await db.from('lyann_plan_memberships').upsert({user_id:b.user_id,plan:b.plan,status:'active',source:'staging_test',expires_at:new Date(Date.now()+86400000).toISOString(),updated_at:new Date().toISOString()},{onConflict:'user_id'}));
  res.json({success:true,message:'Accès de test Staging accordé pour 24 heures. Aucun achat effectué.'});
 }));
 app.get('/v1/admin/business/dossiers',wrap(async(req,res)=>{
  await admin(req,'compliance.read');
  const page=Math.max(0,Math.min(10000,Number(req.query.page)||0));
  const rows=checked(await db.from('lyann_pro_dossiers').select('*').order('updated_at',{ascending:false}).range(page*25,page*25+24));
  res.json({rows:rows.map(safeDossier),page});
 }));
 app.post('/v1/admin/business/dossiers/:id/review',wrap(async(req,res)=>{
  const reviewer=await admin(req,'compliance.review');
  if(reviewer===req.params.id) fail(403,'Vous ne pouvez pas examiner votre propre dossier.');
  const d=await dossier(req.params.id);
  if(!d || req.body.version!==d.version) fail(409,'Le dossier a changé. Rechargez la liste.');
  const status=req.body.status;
  const transitions={submitted:['approved','needs_info','rejected'],approved:['suspended','needs_info'],suspended:['needs_info'],rejected:['needs_info']};
  if(!transitions[d.status]?.includes(status)) fail(409,'Transition de dossier non autorisée.');
  const message=text(req.body.message,2000);
  let documents=d.documents;
  if(status==='approved'){
   await requirePro(d.user_id);assertComplete(d);
   if(req.body.confirmChecked!==true) fail(400,'Confirmez le contrôle des justificatifs.');
   documents=d.documents.map(doc=>({...doc,decision:'approved'}));
  } else if(status==='needs_info') documents=d.documents.map(doc=>({...doc,decision:'pending'}));
  const next=await save(d,{status,message,documents,reviewed_at:new Date().toISOString(),reviewer_id:reviewer});
  res.json({dossier:safeDossier(next)});
 }));
 app.get('/v1/admin/business/dossiers/:id/history',wrap(async(req,res)=>{
  await admin(req,'compliance.read');
  const rows=checked(await db.from('lyann_pro_review_events').select('*').eq('dossier_user_id',req.params.id).order('created_at',{ascending:false}).limit(100));
  res.json({rows});
 }));

 async function listAll(query) {
  const result=[];
  for(let page=0;page<20;page++){
   const rows=checked(await query().range(page*500,page*500+499));
   result.push(...rows);if(rows.length<500)return result;
  }
  fail(413,'Trop de lignes pour cet export. Réduisez la période.');
 }
 async function approvedPhotos(owner,ids){
  if(!ids?.length)return [];
  const rows=checked(await db.from('user_portfolio_items').select('id,image_url').eq('user_id',owner).eq('is_public',true).in('id',ids));
  const {mediaFromStoredUrl}=require('./content-moderation');
  const urls=[];
  for(const row of rows){
   const obj=mediaFromStoredUrl(row.image_url);
   if(!obj||obj.bucket!=='portfolio-images-hold')continue;
   const release=checked(await db.from('public_media_releases').select('status').eq('bucket_id',obj.bucket).eq('object_name',obj.path).maybeSingle());
   if(release?.status==='approved')urls.push('/v1/media/'+obj.bucket+'/'+obj.path.split('/').map(encodeURIComponent).join('/'));
  }
  return urls;
 }
 function placeInput(b){
  const c={name:text(b.name,160),description:text(b.description,2000),address:text(b.address,300),
   hours:text(b.hours,1000),closures:text(b.closures||'',500,false),promotion:text(b.promotion||'',500,false),
   phone:text(b.phone||'',40,false),lat:Number(b.lat),lng:Number(b.lng),
   photo_ids:Array.isArray(b.photo_ids)?[...new Set(b.photo_ids)]:[]};
  if(b.lat==null||b.lng==null||b.lat===''||b.lng===''||!Number.isFinite(c.lat)||!Number.isFinite(c.lng)||Math.abs(c.lat)>90||Math.abs(c.lng)>180)fail(400,'Localisation invalide.');
  if(c.photo_ids.length>4||c.photo_ids.some(id=>!UUID.test(id)))fail(400,'Quatre photos de portfolio maximum.');
  c.promotion_until=c.promotion?validExpiry(b.promotion_until):null;
  if(c.promotion&&!c.promotion_until)fail(400,'Indiquez la fin de votre promotion.');
  return c;
 }
 app.get('/v1/business/place',wrap(async(req,res)=>{
  const u=await user(req);
  const place=checked(await db.from('lyann_business_places').select('*').eq('user_id',u.id).maybeSingle());
  const portfolio=checked(await db.from('user_portfolio_items').select('id,title').eq('user_id',u.id).eq('is_public',true).order('created_at',{ascending:false}).limit(50));
  res.json({place,portfolio});
 }));
 app.post('/v1/business/place',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);
  const d=await dossier(u.id);
  if(!verifiedBadge(PLANS.PRO,d))fail(403,'Faites valider votre dossier professionnel avant de proposer une vitrine.');
  const content=placeInput(req.body||{});
  if((await approvedPhotos(u.id,content.photo_ids)).length!==content.photo_ids.length)fail(400,'Chaque photo doit appartenir à votre portfolio et être approuvée.');
  const current=checked(await db.from('lyann_business_places').select('*').eq('user_id',u.id).maybeSingle());
  if(current?.status==='suspended')fail(403,'La vitrine est suspendue. Contactez LYANN.');
  if(current&&req.body.version!==current.version)fail(409,'Rechargez votre vitrine.');
  const patch={content,status:'pending',review_message:'',reviewed_at:null,reviewer_id:null,updated_at:new Date().toISOString()};
  const next=checked(current?await db.from('lyann_business_places').update({...patch,version:current.version+1}).eq('user_id',u.id).eq('version',current.version).select('*').maybeSingle():
   await db.from('lyann_business_places').insert({...patch,user_id:u.id}).select('*').single());
  if(!next)fail(409,'La vitrine a changé. Rechargez-la.');
  res.json({place:next});
 }));
 app.get('/v1/business/places',wrap(async(req,res)=>{
  const bounds=['south','north','west','east'].map(k=>Number(req.query[k]));
  if(bounds.some(x=>!Number.isFinite(x))||bounds[0]<-90||bounds[1]>90||bounds[2]<-180||bounds[3]>180||bounds[0]>=bounds[1]||bounds[2]>=bounds[3])fail(400,'Zone invalide.');
  const rows=checked(await db.from('lyann_business_places').select('user_id,content').eq('status','approved')
   .gte('lat',bounds[0]).lte('lat',bounds[1]).gte('lng',bounds[2]).lte('lng',bounds[3]).limit(100));
  const places=[];
  for(const row of rows){
   const p=await plan(row.user_id),d=await dossier(row.user_id);
   if(!verifiedBadge(p,d))continue;
   const c=row.content;
   const reviews=checked(await db.from('reviews').select('rating,mission_id,author_id').eq('target_id',row.user_id).not('mission_id','is',null).limit(1000));
   // Only reviews tied to an actual mission between the reviewer and this provider are considered below.
   let rating=null,review_count=0;
   if(reviews.length<1000&&reviews.length){
    const missionIds=[...new Set(reviews.map(r=>r.mission_id))];
    const missions=checked(await db.from('missions').select('id,requester_id').eq('helper_id',row.user_id).in('id',missionIds));
    const valid=new Map(missions.map(m=>[m.id,m.requester_id]));const rated=reviews.filter(r=>valid.get(r.mission_id)===r.author_id&&r.rating>=1&&r.rating<=5);
    review_count=rated.length;if(review_count)rating=rated.reduce((sum,r)=>sum+r.rating,0)/review_count;
   }
   places.push({user_id:row.user_id,name:c.name,description:c.description,address:c.address,hours:c.hours,closures:c.closures,phone:c.phone,lat:c.lat,lng:c.lng,
    promotion:c.promotion_until&&Date.parse(c.promotion_until+'T23:59:59Z')>Date.now()?c.promotion:'',
    photos:await approvedPhotos(row.user_id,c.photo_ids),rating,review_count});
  }
  res.json({places,truncated:rows.length===100});
 }));
 app.get('/v1/admin/business/places',wrap(async(req,res)=>{
  await admin(req,'compliance.read');
  const page=Math.max(0,Math.min(10000,Number(req.query.page)||0));
  const rows=checked(await db.from('lyann_business_places').select('*').order('updated_at',{ascending:false}).range(page*25,page*25+24));
  res.json({rows,page});
 }));
 app.post('/v1/admin/business/places/:id/review',wrap(async(req,res)=>{
  const reviewer=await admin(req,'compliance.review');
  if(reviewer===req.params.id)fail(403,'Vous ne pouvez pas valider votre propre vitrine.');
  const current=checked(await db.from('lyann_business_places').select('*').eq('user_id',req.params.id).maybeSingle());
  if(!current||req.body.version!==current.version)fail(409,'Rechargez la vitrine.');
  const status=req.body.status;if(!['approved','rejected','suspended'].includes(status))fail(400,'Décision invalide.');
  if(status==='approved'&&!verifiedBadge(await plan(current.user_id),await dossier(current.user_id)))fail(403,'Le compte doit être Pro et son dossier vérifié.');
  const next=checked(await db.from('lyann_business_places').update({status,review_message:text(req.body.message,2000),reviewer_id:reviewer,reviewed_at:new Date().toISOString(),version:current.version+1}).eq('user_id',current.user_id).eq('version',current.version).select('*').maybeSingle());
  if(!next)fail(409,'La vitrine a changé.');
  res.json({place:next});
 }));
 app.get('/v1/business/activity',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);
  const month=String(req.query.month||new Date().toISOString().slice(0,7));
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Mois invalide.');
  const start=new Date(month+'-01T00:00:00Z'),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const missions=await listAll(()=>db.from('missions').select('id,title,status,total_amount,created_at').eq('helper_id',u.id).gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).order('created_at').order('id'));
  const payments=await listAll(()=>db.from('payments').select('id,mission_id,payment_status,transfer_status,service_amount_cents,provider_net_cents,created_at,service_refunded_cents').eq('provider_id',u.id).gte('created_at',start.toISOString()).lt('created_at',end.toISOString()).order('created_at').order('id'));
  if(req.query.format==='csv'){
   const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';
   const rows=[['type','id','mission','titre','statut','montant_service_centimes','net_prestataire_centimes','remboursement_service_centimes','date'],
    ...missions.map(m=>['mission',m.id,m.id,m.title,m.status,Math.round(Number(m.total_amount||0)*100),'','',m.created_at]),
    ...payments.map(p=>['paiement',p.id,p.mission_id,'',p.payment_status,p.service_amount_cents,p.provider_net_cents,p.service_refunded_cents,p.created_at])];
   res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="activite-'+month+'.csv"');
   return res.send('\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n'));
  }
  res.json({month,missions,payments});
 }));
 app.get('/v1/business/invoices',wrap(async(req,res)=>{
  const u=await user(req);
  const rows=checked(await db.from('lyann_business_invoices').select('id,number,kind,total_cents,created_at,mission_id,customer_id,user_id').or('user_id.eq.'+u.id+',customer_id.eq.'+u.id).order('created_at',{ascending:false}).limit(100));
  res.json({rows});
 }));
 app.post('/v1/business/invoices',wrap(async(req,res)=>{
  const u=await user(req);await requirePro(u.id);const d=await dossier(u.id);
  if(!verifiedBadge(PLANS.PRO,d))fail(403,'Votre dossier professionnel doit être vérifié.');
  const b=req.body||{};
  if(!UUID.test(b.mission_id)||!UUID.test(b.idempotency_key)||!['invoice','deposit','credit'].includes(b.kind))fail(400,'Facture invalide.');
  const mission=checked(await db.from('missions').select('id,title,helper_id,requester_id,total_amount,status').eq('id',b.mission_id).eq('helper_id',u.id).maybeSingle());
  if(!mission)fail(404,'Mission introuvable.');
  let snapshot,amount,original=null;
  if(b.kind==='credit'){
   if(!UUID.test(b.original_id))fail(400,'Facture d’origine requise.');
   const old=checked(await db.from('lyann_business_invoices').select('*').eq('id',b.original_id).eq('user_id',u.id).eq('mission_id',mission.id).maybeSingle());
   if(!old||old.kind==='credit')fail(400,'Facture d’origine invalide.');
   original=old.id;amount=old.total_cents;snapshot={...old.snapshot,original_number:old.number};
  }else{
   try{snapshot=require('./business-invoices').invoiceSnapshot(b,d.identity,mission);}catch(e){fail(400,e.message);}
   amount=snapshot.total_cents;
  }
  const result=await db.rpc('lyann_issue_test_invoice',{p_user:u.id,p_mission:mission.id,p_kind:b.kind,p_amount:amount,p_snapshot:snapshot,p_original:original,p_key:b.idempotency_key});
  if(result.error)fail(409,'Facture non créée. Vérifiez le solde de la mission ou rechargez vos documents avant de réessayer.');
  res.status(201).json({invoice:result.data});
 }));
 app.get('/v1/business/invoices/:id/pdf',wrap(async(req,res)=>{
  const u=await user(req);
  if(!UUID.test(req.params.id))fail(404,'Document introuvable.');
  const row=checked(await db.from('lyann_business_invoices').select('*').eq('id',req.params.id).or('user_id.eq.'+u.id+',customer_id.eq.'+u.id).maybeSingle());
  if(!row)fail(404,'Document introuvable.');
  const bytes=await require('./business-invoices').renderInvoicePdf(row);
  res.set('Content-Type','application/pdf');res.set('Content-Disposition','attachment; filename="'+row.number+'.pdf"');res.set('X-Content-Type-Options','nosniff');res.send(bytes);
 }));
 app.post('/v1/business/contact',wrap(async(req,res)=>{
  const u=await user(req);const b=req.body||{};
  if(!['enterprise','partnership'].includes(b.kind)) fail(400,'Type de demande invalide.');
  const recent=checked(await db.from('lyann_business_contacts').select('id').eq('user_id',u.id).gte('created_at',new Date(Date.now()-3600000).toISOString()).limit(3));
  if(recent.length>=3) fail(429,'Votre demande a déjà été reçue. Réessayez plus tard.');
  const email=text(b.email,254);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Adresse e-mail invalide.');
  const row={user_id:u.id,kind:b.kind,name:text(b.name,160),organization:text(b.organization,160),email,size:text(b.size||'',100,false),message:text(b.message,3000)};
  const data=checked(await db.from('lyann_business_contacts').insert(row).select('id').single());
  res.status(201).json({id:data.id,message:'Votre demande est enregistrée. L’équipe LYANN pourra vous recontacter.'});
 }));
 app.get('/v1/admin/business/contacts',wrap(async(req,res)=>{
  await admin(req,'partnerships.manage');
  const page=Math.max(0,Math.min(10000,Number(req.query.page)||0));
  const rows=checked(await db.from('lyann_business_contacts').select('*').order('created_at',{ascending:false}).range(page*25,page*25+24));
  res.json({rows,page});
 }));
 app.post('/v1/admin/business/contacts/:id',wrap(async(req,res)=>{
  await admin(req,'partnerships.manage');
  if(!['new','in_progress','closed'].includes(req.body.status)) fail(400,'Statut invalide.');
  const row=checked(await db.from('lyann_business_contacts').update({status:req.body.status,updated_at:new Date().toISOString()}).eq('id',req.params.id).select('id').maybeSingle());
  if(!row) fail(404,'Demande introuvable.');
  res.json({success:true});
 }));
}
module.exports={registerBusinessRoutes,staging,identityInput,decodeDocument,requiredDocuments,assertComplete,validExpiry};
