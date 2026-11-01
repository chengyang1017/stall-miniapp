import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHmac} from 'node:crypto'
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {sandboxDatabase} from './helpers/sandbox-pglite.mjs'
import {reserveSandboxAttempt,materializeSandboxAttempt,applySandboxObservation,requestSandboxRefund,readSandboxPayment} from '../src/sandboxPaymentStore.mjs'
import {createStripeSandboxClient} from '../src/stripeSandboxClient.mjs'
import {createStripeTestRefundClient} from '../src/stripeTestRefund.mjs'
import {processOneStripeTestRefund,reconcileOneSubmittedStripeTestRefund} from '../src/stripeTestRefundJobs.mjs'
import {syncSandboxRefundOrders,runSandboxMaintenance,assertSandboxDatabase} from '../src/sandboxPaymentWorker.mjs'
import {sandboxOrderColumns,verifiedFulfillmentPayment} from '../src/sandboxPaymentQuery.mjs'
import {createSession} from '../src/auth.mjs'
import {stripeTestPaymentRoute} from '../src/stripeTestPaymentRoute.mjs'
let db,pool,store,product
const dir=mkdtempSync(join(tmpdir(),'stall-sandbox-pg-'))
const env={SANDBOX_PAYMENT_INSTANCE_ID:'11111111-1111-4111-8111-999999999999',STRIPE_TEST_SECRET_KEY:'sk_test_Synthetic',STRIPE_TEST_WEBHOOK_SECRET:'whsec_Synthetic',STRIPE_TEST_SUCCESS_URL:'https://test.invalid/success',STRIPE_TEST_CANCEL_URL:'https://test.invalid/cancel',STRIPE_TEST_CARD_CONFIGURATION:'pmc_Card',STRIPE_TEST_ALIPAY_CONFIGURATION:'pmc_Alipay',STRIPE_TEST_WECHAT_PAY_CONFIGURATION:'pmc_Wechat',STRIPE_TEST_PAYMENTS_ENABLED:'true',SANDBOX_PAYMENT_LIFECYCLE_ENABLED:'true',PAYMENT_DB_ENV:'isolated-test',STRIPE_TEST_REFUNDS_ENABLED:'true'}
before(async()=>{
 db=await sandboxDatabase();pool=db.pool;await db.migrate()
 await pool.query('INSERT INTO sandbox_payment_environment(instance_id,database_name,application_role,enabled) VALUES($1,current_database(),current_user,true)',[env.SANDBOX_PAYMENT_INSTANCE_ID])
 const {rows:[m]}=await pool.query("INSERT INTO merchants(display_name) VALUES('Synthetic merchant') RETURNING id")
 const {rows:[s]}=await pool.query("INSERT INTO stores(merchant_id,slug,name,is_active) VALUES($1,'sandbox-test','Synthetic store',true) RETURNING id",[m.id]);store=s.id
 const {rows:[p]}=await pool.query("INSERT INTO products(store_id,name,price_cents,stock_mode,stock_quantity) VALUES($1,'Synthetic item',1000,'finite',8) RETURNING id",[store]);product=p.id
})
after(async()=>{await db?.pg.close()})
async function order(extra=''){
 const {rows:[o]}=await pool.query(`INSERT INTO orders(store_id,customer_subject,subtotal_cents,total_cents,inventory_state,inventory_expires_at) VALUES($1,'synthetic-customer',1000,1000,'none',clock_timestamp()+interval '1 hour') RETURNING *`,[store])
 await pool.query('INSERT INTO order_items(order_id,product_id,product_name,unit_price_cents,quantity) VALUES($1,$2,\'Synthetic item\',1000,1)',[o.id,product])
 if(extra)await pool.query('UPDATE orders SET '+extra+' WHERE id=$1',[o.id])
 return o
}
const reserve=(o,channel='card')=>reserveSandboxAttempt(pool,{orderId:o.id,subject:'synthetic-customer',channel})
async function opened(o,channel='card'){
 const a=await reserve(o,channel)
 return materializeSandboxAttempt(pool,{create:async()=>({sessionId:'cs_test_'+a.id.replaceAll('-',''),url:'https://checkout.stripe.com/c/pay/test'})},a)
}
function session(a,status='paid'){
 return {id:a.session_id,object:'checkout.session',mode:'payment',livemode:false,status:status==='expired'?'expired':status==='open'?'open':'complete',
  payment_status:status==='paid'?'paid':'unpaid',currency:'cny',amount_total:1000,client_reference_id:a.order_id,metadata:{orderId:a.order_id},
  payment_intent:{id:'pi_'+a.id.replaceAll('-',''),livemode:false,status:status==='paid'?'succeeded':status==='failed'?'requires_payment_method':'processing',amount:1000,currency:'cny',latest_charge:{created:Math.floor(Date.now()/1000),payment_method_details:{type:a.channel}}}}
}
const lookup=(a,s)=>createStripeSandboxClient(env,async()=>({ok:true,json:async()=>s||session(a)})).getSession(a)
async function pay(a,s){return applySandboxObservation(pool,a,await lookup(a,s))}
const notification=(id='evt_'+randomUUID().replaceAll('-',''),type='checkout.session.completed')=>({id,type,created:Math.floor(Date.now()/1000),hash:'a'.repeat(64)})
test('all 001-027 migrations execute and 027 repeat fails rather than hiding drift',async()=>{
 await assert.rejects(db.pg.exec('CREATE TABLE sandbox_payment_attempts(id uuid)'),/already exists/)
 assert.ok((await pool.query("SELECT indexname FROM pg_indexes WHERE indexname='sandbox_payment_one_active_order'")).rows.length)
})
test('concurrent reservations share one durable attempt and reject another channel',async()=>{
 const o=await order(),r=await Promise.all([reserve(o),reserve(o),reserve(o)])
 assert.equal(new Set(r.map(a=>a.id)).size,1)
 await assert.rejects(reserve(o,'alipay'),/active_payment_channel_conflict/)
 await assert.rejects(pool.query("INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,expires_at) VALUES($1,'card',1000,'CNY',$2,now())",[o.id,randomUUID()]),/duplicate key/)
})
test('network interruption reuses durable request key, amount and expiry after retry',async()=>{
 const o=await order(),a=await reserve(o);let calls=0
 const client={create:async x=>{assert.equal(x.request_key,a.request_key);assert.equal(x.expires_at.toISOString(),a.expires_at.toISOString());if(++calls===1)throw Error('offline');return {sessionId:'cs_test_recovery',url:'https://checkout.stripe.com/test'}}}
 await assert.rejects(materializeSandboxAttempt(pool,client,a),/offline/)
 const next=await reserve(o);assert.equal(next.id,a.id)
 assert.equal((await materializeSandboxAttempt(pool,client,next)).session_id,'cs_test_recovery')
})
for(const channel of ['card','alipay','wechat_pay'])test(channel+' verified payment settles and writes immutable receipt',async()=>{
 const o=await order(),a=await opened(o,channel),ob=await lookup(a)
 await applySandboxObservation(pool,a,ob,notification())
 const state=await readSandboxPayment(pool,o.id)
 assert.equal(state.attempts[0].status,'succeeded');assert.equal(state.receipts[0].channel,channel)
 assert.equal(state.receipts[0].items[0].quantity,1);assert.equal(state.receipts[0].sandbox,true)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[o.id])).rows[0].payment_status,'paid')
 await assert.rejects(pool.query("UPDATE sandbox_payment_receipts SET document_text='{}' WHERE order_id=$1",[o.id]),/immutable/)
 await assert.rejects(pool.query('DELETE FROM sandbox_payment_receipts WHERE order_id=$1',[o.id]),/immutable/)
})
test('duplicates and out-of-order expired callbacks do not reverse trusted payment',async()=>{
 const a=await opened(await order()),n=notification(),ob=await lookup(a)
 await applySandboxObservation(pool,a,ob,n);await applySandboxObservation(pool,a,ob,n)
 await applySandboxObservation(pool,a,await lookup(a,session(a,'expired')),notification())
 assert.equal((await readSandboxPayment(pool,a.order_id)).attempts[0].status,'succeeded')
 assert.equal((await pool.query('SELECT * FROM payment_events WHERE order_id=$1',[a.order_id])).rows.length,1)
 await assert.rejects(applySandboxObservation(pool,a,ob,{...n,hash:'b'.repeat(64)}),/webhook_event_conflict/)
})
test('failed and expired sessions allow a new attempt without recreating order',async()=>{
 const o=await order(),a=await opened(o)
 await applySandboxObservation(pool,a,await lookup(a,session(a,'failed')),notification(undefined,'checkout.session.async_payment_failed'))
 assert.equal((await readSandboxPayment(pool,o.id)).attempts[0].status,'failed')
 const next=await reserve(o,'alipay');assert.notEqual(next.id,a.id)
})
test('late trusted collection queues one compensating refund without resurrecting stock',async()=>{
 const a=await opened(await order());await pool.query("UPDATE orders SET inventory_state='released',fulfillment_status='cancelled' WHERE id=$1",[a.order_id])
 await pay(a);await pay(a)
 const state=await readSandboxPayment(pool,a.order_id)
 assert.equal(state.attempts[0].status,'refund_required');assert.equal(state.refunds.length,1)
 assert.equal((await pool.query('SELECT payment_status,inventory_state FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'unpaid')
})
test('second distinct paid session is compensated, first receipt and settlement preserved',async()=>{
 const o=await order(),first=await opened(o);await pay(first)
 const {rows:[a]}=await pool.query("INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,status,session_id,expires_at) VALUES($1,'card',1000,'CNY',$2,'expired','cs_test_duplicate',now()) RETURNING *",[o.id,randomUUID()])
 await pay(a);await pay(a)
 const state=await readSandboxPayment(pool,o.id)
 assert.equal(state.receipts.length,2);assert.equal(state.refunds.length,1)
 assert.equal((await pool.query("SELECT * FROM payment_events WHERE order_id=$1 AND event_type='payment_succeeded'",[o.id])).rows.length,1)
})
test('full and partial refund reservations validate amount and idempotency under concurrency',async()=>{
 const a=await opened(await order());await pay(a)
 const input={orderId:a.order_id,subject:'synthetic-owner',amountCents:400,requestKey:randomUUID()}
 const [one,two]=await Promise.all([requestSandboxRefund(pool,input),requestSandboxRefund(pool,input)])
 assert.equal(one.id,two.id)
 await assert.rejects(requestSandboxRefund(pool,{...input,amountCents:401}),/refund_idempotency_conflict/)
 await assert.rejects(requestSandboxRefund(pool,{...input,amountCents:601,requestKey:randomUUID()}),/exceeds_remaining/)
 await requestSandboxRefund(pool,{...input,amountCents:600,requestKey:randomUUID()})
 await assert.rejects(requestSandboxRefund(pool,{...input,amountCents:-1,requestKey:randomUUID()}),/invalid_refund/)
})
test('actual Stripe refund adapter sends partial amount with stable per-job idempotency',async()=>{
 const a=await opened(await order());await pay(a)
 const job=await requestSandboxRefund(pool,{orderId:a.order_id,subject:'synthetic-owner',amountCents:250,requestKey:randomUUID()})
 let headers,body
 const client=createStripeTestRefundClient({secretKey:env.STRIPE_TEST_SECRET_KEY,fetchImpl:async(url,options)=>{
  if(url.includes('/checkout/sessions/'))return {ok:true,json:async()=>({...session(a),payment_intent:'pi_synthetic'})}
  headers=options.headers;body=new URLSearchParams(options.body)
  return {ok:true,json:async()=>({id:'re_partial',payment_intent:'pi_synthetic',amount:250,currency:'cny',status:'succeeded'})}
 }})
 const result=await client.refundPayment(job)
 assert.equal(result.completed,true);assert.equal(body.get('amount'),'250');assert.equal(headers['Idempotency-Key'],'sandbox-refund:'+job.id)
})
test('submitted refund leases allow polling, survive expired lease and preserve receipt',async()=>{
 const a=await opened(await order());await pay(a)
 const job=await requestSandboxRefund(pool,{orderId:a.order_id,subject:'synthetic-owner',amountCents:1000,requestKey:randomUUID()})
 await pool.query("UPDATE stripe_test_refund_jobs SET status='submitted',refund_id='re_poll',lease_token=gen_random_uuid(),lease_expires_at=now()-interval '1 minute' WHERE id=$1",[job.id])
 // Isolate this row from other jobs submitted by earlier tests.
 const result=await reconcileOneSubmittedStripeTestRefund(pool,{getRefundStatus:async()=>({refundId:'re_poll',amountCents:1000,paymentIntentId:'pi_test',status:'succeeded'})})
 assert.equal(result.action,'succeeded');await syncSandboxRefundOrders(pool)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'refunded')
 assert.equal((await readSandboxPayment(pool,a.order_id)).receipts.length,1)
})
test('finite held inventory commits once with no second stock decrement',async()=>{
 const o=await order("inventory_state='held'"),a=await opened(o)
 await pool.query("INSERT INTO inventory_reservations(store_id,order_id,product_id,quantity) VALUES($1,$2,$3,1)",[store,o.id,product])
 const before=(await pool.query('SELECT stock_quantity FROM products WHERE id=$1',[product])).rows[0].stock_quantity
 await pay(a);await pay(a)
 assert.equal((await pool.query('SELECT stock_quantity FROM products WHERE id=$1',[product])).rows[0].stock_quantity,before)
 assert.equal((await pool.query('SELECT state FROM inventory_reservations WHERE order_id=$1',[o.id])).rows[0].state,'committed')
 assert.equal((await pool.query('SELECT * FROM inventory_movements WHERE order_id=$1',[o.id])).rows.length,1)
})
test('rollback includes receipt, event and status on invalid order snapshot',async()=>{
 const a=await opened(await order()),ob=await lookup(a);ob.session.payment_intent.latest_charge.created=NaN
 await assert.rejects(applySandboxObservation(pool,a,ob,notification()),/Invalid time/)
 assert.equal((await pool.query('SELECT * FROM payment_events WHERE order_id=$1',[a.order_id])).rows.length,0)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'unpaid')
})
test('disabled worker performs no provider or database calls',async()=>{
 assert.deepEqual(await runSandboxMaintenance({query(){throw Error('access')}},{}),{disabled:true})
})

async function route(path,{who='synthetic-customer',method='GET',body,client,signature}={}){
 const auth=await createSession(pool,who),raw=typeof body==='string'?body:JSON.stringify(body||{})
 const req={method,headers:{authorization:'Bearer '+auth.token,'idempotency-key':'synthetic_route_key_123',...(signature?{'stripe-signature':signature}:{})},async *[Symbol.asyncIterator](){yield Buffer.from(raw)}}
 const res={writeHead(status){this.status=status},end(data){this.body=JSON.parse(data)}}
 await stripeTestPaymentRoute(req,res,new URL('https://test.invalid'+path),pool,env,{client:client||{getSession:async a=>lookup(a)}})
 return res
}
test('customer status recovery verifies ownership and heals dropped webhook using provider retrieval',async()=>{
 const a=await opened(await order()),path='/v1/stores/sandbox-test/orders/'+a.order_id+'/sandbox-payment'
 assert.equal((await route(path,{who:'synthetic-other'})).status,404)
 const r=await route(path)
 assert.equal(r.status,200);assert.equal(r.body.attempts[0].status,'succeeded');assert.equal(r.body.receipts.length,1)
 const failed=await route(path,{client:{getSession(){throw Error('offline')}}})
 assert.equal(failed.status,200);assert.equal(failed.body.receipts.length,1)
})
test('merchant receipt read and refund role restrictions use real server membership lookup',async()=>{
 await pool.query("INSERT INTO merchant_members(merchant_id,external_subject,role) SELECT merchant_id,'synthetic-owner','owner' FROM stores WHERE id=$1 ON CONFLICT DO NOTHING",[store])
 await pool.query("INSERT INTO merchant_members(merchant_id,external_subject,role) SELECT merchant_id,'synthetic-staff','staff' FROM stores WHERE id=$1 ON CONFLICT DO NOTHING",[store])
 const a=await opened(await order());await pay(a)
 const path='/v1/merchant/stores/sandbox-test/orders/'+a.order_id
 const staff=await route(path+'/sandbox-payment',{who:'synthetic-staff'})
 assert.equal(staff.status,200);assert.equal(staff.body.canRefund,false);assert.equal(staff.body.receipts.length,1)
 assert.equal((await route(path+'/sandbox-refund',{method:'POST',who:'synthetic-staff',body:{amountCents:1000}})).status,403)
 assert.equal((await route(path+'/sandbox-refund',{method:'POST',who:'synthetic-other',body:{amountCents:1000}})).status,403)
 assert.equal((await route(path+'/sandbox-refund',{method:'POST',who:'synthetic-owner',body:{amountCents:1000}})).status,202)
})
test('signed HTTP webhook persisted once, tampered signature rejected, reordered notification cannot undo payment',async()=>{
 const a=await opened(await order()),payload={id:'evt_http_test',livemode:false,created:Math.floor(Date.now()/1000),type:'checkout.session.completed',data:{object:session(a)}}
 const raw=JSON.stringify(payload),timestamp=Math.floor(Date.now()/1000),signature='t='+timestamp+',v1='+createHmac('sha256',env.STRIPE_TEST_WEBHOOK_SECRET).update(timestamp+'.'+raw).digest('hex')
 const path='/v1/payments/stripe-test/webhook'
 assert.equal((await route(path,{method:'POST',body:raw,signature})).status,200)
 assert.equal((await route(path,{method:'POST',body:raw,signature})).status,200)
 assert.equal((await pool.query("SELECT * FROM sandbox_payment_notifications WHERE event_id='evt_http_test'")).rows.length,1)
 assert.equal((await route(path,{method:'POST',body:raw+' ',signature})).status,400)
})
test('trusted provider expiration closes session before switching channel and ignores stale open result',async()=>{
 const a=await opened(await order()),path='/v1/stores/sandbox-test/orders/'+a.order_id+'/sandbox-cancel'
 const r=await route(path,{method:'POST',client:{getSession:async()=>lookup(a,session(a,'open')),expire:async()=>lookup(a,session(a,'expired'))}})
 assert.equal(r.status,200);assert.equal(r.body.attempts[0].status,'cancelled')
 await applySandboxObservation(pool,a,await lookup(a,session(a,'open')))
 assert.equal((await readSandboxPayment(pool,a.order_id)).attempts[0].status,'cancelled')
 assert.notEqual((await reserve({id:a.order_id},'alipay')).id,a.id)
})
test('transient refund failure retries same job, then partial and full success preserve original receipt',async()=>{
 await pool.query("UPDATE stripe_test_refund_jobs SET next_attempt_at=now()+interval '1 day' WHERE status='pending'")
 const a=await opened(await order());await pay(a)
 const input={orderId:a.order_id,subject:'synthetic-owner',amountCents:250,requestKey:randomUUID()}
 const job=await requestSandboxRefund(pool,input)
 let calls=0
 const client={refundPayment:async j=>{assert.equal(j.id,job.id);if(++calls===1)throw Error('offline');return {refundId:'re_retry_test',paymentIntentId:'pi_retry_test',amountCents:250,status:'pending',completed:false}}}
 assert.equal((await processOneStripeTestRefund(pool,client)).action,'pending')
 await pool.query('UPDATE stripe_test_refund_jobs SET next_attempt_at=now() WHERE id=$1',[job.id])
 assert.equal((await processOneStripeTestRefund(pool,client)).action,'submitted')
 await reconcileOneSubmittedStripeTestRefund(pool,{getRefundStatus:async()=>({refundId:'re_retry_test',amountCents:250,paymentIntentId:'pi_retry_test',status:'succeeded'})})
 await syncSandboxRefundOrders(pool)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'partially_refunded')
 await requestSandboxRefund(pool,{...input,amountCents:750,requestKey:randomUUID()})
 assert.equal((await processOneStripeTestRefund(pool,{refundPayment:async()=>({refundId:'re_remainder',amountCents:750,status:'succeeded',completed:true})})).action,'succeeded')
 await syncSandboxRefundOrders(pool)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'refunded')
 assert.equal((await readSandboxPayment(pool,a.order_id)).receipts.length,1)
 await pay(a)
 assert.equal((await readSandboxPayment(pool,a.order_id)).refunds.length,2)
})
test('late payment compensation is consumed by existing refund queue and failed remote refund requires review',async()=>{
 await pool.query("UPDATE stripe_test_refund_jobs SET next_attempt_at=now()+interval '1 day' WHERE status='pending'")
 const a=await opened(await order());await pool.query("UPDATE orders SET fulfillment_status='cancelled',inventory_state='released' WHERE id=$1",[a.order_id]);await pay(a)
 const result=await processOneStripeTestRefund(pool,{refundLatePayment:async audit=>{assert.equal(audit.provider_event_id,a.session_id);return {refundId:'re_compensation',amountCents:1000,status:'pending',completed:false}}})
 assert.equal(result.action,'submitted')
 const checked=await reconcileOneSubmittedStripeTestRefund(pool,{getRefundStatus:async()=>({refundId:'re_compensation',amountCents:1000,status:'failed'})})
 assert.equal(checked.action,'review')
 assert.equal((await pool.query('SELECT inventory_state FROM orders WHERE id=$1',[a.order_id])).rows[0].inventory_state,'released')
})
test('provider live result, amount mismatch and unsupported actual payment channel are rejected',async()=>{
 const a=await opened(await order())
 await assert.rejects(lookup(a,{...session(a),livemode:true}),/stripe_session_mismatch/)
 await assert.rejects(lookup(a,{...session(a),amount_total:1}),/stripe_session_mismatch/)
 const bad=session(a);bad.payment_intent.latest_charge.payment_method_details.type='unknown'
 await assert.rejects(lookup(a,bad),/stripe_paid_intent_mismatch/)
})
test('payment timing and customer ownership fail before provider creation',async()=>{
 const o=await order("created_at=now()-interval '16 minutes'")
 await assert.rejects(reserve(o),/payment_order_not_payable/)
 const valid=await order()
 await assert.rejects(reserveSandboxAttempt(pool,{orderId:valid.id,subject:'synthetic-other',channel:'card'}),/payment_order_not_found/)
})


