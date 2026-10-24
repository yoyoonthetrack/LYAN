'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PLANS,verifiedBadge,badgeLabel}=require('../lyann-plans');
const owner='11111111-1111-4111-a111-111111111111';
function client(rpc,stage=true){
 const source=fs.readFileSync(require.resolve('../api-client.js'),'utf8');
 const method=source.slice(source.indexOf('    async decoratePlanBadges('),source.indexOf('    async getProfile('));
 const c=vm.runInNewContext('({'+method+'})',{window:{LYANN_SUPABASE_LOCK:stage?'tdktfbtqceldlaeqjtow':'other',LYANN_PLANS:{badgeLabel}},isUUID:v=>typeof v==='string'&&/^[0-9a-f-]{36}$/.test(v),Date,Map,Set});
 c.supabase={rpc};return c;
}
const valid=()=>new Date(Date.now()+30000).toISOString();
test('badge labels ignore legacy fields and distinguish paid plan from verification',()=>{
 assert.equal(badgeLabel({is_pro:true,is_verified:true,badge:'Pro'}),'');
 assert.equal(badgeLabel({lyann_badges:{plan:'PLUS',verified:true,valid_until:valid()}}),'Lyanneur Plus');
 assert.equal(badgeLabel({lyann_badges:{plan:'PRO',verified:false,valid_until:valid()}}),'Pro');
 assert.equal(badgeLabel({lyann_badges:{plan:'PRO',verified:true,valid_until:valid()}}),'Pro · Vérifié');
 for(const valid_until of ['bad','2000-01-01'])assert.equal(badgeLabel({lyann_badges:{plan:'PRO',verified:true,valid_until}}),'');
});
test('verification requires all activity documents and valid calendar dates',()=>{
 const d={status:'approved',identity:{activity:'construction'},documents:[{kind:'registration',decision:'approved'}]};
 assert.equal(verifiedBadge(PLANS.PRO,d),false);
 d.documents.push({kind:'insurance',decision:'approved',expires_at:'2099-01-01'},{kind:'decennial',decision:'approved',expires_at:'2099-01-01'});
 assert.equal(verifiedBadge(PLANS.PRO,d),true);
 d.documents[1].expires_at='2099-02-30';assert.equal(verifiedBadge(PLANS.PRO,d),false);
 d.documents[1].expires_at=null;assert.equal(verifiedBadge(PLANS.PRO,d),false);
 assert.equal(verifiedBadge(PLANS.PRO,{...d,status:'suspended'}),false);
});
test('client consumes only server badges, batches ids and clears stale values on failures',async()=>{
 let calls=0;
 const api=client(async(name,args)=>{calls++;assert.equal(name,'lyann_public_badges');assert.ok(args.p_users.length<=100);return {data:args.p_users.map(user_id=>({user_id,plan:'PLUS',verified:false,valid_until:valid()}))};});
 const rows=Array.from({length:201},(_,i)=>({id:'11111111-1111-4111-a111-'+String(i).padStart(12,'0'),is_verified:true,badge:'Forged'}));
 await api.decoratePlanBadges(rows);assert.equal(calls,3);assert.ok(rows.every(p=>p.badge==='Lyanneur Plus'&&!p.is_verified));
 api.supabase.rpc=async()=>{throw Error('offline');};
 await api.decoratePlanBadges(rows);assert.ok(rows.every(p=>p.badge===''&&p.lyann_badges===null&&!p.is_verified));
});
test('out of scope rows, expired server results and unpaid legacy hints cannot award badges',async()=>{
 const rows=[{id:owner,is_verified:true,kyc_verified:true,subscription_plan:'PRO'}];
 await client(async()=>({data:[{user_id:owner,plan:'PRO',verified:true,valid_until:'2000-01-01'}]})).decoratePlanBadges(rows);
 assert.equal(rows[0].is_verified,false);assert.equal(rows[0].subscription_plan,'FREE');
 await client(async()=>({data:[{user_id:owner,plan:'PLUS',verified:true,valid_until:valid()}]})).decoratePlanBadges(rows);
 assert.equal(rows[0].is_verified,false);
 const unchanged={...rows[0]};
 await client(async()=>{throw Error('must not call');},false).decoratePlanBadges(rows);
 assert.deepEqual(rows[0],unchanged);
});
