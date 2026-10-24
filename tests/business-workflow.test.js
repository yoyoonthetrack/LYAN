'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const {PLANS,effectivePlan,verifiedBadge}=require('../lyann-plans');
const {registerBusinessRoutes,staging,identityInput,decodeDocument,assertComplete}=require('../api/business-routes');
test('catalogue and entitlements never upgrade an expired or forged plan',()=>{
 assert.equal(PLANS.PLUS.monthlyCents,790);assert.equal(PLANS.PRO.monthlyCents,1990);assert.equal(PLANS.ENTERPRISE.available,false);
 for(const row of [null,{plan:'ULTIME',status:'active',expires_at:'2099-01-01'},{plan:'PRO',status:'active',expires_at:'bad'},{plan:'PRO',status:'active',expires_at:'2000-01-01'},{plan:'PRO',status:'revoked',expires_at:'2099-01-01'}]) assert.equal(effectivePlan(row).code,'FREE');
 assert.equal(effectivePlan({plan:'PRO',status:'cancel_at_period_end',expires_at:'2099-01-01'}).code,'PRO');
});
test('verified badge requires active Pro, approved documents and unexpired evidence',()=>{
 const d={status:'approved',identity:{activity:'general'},documents:[{kind:'registration',decision:'approved',expires_at:'2099-01-01'}]};
 assert.equal(verifiedBadge(PLANS.PRO,d),true);
 assert.equal(verifiedBadge(PLANS.PLUS,d),false);
 assert.equal(verifiedBadge(PLANS.PRO,{...d,documents:[]}),false);
 assert.equal(verifiedBadge(PLANS.PRO,{...d,documents:[{decision:'pending'}]}),false);
 assert.equal(verifiedBadge(PLANS.PRO,{...d,documents:[{decision:'approved',expires_at:'2000-01-01'}]}),false);
});
test('environment check rejects missing, spoofed and production configuration',()=>{
 for(const url of ['',undefined,'https://tdktfbtqceldlaeqjtow.supabase.co.evil.test','https://gzispjfoywklpqatjyop.supabase.co'])assert.equal(staging(url,'preview'),false);
 assert.equal(staging('https://tdktfbtqceldlaeqjtow.supabase.co','production'),false);
 assert.equal(staging('https://tdktfbtqceldlaeqjtow.supabase.co','preview'),true);
});
test('document validation checks bytes, size, kind and dates',()=>{
 const base={name:'preuve.pdf',kind:'registration',base64:Buffer.from('%PDF-1.7\nexample').toString('base64')};
 assert.equal(decodeDocument(base).mime,'application/pdf');
 assert.throws(()=>decodeDocument({...base,base64:Buffer.from('<svg onload=alert(1)>').toString('base64')}));
 assert.throws(()=>decodeDocument({...base,kind:'identity'}));
 assert.throws(()=>decodeDocument({...base,kind:'insurance'}));
 assert.throws(()=>decodeDocument({...base,expires_at:'2026-02-30'}));
 assert.throws(()=>decodeDocument({...base,base64:'a'.repeat(3000000)}));
});
test('required evidence depends on activity and cannot be replaced by an arbitrary file',()=>{
 const identity={legal_name:'Test',business_name:'Test',representative:'Test',siret:'12345678901234',address:'Test',activity:'construction'};
 assert.throws(()=>assertComplete({identity,documents:[{kind:'registration'}]}));
 assert.doesNotThrow(()=>assertComplete({identity,documents:[{kind:'registration'},{kind:'insurance',expires_at:'2099-01-01'},{kind:'decennial',expires_at:'2099-01-01'}]}));
 assert.throws(()=>identityInput({...identity,siret:'bad'}));
});
const owner='11111111-1111-4111-a111-111111111111',other='22222222-2222-4222-a222-222222222222';
function fixture(){
 const state={membership:null,dossier:null,downloads:0,updates:0,storageWrites:0,reviewer:other,permission:false,conflict:false};
 const db={async rpc(name,args){state.rpc={name,args};return {data:{plan:'FREE',enforced:true,limits:{missions:2,photos:5,categories:1},usage:{missions:0,photos:0,categories:0}}};},auth:{async getUser(token){return token==='valid'?{data:{user:{id:owner}}}:{error:true};}},
 from(table){
  let op='select',patch;
  const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},gte(){return q;},lt(){return q;},limit(){return q;},
   update(p){op='update';patch=p;return q;},insert(p){op='insert';patch=p;return q;},
   async maybeSingle(){return q.then(x=>x);},async single(){return q.then(x=>x);},
   then(resolve){let data=null;
    if(table==='lyann_plan_memberships')data=state.membership;
    if(table==='lyann_pro_dossiers'){
     data=state.dossier;
     if(op==='update'){state.updates++;data=state.conflict?null:{...state.dossier,...patch};if(data)state.dossier=data;}
     if(op==='insert'){data={...patch,version:1,documents:[],status:'draft'};state.dossier=data;}
    }
    if(table==='lyann_business_contacts')data=[];if(table==='missions')data=state.missions||[];if(table==='payments')data=[];
    return Promise.resolve({data,error:null}).then(resolve);
   }};return q;
 },storage:{from(){return {async download(){state.downloads++;return {data:new Blob(['%PDF-1.7'])};},async upload(){state.storageWrites++;return {data:{}};}};}}};
 return {state,db};
}
async function withApi(fn){
 const {state,db}=fixture(),app=express();app.use(express.json());
 registerBusinessRoutes(app,{supabaseAdmin:db,env:{SUPABASE_URL:'https://tdktfbtqceldlaeqjtow.supabase.co',VERCEL_ENV:'preview'},verifyAdminPermission:async()=>({authorized:state.permission,userId:state.reviewer,status:403})});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const call=(path,body,token='valid')=>fetch('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{await fn(state,call);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('API refuses anonymous users and unpaid document uploads',()=>withApi(async(state,call)=>{
 assert.equal((await call('/v1/business/me',null,'invalid')).status,401);
 assert.equal((await call('/v1/business/documents',{})).status,403);
 assert.equal(state.storageWrites,0);
}));
test('private document route denies another owner before storage access',()=>withApi(async(state,call)=>{
 const res=await call('/v1/business/documents/'+other+'/33333333-3333-4333-a333-333333333333');
 assert.equal(res.status,403);assert.equal(state.downloads,0);
}));
test('admin decision requires permission and cannot be self-approved',()=>withApi(async(state,call)=>{
 let res=await call('/v1/admin/business/dossiers/'+owner+'/review',{status:'approved',version:1});
 assert.equal(res.status,403);
 state.permission=true;state.reviewer=owner;
 res=await call('/v1/admin/business/dossiers/'+owner+'/review',{status:'approved',version:1});
 assert.equal(res.status,403);assert.equal(state.updates,0);
}));
test('dossier edit cannot alter status or reviewer and uses optimistic concurrency',()=>withApi(async(state,call)=>{
 state.membership={plan:'PRO',status:'active',expires_at:'2099-01-01'};
 state.dossier={user_id:owner,version:1,status:'draft',documents:[]};
 const body={legal_name:'Test',business_name:'Test',representative:'Test',siret:'12345678901234',address:'Test',activity:'general',version:1,status:'approved',reviewer_id:owner};
 let res=await call('/v1/business/dossier',body);
 assert.equal(res.status,200);assert.equal((await res.json()).dossier.status,'draft');assert.equal(state.dossier.reviewer_id,null);
 res=await call('/v1/business/dossier',body);assert.equal(res.status,409);
 state.conflict=true;res=await call('/v1/business/dossier',{...body,version:2});assert.equal(res.status,409);
}));