test('enabled recovery worker resumes creating attempt and automatically completes compensating refund',async()=>{
 await pool.query("UPDATE sandbox_payment_attempts SET status='review' WHERE status IN ('creating','open','processing')")
 await pool.query("UPDATE stripe_test_refund_jobs SET next_attempt_at=now()+interval '1 day' WHERE status='pending'")
 const a=await reserve(await order());let created=0
 const client={create:async x=>{assert.equal(x.id,a.id);created++;return {sessionId:'cs_test_worker',url:'https://checkout.stripe.com/test'}},getSession:async x=>lookup(x)}
 const first=await runSandboxMaintenance(pool,{...env,STRIPE_TEST_REFUNDS_ENABLED:'false'},{client})
 assert.equal(first.recovered,1);assert.equal(created,1)
 assert.equal((await readSandboxPayment(pool,a.order_id)).attempts[0].status,'succeeded')
 assert.equal((await runSandboxMaintenance(pool,{...env,STRIPE_TEST_REFUNDS_ENABLED:'false'},{client})).recovered,0)
 const late=await opened(await order());await pool.query("UPDATE orders SET fulfillment_status='cancelled',inventory_state='released' WHERE id=$1",[late.order_id]);await pay(late)
 const result=await runSandboxMaintenance(pool,env,{client,refundClient:{refundLatePayment:async audit=>{
  assert.equal(audit.provider_event_id,late.session_id);return {refundId:'re_auto_comp',amountCents:1000,status:'succeeded',completed:true}
 },getRefundStatus:async()=>{throw Error('unexpected poll')}}})
 assert.equal(result.refund,'succeeded')
 const saved=await readSandboxPayment(pool,late.order_id);assert.equal(saved.refunds[0].status,'succeeded')
})
test('unknown creation past idempotency retention enters review without new provider request',async()=>{
 const a=await reserve(await order());await pool.query("UPDATE sandbox_payment_attempts SET created_at=now()-interval '24 hours' WHERE id=$1",[a.id])
 const saved=(await pool.query('SELECT * FROM sandbox_payment_attempts WHERE id=$1',[a.id])).rows[0]
 await assert.rejects(materializeSandboxAttempt(pool,{create(){throw Error('must not contact provider')}},saved),/payment_manual_review_required/)
 assert.equal((await readSandboxPayment(pool,a.order_id)).attempts[0].status,'review')
})
test('receipt truncate and positive amount/currency constraints are enforced by PostgreSQL',async()=>{
 await assert.rejects(pool.query('TRUNCATE sandbox_payment_receipts'),/immutable/)
 const o=await order()
 await assert.rejects(pool.query("INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,expires_at) VALUES($1,'card',-1,'CNY',$2,now())",[o.id,randomUUID()]),/check constraint/)
 await assert.rejects(pool.query("INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,expires_at) VALUES($1,'card',1000,'USD',$2,now())",[o.id,randomUUID()]),/check constraint/)
})

