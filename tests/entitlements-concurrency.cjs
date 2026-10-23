'use strict';
// Uses only a disposable local PostgreSQL database. No Supabase credentials or remote hosts accepted.
const {execFileSync,spawn}=require('node:child_process');
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),path=require('node:path');
const port=process.env.LYANN_TEST_PG_PORT||'55432';
if(!/^\d{4,5}$/.test(port))throw Error('Invalid local test port');
const base=['-h','127.0.0.1','-p',port,'-U','rights_test'];
const database='lyann_entitlements_test_'+randomUUID().replaceAll('-','');
const args=[...base,'-d',database,'-X','-v','ON_ERROR_STOP=1','-At'];
function sql(query){return execFileSync('psql',[...args,'-c',query],{encoding:'utf8'}).trim();}
function file(name){execFileSync('psql',[...args,'-f',path.join(__dirname,'..',name)],{stdio:'pipe'});}
function concurrent(query){return new Promise(resolve=>{
 const p=spawn('psql',[...args,'-c','BEGIN; '+query+'; SELECT pg_sleep(0.4); COMMIT;']);
 let error='';p.stderr.on('data',x=>error+=x);p.on('close',code=>resolve({code,error}));p.on('error',e=>resolve({code:-1,error:e.message}));
});}
function checkRace(results,code){
 assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
 assert.ok(results.find(r=>r.code!==0).error.includes(code),JSON.stringify(results));
}
(async()=>{
 execFileSync('createdb',[...base,database]);
 try{
  file('tests/fixtures/entitlements-schema.sql');
  for(const migration of ['82_lyann_entitlement_guards_staging.sql','83_lyann_atomic_profile_skills_staging.sql','84_lyann_self_entitlements_staging.sql','85_lyann_public_badges_staging.sql','86_lyann_store_subscriptions_staging.sql'])file(migration);
  file('tests/entitlements-staging.sql');
  file('tests/plan-badges-staging.sql');
  file('tests/store-subscriptions-staging.sql');
  console.log('PASS store account binding, out-of-order verification and test-only environments');
  console.log('PASS public badges, expiry, evidence and anonymous RPC');
  const u=randomUUID(),c=randomUUID();
  sql("INSERT INTO auth.users(id,email) VALUES('"+u+"','local-provider@example.invalid'),('"+c+"','local-client@example.invalid'); SELECT lyann_set_entitlement_test('"+u+"',true,'"+c+"');");
  sql("INSERT INTO missions(helper_id,requester_id,status) VALUES('"+u+"','"+c+"','AGREED')");
  checkRace(await Promise.all([1,2].map(()=>concurrent("INSERT INTO missions(helper_id,requester_id,status) VALUES('"+u+"','"+c+"','AGREED')"))),'MISSION_QUOTA_REACHED');
  assert.equal(sql("SELECT count(*) FROM missions WHERE helper_id='"+u+"'"),'2');
  console.log('PASS concurrent mission acceptance: one winner, one quota rejection, two missions total');
  sql("INSERT INTO user_portfolio_items(user_id,image_url) SELECT '"+u+"','local-image-'||g FROM generate_series(1,4) g");
  checkRace(await Promise.all([1,2].map(i=>concurrent("INSERT INTO user_portfolio_items(user_id,image_url) VALUES('"+u+"','local-race-"+i+"')"))),'PORTFOLIO_QUOTA_REACHED');
  assert.equal(sql("SELECT count(*) FROM user_portfolio_items WHERE user_id='"+u+"'"),'5');
  console.log('PASS concurrent portfolio insertion: photo allowance cannot be exceeded');
  checkRace(await Promise.all([1,2].map(i=>concurrent("INSERT INTO services(owner_id,title,category,slug) VALUES('"+u+"','Category "+i+"','Category "+i+"','local-category-"+i+"')"))),'CATEGORY_QUOTA_REACHED');
  assert.equal(sql("SELECT count(*) FROM services WHERE owner_id='"+u+"'"),'1');
  console.log('PASS concurrent category insertion: one category remains');
  const storeA=sql("SELECT lyann_store_account('"+u+"')"),storeB=sql("SELECT lyann_store_account('"+c+"')");
  checkRace(await Promise.all([[u,storeA],[c,storeB]].map(([id,account])=>concurrent("SELECT lyann_apply_store_subscription('"+id+"','"+account+"','google',repeat('c',64),'test.plus','PLUS','active',now()+interval '1 hour',now(),'Test')"))),'STORE_PURCHASE_ALREADY_BOUND');
  assert.equal(sql("SELECT count(*) FROM lyann_store_subscriptions WHERE purchase_key=repeat('c',64)"),'1');
  console.log('PASS concurrent purchase claims: a store purchase belongs to one LYANN account');

 }finally{execFileSync('dropdb',[...base,database]);}
})().catch(e=>{console.error(e);process.exitCode=1;});
