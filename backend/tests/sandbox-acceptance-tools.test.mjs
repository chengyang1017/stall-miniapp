import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectSandboxEnvironment,nativeTestConfiguration} from '../testing/sandbox-acceptance/guards.mjs'
const env={APP_ENV:'sandbox',PAYMENT_DB_ENV:'isolated-test',SBX_NATIVE_ACCEPTANCE:'I_CONFIRM_EMPTY_ISOLATED_TEST_DATABASE',SBX_TEST_DATABASE_URL:'postgresql://sbx_role:synthetic@localhost/sbx_test',SBX_EXPECT_HOST:'localhost',SBX_EXPECT_DATABASE:'sbx_test',SBX_EXPECT_ROLE:'sbx_role',SANDBOX_PAYMENT_INSTANCE_ID:'11111111-1111-4111-8111-111111111111'}
test('native acceptance refuses absent acknowledgement and production environment',()=>{
 for(const patch of [{SBX_NATIVE_ACCEPTANCE:''},{APP_ENV:'production'},{PAYMENT_DB_ENV:'production'}])assert.throws(()=>nativeTestConfiguration({...env,...patch}),/explicit_isolation/)
})
test('native acceptance requires separate URL and exact host database role allowlist',()=>{
 for(const patch of [{DATABASE_URL:env.SBX_TEST_DATABASE_URL},{SBX_EXPECT_HOST:'other'},{SBX_EXPECT_DATABASE:'other'},{SBX_EXPECT_ROLE:'other'},{SBX_EXPECT_HOST:''},{SANDBOX_PAYMENT_INSTANCE_ID:''},{SBX_TEST_DATABASE_URL:env.SBX_TEST_DATABASE_URL+'?sslmode=disable'}])assert.throws(()=>nativeTestConfiguration({...env,...patch}))
})
test('native external connection uses verified TLS and bounded connections',()=>{
 const c=nativeTestConfiguration({...env,SBX_TEST_DATABASE_URL:env.SBX_TEST_DATABASE_URL.replace('localhost','test.example'),SBX_EXPECT_HOST:'test.example'})
 assert.deepEqual(c.ssl,{rejectUnauthorized:true});assert.equal(c.max,8)
})
test('environment check reports only names and status, never values',()=>{
 const report=inspectSandboxEnvironment({DATABASE_URL:'postgresql://private:secret@test.example/test',STRIPE_TEST_SECRET_KEY:'sk_live_sensitive',STRIPE_TEST_WEBHOOK_SECRET:'whsec_sensitive'})
 const text=JSON.stringify(report)
 for(const secret of ['sk_live_sensitive','whsec_sensitive','private','postgresql://'])assert.equal(text.includes(secret),false)
 assert.equal(report.ready,false);assert.equal(report.networkUsed,false)
 assert.ok(report.checks.some(x=>x.name==='STRIPE_TEST_SECRET_KEY'&&x.status==='NEEDS_CONFIGURATION'))
})
test('missing configuration cannot claim runtime acceptance',()=>{
 const r=inspectSandboxEnvironment({});assert.equal(r.kind,'LOCAL_CONFIGURATION_ONLY');assert.equal(r.ready,false)
})
import {verifyTestSession,verifyTestWebhook} from '../testing/sandbox-acceptance/stripe-evidence.mjs'
import {createHmac} from 'node:crypto'
test('Stripe read-only tool refuses missing consent before network',async()=>{
 let called=false;await assert.rejects(verifyTestSession({},()=>{called=true}),/explicit_test/);assert.equal(called,false)
})
test('captured webhook verifies signature but does not claim ledger acceptance',()=>{
 const raw=JSON.stringify({id:'evt_synthetic',livemode:false}),ts=Math.floor(Date.now()/1000),secret='whsec_synthetic'
 const header='t='+ts+',v1='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')
 assert.equal(verifyTestWebhook(raw,header,secret).serverLedgerVerified,false)
 assert.throws(()=>verifyTestWebhook(raw+' ',header,secret),/signature_invalid/)
})
test('Stripe retrieval verifies expected paid channel without writing',async()=>{
 const e={...env,SBX_STRIPE_READONLY:'I_CONFIRM_STRIPE_TEST_ACCOUNT',STRIPE_TEST_SECRET_KEY:'sk_test_synthetic',SBX_ORDER_ID:'11111111-1111-4111-8111-111111111111',SBX_SESSION_ID:'cs_test_synthetic',SBX_AMOUNT_CENTS:'1000',SBX_CHANNEL:'card'}
 let calls=0
 const fetch=async(url,options)=>{calls++;assert.equal(options.method,undefined);assert.ok(url.startsWith('https://api.stripe.com/v1/checkout/sessions/'));return {ok:true,json:async()=>({id:e.SBX_SESSION_ID,object:'checkout.session',livemode:false,mode:'payment',client_reference_id:e.SBX_ORDER_ID,metadata:{orderId:e.SBX_ORDER_ID},currency:'cny',amount_total:1000,status:'complete',payment_status:'paid',payment_intent:{id:'pi_synthetic',livemode:false,status:'succeeded',amount:1000,currency:'cny',latest_charge:{created:1700000000,payment_method_details:{type:'card'}}}})}}
 assert.equal((await verifyTestSession(e,fetch)).paid,true);assert.equal(calls,1)
 await assert.rejects(verifyTestSession({...e,SBX_CHANNEL:'alipay'},fetch),/actual_channel/)
})