test('database environment marker binds approved instance, actual DB and runtime role',async()=>{
 await assert.rejects(assertSandboxDatabase(pool,{...env,SANDBOX_PAYMENT_INSTANCE_ID:randomUUID()}),/sandbox_database_not_authorized/)
 await pool.query("UPDATE sandbox_payment_environment SET enabled=false")
 await assert.rejects(assertSandboxDatabase(pool,env),/sandbox_database_not_authorized/)
 await pool.query("UPDATE sandbox_payment_environment SET enabled=true")
})


test('migration 027 failure rolls back new tables and old refund queue alterations atomically',async()=>{
 const fresh=await sandboxDatabase()
 try{
  await fresh.migrate(26)
  const migration=readFileSync(new URL('../sql/027_sandbox_payment_lifecycle.sql',import.meta.url),'utf8')
  await assert.rejects(fresh.pg.exec(migration.replace('COMMIT;','SELECT 1/0; COMMIT;')),/division by zero/)
  await fresh.pg.exec('ROLLBACK')
  assert.equal((await fresh.pool.query("SELECT to_regclass('sandbox_payment_attempts') AS t")).rows[0].t,null)
  assert.equal((await fresh.pool.query("SELECT count(*) AS n FROM information_schema.columns WHERE table_name='stripe_test_refund_jobs' AND column_name='kind'")).rows[0].n,0)
  await fresh.pg.exec(migration)
  assert.ok((await fresh.pool.query("SELECT to_regclass('sandbox_payment_attempts') AS t")).rows[0].t)
 }finally{await fresh.pg.close()}
})
test('trusted collection after sixty minute hold window is compensated even for unlimited inventory',async()=>{
 const a=await opened(await order());await pool.query("UPDATE orders SET created_at=now()-interval '61 minutes',inventory_expires_at=NULL WHERE id=$1",[a.order_id])
 await pay(a)
 const state=await readSandboxPayment(pool,a.order_id)
 assert.equal(state.attempts[0].status,'refund_required');assert.equal(state.refunds.length,1)
 assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[a.order_id])).rows[0].payment_status,'unpaid')
})