test('review cannot approve expired Pro and only promotes the exact checked revision',()=>withApi(async(state,call)=>{
 state.permission=true;
 state.dossier={user_id:owner,version:3,status:'submitted',identity:{legal_name:'Test',business_name:'Test',representative:'Test',siret:'12345678901234',address:'Test',activity:'general'},documents:[{id:'doc',kind:'registration',decision:'pending',path:'private/path'}]};
 const body={version:3,status:'approved',message:'Documents contrôlés.',confirmChecked:true};
 let res=await call('/v1/admin/business/dossiers/'+owner+'/review',body);assert.equal(res.status,403);
 state.membership={plan:'PRO',status:'active',expires_at:'2099-01-01'};
 res=await call('/v1/admin/business/dossiers/'+owner+'/review',{...body,version:2});assert.equal(res.status,409);
 res=await call('/v1/admin/business/dossiers/'+owner+'/review',{...body,confirmChecked:false});assert.equal(res.status,400);
 res=await call('/v1/admin/business/dossiers/'+owner+'/review',body);assert.equal(res.status,200);
 const result=await res.json();assert.equal(result.dossier.status,'approved');assert.equal(result.dossier.documents[0].path,undefined);assert.equal(state.dossier.reviewer_id,other);
}));

const {invoiceSnapshot,renderInvoicePdf}=require('../api/business-invoices');
test('invoice calculations use cents and require a deliberate fiscal declaration',async()=>{
 const b={amount_cents:12000,vat_rate:20,due_date:'2099-01-01',service_date:'2026-10-23',legal_details:'Entreprise test',customer_name:'Client',customer_address:'Adresse',description:'Mission test',vat_number:'FRTEST',payment_terms:'Selon accord',confirmIssuer:true};
 const seller={legal_name:'Atelier',siret:'12345678901234',address:'Adresse'};
 const s=invoiceSnapshot(b,seller,{});
 assert.equal(s.net_cents,10000);assert.equal(s.vat_cents,2000);
 assert.throws(()=>invoiceSnapshot({...b,confirmIssuer:false},seller,{}));
 assert.throws(()=>invoiceSnapshot({...b,vat_rate:0,tax_notice:''},seller,{}));
 assert.throws(()=>invoiceSnapshot({...b,amount_cents:1.5},seller,{}));
 assert.throws(()=>invoiceSnapshot({...b,service_date:'2026-02-30'},seller,{}));
 const pdf=await renderInvoicePdf({snapshot:s,kind:'invoice',number:'TEST-2026-000001',created_at:'2026-10-23T00:00:00Z',mission_id:owner});
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.match(pdf.subarray(-20).toString(),/%%EOF/);
});
test('activity and invoice creation are denied without Pro while reading documents requires authentication',()=>withApi(async(state,call)=>{
 assert.equal((await call('/v1/business/activity')).status,403);
 assert.equal((await call('/v1/business/invoices',{})).status,403);
 assert.equal((await call('/v1/business/invoices',null,'bad')).status,401);
 assert.equal((await call('/v1/business/places?south=bad')).status,400);
}));

