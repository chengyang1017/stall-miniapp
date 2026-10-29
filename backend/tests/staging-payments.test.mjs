import {environment as env,registry,profile} from './helpers/staging-profile.mjs'
// Real routes + existing phase7 transactional SQL model. NO PostgreSQL/HTTP service.
// Model locks are scheduling assumptions; PostgreSQL isolation remains unverified.
import test from 'node:test'
import assert from 'node:assert/strict'
import { stagingPaymentRoute,simulationConfigured,paymentAllowsFulfillment } from '../src/stagingPayments.mjs'
import { checkoutRoute } from '../src/checkout.mjs'
import { orderWorkflowRoute } from '../src/orderWorkflow.mjs'
import { sweepInventory } from '../src/inventory.mjs'
import { orderSummary } from '../src/merchantArchiveFormat.mjs'
import { salesAnalyticsRoute } from '../src/salesAnalytics.mjs'
import { merchantOrderCounts } from '../src/merchantOrderQuery.mjs'
import { fixture,payload,request,response,STORE_A,PRODUCT_A } from './helpers/business-phase7-db.mjs'
const subject='wx:wxunit:tester',key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
async function prepared(options){const db=fixture(options);db.testGrants.add(STORE_A+':'+subject);db.members.set(subject+':alpha',{...db.stores.get('alpha'),role:'owner'});const res=response();await checkoutRoute(request(db,subject,payload()),res,new URL('http://unit.invalid/v1/stores/alpha/orders'),db);assert.equal(res.code,201);return {db,id:res.body.orderId}}
async function confirm(db,id,{who=subject,slug='alpha',environment=env,data={requestKey:key},method='POST'}={}){const r=response();await stagingPaymentRoute(request(db,who,data,undefined,method),r,new URL(`http://unit.invalid/v1/stores/${slug}/orders/${id}/staging-payment`),db,environment,registry);return r}
async function status(db,id,next){const r=response();await orderWorkflowRoute(request(db,subject,{status:next,reason:'测试取消'}),r,new URL(`http://unit.invalid/v1/merchant/stores/alpha/orders/${id}/status`),db,{env,profiles:registry});return r}
async function withEnvironment(fn){const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);try{return await fn()}finally{for(const [k,v]of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v}}