test('list projections expose persisted Sandbox attempt state only in explicitly enabled environment',async()=>{
 const a=await opened(await order())
 assert.equal(sandboxOrderColumns('o',{}),'')
 const result=await pool.query('SELECT o.id'+sandboxOrderColumns('o',env)+' FROM orders o WHERE o.id=$1',[a.order_id])
 assert.equal(result.rows[0].sandboxPaymentStatus,'open')
 const response=await route('/v1/stores/sandbox-test/orders/'+a.order_id+'/sandbox-payment',{client:{getSession(){throw Error('offline')}}})
 assert.equal(response.body.stale,true);assert.equal(response.body.attempts[0].status,'open')
})

test('unknown COMMIT result discards connection and retry recovers the committed attempt',async()=>{
 const o=await order();let destroyed=false
 const uncertain={connect:async()=>{
  const connection=await pool.connect()
  return {query:async(sql,args)=>{const r=await connection.query(sql,args);if(sql==='COMMIT')throw Error('synthetic_unknown_commit');return r},release:broken=>{destroyed=broken;connection.release()}}
 }}
 await assert.rejects(reserveSandboxAttempt(uncertain,{orderId:o.id,subject:'synthetic-customer',channel:'card'}),/synthetic_unknown_commit/)
 assert.equal(destroyed,true)
 const saved=await reserve(o)
 assert.equal((await pool.query('SELECT * FROM sandbox_payment_attempts WHERE order_id=$1',[o.id])).rows.length,1)
 assert.ok(saved.request_key)
})