test('Pro uploads, submits and retains private download access after expiry',()=>withApi(async(state,call)=>{
 state.membership={plan:'PRO',status:'active',expires_at:'2099-01-01'};
 state.dossier={user_id:owner,version:1,status:'draft',identity:{legal_name:'Test',business_name:'Test',representative:'Test',siret:'12345678901234',address:'Test',activity:'general'},documents:[]};
 let res=await call('/v1/business/documents',{name:'preuve.pdf',kind:'registration',base64:Buffer.from('%PDF-1.7 fixture').toString('base64'),version:1});
 assert.equal(res.status,200);assert.equal(state.storageWrites,1);
 const data=await res.json();assert.equal(data.dossier.documents[0].path,undefined);
 res=await call('/v1/business/dossier/submit',{version:2});assert.equal(res.status,200);assert.equal(state.dossier.status,'submitted');
 res=await call('/v1/business/documents',{version:3});assert.equal(res.status,409);assert.equal(state.storageWrites,1);
 state.membership=null;
 res=await call('/v1/business/documents/'+owner+'/'+data.dossier.documents[0].id);assert.equal(res.status,200);assert.equal(state.downloads,1);
}));
test('activity CSV protects spreadsheet formula cells and preserves cent amounts',()=>withApi(async(state,call)=>{
 state.membership={plan:'PRO',status:'active',expires_at:'2099-01-01'};
 state.missions=[{id:owner,title:'=HYPERLINK("bad")',status:'AGREED',total_amount:12.34,created_at:'2026-10-10'}];
 const res=await call('/v1/business/activity?month=2026-10&format=csv');assert.equal(res.status,200);
 const csv=await res.text();assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('1234'));
}));

test('rights endpoint scopes usage to the authenticated account and denies anonymous reads',()=>withApi(async(state,call)=>{
 let res=await call('/v1/business/rights?user_id='+other);assert.equal(res.status,200);
 assert.equal(state.rpc.name,'lyann_get_entitlements');assert.equal(state.rpc.args.p_user,owner);
 state.rpc=null;res=await call('/v1/business/rights',null,'bad');assert.equal(res.status,401);assert.equal(state.rpc,null);
}));
test('quota trial requires admin permission, a boolean, and records the server actor',()=>withApi(async(state,call)=>{
 let res=await call('/v1/admin/business/quota-test',{user_id:owner,enabled:true,actor_id:owner});assert.equal(res.status,403);assert.equal(state.rpc,undefined);
 state.permission=true;res=await call('/v1/admin/business/quota-test',{user_id:owner,enabled:'true'});assert.equal(res.status,400);
 res=await call('/v1/admin/business/quota-test',{user_id:owner,enabled:true,actor_id:owner});assert.equal(res.status,200);
 assert.deepEqual(state.rpc,{name:'lyann_set_entitlement_test',args:{p_user:owner,p_enabled:true,p_actor:other}});
}));