for(const override of [{APP_ENV:'production'},{RENDER_SERVICE_ID:'srv-wrong'},{STAGING_DEPLOYMENT_ID:undefined},{STAGING_SIMULATED_PAYMENTS:''},{STAGING_PAYMENT_INSTANCE_ID:'bad'}])test('environment gate refuses before DB I/O: '+JSON.stringify(override),async()=>{
 const r=response(),db={query(){assert.fail('DB forbidden')},connect(){assert.fail('DB forbidden')}}
 await stagingPaymentRoute(request(fixture(),subject,{requestKey:key}),r,new URL('http://unit.invalid/v1/stores/alpha/orders/'+key+'/staging-payment'),db,{...env,...override},registry);assert.equal(r.code,404)
})
test('configured gate is exact and simulated fulfillment never works in production',()=>{assert.equal(simulationConfigured(env,registry),true);assert.equal(paymentAllowsFulfillment({payment_status:'paid',payment_source:'staging_simulated',simulation_instance_id:env.STAGING_PAYMENT_INSTANCE_ID},env,registry),true);assert.equal(paymentAllowsFulfillment({payment_status:'paid',payment_source:'staging_simulated',simulation_instance_id:env.STAGING_PAYMENT_INSTANCE_ID},{...env,APP_ENV:'production'},registry),false)})
test('real checkout creates unpaid order with stock hold; unpaid acceptance rejected',async()=>{const {db,id}=await prepared();assert.equal(db.tables.orders.get(id).payment_status,'unpaid');assert.equal((await status(db,id,'accepted')).code,409);assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity,9)})
for(const issue of ['no-grant','marker-disabled','wrong-database','wrong-instance','non-wechat'])test('authorization refuses '+issue,async()=>{
 const {db,id}=await prepared();let who=subject
 if(issue==='no-grant')db.testGrants.clear();if(issue==='marker-disabled')db.simulationEnabled=false;if(issue==='wrong-database')db.databaseMatches=false;if(issue==='wrong-instance')db.simulationInstance=key
 if(issue==='non-wechat'){who='customer-a';db.tables.orders.get(id).customer_subject=who;db.testGrants.add(STORE_A+':'+who)}
 const r=await confirm(db,id,{who});assert.equal(r.code,403);assert.equal(db.tables.orders.get(id).payment_status,'unpaid');assert.equal(db.rows('payments').length,0)
})
test('cross-store and cross-customer requests cannot discover or confirm order',async()=>{const {db,id}=await prepared();assert.equal((await confirm(db,id,{slug:'beta'})).code,404);assert.equal((await confirm(db,id,{who:'wx:wxunit:other'})).code,404)})
for(const data of [{requestKey:key,amount:1},{requestKey:key,status:'paid'},{requestKey:'bad'},{},[]])test('rejects untrusted confirmation fields '+JSON.stringify(data),async()=>{const {db,id}=await prepared();assert.equal((await confirm(db,id,{data})).code,400);assert.equal(db.rows('payments').length,0)})
test('read-only capability checks live grant and never changes order',async()=>{const {db,id}=await prepared();const before=db.rows('orders');const r=await confirm(db,id,{method:'GET'});assert.equal(r.body.eligible,true);assert.deepEqual(db.rows('orders'),before);assert.equal(db.rows('simulations').length,0)})
test('finite stock confirms once with audit and no second decrement',async()=>{const {db,id}=await prepared();const before=db.tables.products.get(PRODUCT_A).stock_quantity;const r=await confirm(db,id);assert.equal(r.code,200);assert.equal(r.body.simulated,true);assert.equal(db.tables.orders.get(id).inventory_state,'committed');assert.equal(db.tables.orders.get(id).payment_source,'staging_simulated');assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity,before);assert.equal(db.rows('payments')[0].provider,'staging_simulated');assert.equal(db.rows('simulations')[0].actor_subject,subject);db.assertClosed()})
test('unlimited stock uses same payment gate and server-owned amount',async()=>{const {db,id}=await prepared({mode:'unlimited'});assert.equal((await status(db,id,'accepted')).code,409);assert.equal((await confirm(db,id)).code,200);assert.equal(db.rows('simulations')[0].amount_cents,1200);assert.equal(db.rows('reservations').length,0)})
test('safe replay and concurrent confirmation create one audit/event only (model scheduling)',async()=>{const {db,id}=await prepared();const results=await Promise.all([confirm(db,id),confirm(db,id)]);assert.ok(results.every(r=>r.code===200));assert.equal(results.filter(r=>r.body.replayed).length,1);assert.equal(db.rows('payments').length,1);assert.equal(db.rows('simulations').length,1);assert.equal((await confirm(db,id)).body.replayed,true)})
test('same request key with another order conflicts',async()=>{const {db,id}=await prepared();await confirm(db,id);const r=response();await checkoutRoute(request(db,subject,payload(),'DIFFERENT_CHECKOUT_KEY_12345'),r,new URL('http://unit.invalid/v1/stores/alpha/orders'),db);assert.equal((await confirm(db,r.body.orderId)).code,409);assert.equal(db.rows('payments').length,1)})
test('expired, cancelled and already released orders cannot be revived',async()=>{for(const state of ['expired','cancelled','released']){const {db,id}=await prepared();const o=db.tables.orders.get(id);if(state==='expired')db.now=new Date(+db.now+900001);if(state==='cancelled')await status(db,id,'cancelled');if(state==='released')o.inventory_state='released';assert.equal((await confirm(db,id)).code,409);assert.equal(db.rows('payments').length,0)}})
test('missing reservation rejects and a price/stock lock wait cannot extend deadline',async()=>{const a=await prepared();a.db.tables.reservations.clear();assert.equal((await confirm(a.db,a.id)).code,409);const {db,id}=await prepared();const pause=db.pauseOnce(s=>s.startsWith('SELECT i.product_id,i.quantity,r.quantity'));const pending=confirm(db,id);await pause.entered;db.now=new Date(+db.now+900001);pause.release();assert.equal((await pending).body.error,'payment_window_expired');assert.equal(db.rows('payments').length,0)})
test('revocation while waiting for inventory is rechecked before payment writes',async()=>{const {db,id}=await prepared();const pause=db.pauseOnce(s=>s.startsWith('SELECT i.product_id,i.quantity,r.quantity'));const pending=confirm(db,id);await pause.entered;db.testGrants.clear();pause.release();assert.equal((await pending).code,403);assert.equal(db.rows('payments').length,0)})
test('live session revoked before transactional authorization cannot confirm',async()=>{const {db,id}=await prepared();const pause=db.pauseOnce(s=>s.startsWith('SELECT external_subject FROM auth_sessions')&&s.endsWith('FOR SHARE'));const pending=confirm(db,id);await pause.entered;db.sessions.clear();pause.release();assert.equal((await pending).code,401);assert.equal(db.rows('payments').length,0)})
test('insufficient database privileges have a diagnostic refusal without payment writes',async()=>{const {db,id}=await prepared();db.privilegeDenied=true;const r=await confirm(db,id);assert.equal(r.code,503);assert.equal(r.body.error,'staging_database_privileges_required');assert.equal(db.tables.orders.get(id).payment_status,'unpaid');assert.equal(db.rows('payments').length,0)})
test('injected inventory failure rolls back payment, audit, event and stock together',async()=>{const {db,id}=await prepared();db.failOnce(s=>s.startsWith('UPDATE inventory_reservations SET'));const r=await confirm(db,id);assert.equal(r.code,503);assert.equal(db.tables.orders.get(id).payment_status,'unpaid');assert.equal(db.tables.orders.get(id).inventory_state,'held');assert.equal(db.rows('simulations').length,0);assert.equal(db.rows('payments').length,0);assert.equal((await confirm(db,id)).code,200)})
test('payment first versus cancellation serializes on real route order lock in model; no refund call',async()=>withEnvironment(async()=>{const {db,id}=await prepared();const pause=db.pauseOnce(s=>s.startsWith('INSERT INTO staging_payment_confirmations'));const paying=confirm(db,id);await pause.entered;const cancel=status(db,id,'cancelled');pause.release();assert.equal((await paying).code,200);assert.equal((await cancel).code,200);assert.equal(db.tables.orders.get(id).inventory_state,'committed');assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity,9);assert.equal(db.rows('payments').length,1)}))
test('cancellation first releases hold and late confirmation is refused',async()=>{const {db,id}=await prepared();await status(db,id,'cancelled');assert.equal((await confirm(db,id)).code,409);assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity,10);assert.equal(db.tables.orders.get(id).payment_status,'unpaid')})
test('confirmed simulation follows accepted/preparing/delivering; generic delivered still requires proof',async()=>withEnvironment(async()=>{const {db,id}=await prepared();await confirm(db,id);for(const next of ['accepted','preparing','delivering'])assert.equal((await status(db,id,next)).code,200);assert.equal((await status(db,id,'delivered')).body.error,'use_verified_proof_completion_endpoint');assert.equal(db.tables.orders.get(id).fulfillment_status,'delivering')}))
test('database status never makes simulated money real in archive summary',async()=>{const {db,id}=await prepared();await confirm(db,id);const s=orderSummary(db.rows('orders'));assert.equal(s.confirmedReceivedCents,'0');assert.equal(s.confirmedPaymentCount,0)})