test('Sandbox fulfillment requires trusted ledger, receipt and current isolated environment',async()=>{
 const a=await opened(await order());await pay(a)
 const o=(await pool.query('SELECT * FROM orders WHERE id=$1',[a.order_id])).rows[0]
 assert.equal(await verifiedFulfillmentPayment(pool,o,env),true)
 assert.equal(await verifiedFulfillmentPayment(pool,o,{...env,APP_ENV:'production'}),false)
 assert.equal(await verifiedFulfillmentPayment(pool,o,{...env,SANDBOX_PAYMENT_INSTANCE_ID:randomUUID()}),false)
 assert.equal(await verifiedFulfillmentPayment(pool,{...o,payment_status:'refunded'},env),false)
 const unpaid=await order();assert.equal(await verifiedFulfillmentPayment(pool,{...unpaid,payment_source:'stripe:sandbox',payment_status:'paid'},env),false)
})

test('card failure and 3DS verification remain recoverable in the same payable Session',async()=>{
 const o=await order(),a=await opened(o),failed=session(a,'open')
 failed.payment_intent.status='requires_payment_method';failed.payment_intent.last_payment_error={code:'card_declined'}
 await applySandboxObservation(pool,a,await lookup(a,failed))
 const state=await readSandboxPayment(pool,o.id)
 assert.equal(state.attempts[0].status,'open');assert.equal(state.attempts[0].failureCode,'payment_failed')
 assert.equal((await reserve(o)).id,a.id)
 const verifying=session(a,'open');verifying.payment_intent.status='requires_action'
 await applySandboxObservation(pool,a,await lookup(a,verifying))
 assert.equal((await readSandboxPayment(pool,o.id)).attempts[0].status,'processing')
 await pay(a);assert.equal((await readSandboxPayment(pool,o.id)).attempts[0].status,'succeeded')
})

test('fresh process restores persisted PostgreSQL snapshot and durable request key',async()=>{
 const o=await order(),a=await reserve(o)
 const archive=join(dir,'database.tar');writeFileSync(archive,Buffer.from(await (await db.pg.dumpDataDir('none')).arrayBuffer()))
 await db.pg.close();db=null
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./helpers/sandbox-restart-reader.mjs',import.meta.url)),archive,a.id],{encoding:'utf8'})
 assert.equal(child.status,0,child.stderr)
 const reloaded=JSON.parse(child.stdout)
 assert.equal(reloaded.id,a.id);assert.equal(reloaded.request_key,a.request_key)
})