test('commit succeeded but response lost can be recovered by same-key replay without duplicate writes',async()=>{
 const {db,id}=await prepared(),r=response({lost:true})
 await assert.rejects(()=>stagingPaymentRoute(request(db,subject,{requestKey:key}),r,new URL(`http://unit.invalid/v1/stores/alpha/orders/${id}/staging-payment`),db,env,registry),/phase7_connection_lost_after_commit/)
 assert.equal(db.tables.orders.get(id).payment_status,'paid');assert.equal(db.rows('simulations').length,1)
 const retry=await confirm(db,id);assert.equal(retry.code,200);assert.equal(retry.body.replayed,true);assert.equal(db.rows('payments').length,1)
})

test('merchant pending-count SQL explicitly separates paid new from unpaid new within authorized store',async()=>{
 let seen=false;const counts=await merchantOrderCounts({async query(sql,args){seen=true;assert.match(sql,/fulfillment_status='new' AND payment_status='paid'/);assert.match(sql,/fulfillment_status='new' AND payment_status='unpaid'/);assert.match(sql,/FROM orders WHERE store_id=\$1/);assert.deepEqual(args,[STORE_A]);return {rows:[{all:9,new:2,unpaid:5,accepted:0,preparing:0,delivering:0,delivered:0,cancelled:1,abnormal:1}]}}},STORE_A)
 assert.equal(seen,true);assert.equal(counts.new,2);assert.equal(counts.unpaid,5)
 // Query contract test: aggregate execution itself still needs PostgreSQL.
})

test('actual analytics handler labels simulations and never counts them as received income',async()=>{
 const o={id:key,created_at:new Date('2026-10-28T04:00:00Z'),total_cents:'1500',payment_status:'paid',payment_source:'staging_simulated',fulfillment_status:'delivered',business_day:'2026-10-28',business_hour:12}
 const line={id:key,order_id:key,product_id:PRODUCT_A,product_name:'历史快照',quantity:1,line_total_cents:'1500',category_id_snapshot:null,category_name_snapshot:null}
 const client={async query(sql){if(sql.startsWith('SELECT o.id,o.created_at'))return {rows:[o]};if(sql.startsWith('SELECT oi.id'))return {rows:[line]};return {rows:[]}},release(){}}
 const pool={async query(sql){if(sql.includes('FROM auth_sessions'))return {rows:[{external_subject:subject}]};if(sql.includes('FROM merchant_members'))return {rows:[{id:STORE_A,role:'owner'}]};assert.fail(sql)},async connect(){return client}}
 const r=response();await salesAnalyticsRoute(request(fixture(),subject,{},undefined,'GET'),r,new URL('http://unit.invalid/v1/merchant/stores/alpha/analytics?from=2026-10-28&to=2026-10-28'),pool)
 assert.equal(r.code,200);assert.equal(r.body.summary.simulatedCount,1);assert.equal(r.body.summary.simulatedOrderCents,1500);assert.equal(r.body.summary.paidCents,0);assert.equal(r.body.summary.paidCount,0);assert.equal(r.body.daily[0].paidCents,0);assert.equal(r.body.products[0].paidCents,0);assert.match(r.body.notice,/模拟订单不计真实到账/)
})

test('expiry racing a locked confirmation ultimately releases unpaid hold (model only, not SKIP LOCKED proof)',async()=>{
 const {db,id}=await prepared();db.sweepCandidates.add(id)
 const pause=db.pauseOnce(s=>s.startsWith('SELECT i.product_id,i.quantity,r.quantity'));const paying=confirm(db,id);await pause.entered
 db.now=new Date(+db.now+900001);assert.equal(await sweepInventory(db,1),0)
 pause.release();assert.equal((await paying).code,409);assert.equal(await sweepInventory(db,1),1)
 assert.equal(db.tables.orders.get(id).fulfillment_status,'cancelled');assert.equal(db.tables.orders.get(id).payment_status,'unpaid');assert.equal(db.tables.products.get(PRODUCT_A).stock_quantity,10);assert.equal(db.rows('payments').length,0)
})
test('unknown COMMIT result keeps persisted confirmation recoverable by same-key replay',async()=>{
 const {db,id}=await prepared(),connect=db.connect.bind(db);let fault=true
 db.connect=async()=>{const c=await connect(),query=c.query;c.query=async(sql,args)=>{const result=await query(sql,args);if(sql==='COMMIT'&&fault){fault=false;throw Error('synthetic commit acknowledgement lost')}return result};return c}
 const r=await confirm(db,id);assert.equal(r.code,503);assert.equal(db.tables.orders.get(id).payment_status,'paid');assert.equal(db.rows('payments').length,1)
 const replay=await confirm(db,id);assert.equal(replay.code,200);assert.equal(replay.body.replayed,true);assert.equal(db.rows('simulations').length,1)
})
test('a different confirmation key cannot claim replay success for the same paid order',async()=>{const {db,id}=await prepared();await confirm(db,id);const r=await confirm(db,id,{data:{requestKey:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}});assert.equal(r.code,409);assert.equal(db.rows('payments').length,1)})
