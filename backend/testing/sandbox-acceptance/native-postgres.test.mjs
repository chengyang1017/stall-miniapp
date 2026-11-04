// Opt-in native PostgreSQL only. Never imported by offline verification.
// Requires an EMPTY, operator-migrated dedicated database. Retains synthetic evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {nativeTestConfiguration} from './guards.mjs'
import {assertSandboxDatabase} from '../../src/sandboxPaymentWorker.mjs'
import {reserveSandboxAttempt,materializeSandboxAttempt,applySandboxObservation,requestSandboxRefund} from '../../src/sandboxPaymentStore.mjs'
import {createStripeSandboxClient} from '../../src/stripeSandboxClient.mjs'
import {processOneStripeTestRefund} from '../../src/stripeTestRefundJobs.mjs'

test('native PG independent connections: reservation, locks, rollback, settlement and refund claims',async()=>{
 const pool=new Pool(nativeTestConfiguration(process.env))
 try{
  await assertSandboxDatabase(pool,process.env)
  const identity=(await pool.query('SELECT current_database() AS db,current_user AS role')).rows[0]
  assert.equal(identity.db,process.env.SBX_EXPECT_DATABASE);assert.equal(identity.role,process.env.SBX_EXPECT_ROLE)
  // Prevent claiming or mutating any pre-existing business/worker records.
  for(const table of ['orders','stores','stripe_test_refund_jobs'])assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n,0,'requires empty dedicated database')
  const a=await pool.connect(),b=await pool.connect()
  try{assert.notEqual((await a.query('SELECT pg_backend_pid() AS p')).rows[0].p,(await b.query('SELECT pg_backend_pid() AS p')).rows[0].p)}finally{a.release();b.release()}
  const m=(await pool.query("INSERT INTO merchants(display_name) VALUES('SBX synthetic') RETURNING id")).rows[0].id
  const s=(await pool.query("INSERT INTO stores(merchant_id,slug,name,is_active) VALUES($1,$2,'SBX synthetic',true) RETURNING id",[m,'sbx-'+randomUUID()])).rows[0].id
  const p=(await pool.query("INSERT INTO products(store_id,name,price_cents,stock_mode,stock_quantity) VALUES($1,'SBX synthetic',1000,'finite',7) RETURNING id",[s])).rows[0].id
  const o=(await pool.query("INSERT INTO orders(store_id,customer_subject,subtotal_cents,total_cents,inventory_state,inventory_expires_at) VALUES($1,'sbx-synthetic',1000,1000,'held',now()+interval '1 hour') RETURNING id",[s])).rows[0].id
  await pool.query("INSERT INTO order_items(order_id,product_id,product_name,unit_price_cents,quantity) VALUES($1,$2,'SBX synthetic',1000,1)",[o,p])
  await pool.query('INSERT INTO inventory_reservations(store_id,order_id,product_id,quantity) VALUES($1,$2,$3,1)',[s,o,p])
  const reserve=()=>reserveSandboxAttempt(pool,{orderId:o,subject:'sbx-synthetic',channel:'card'})
  const attempts=await Promise.all(Array.from({length:6},reserve));assert.equal(new Set(attempts.map(x=>x.id)).size,1)
  await assert.rejects(pool.query("INSERT INTO sandbox_payment_attempts(order_id,channel,amount_cents,currency,request_key,expires_at) VALUES($1,'card',1000,'CNY',$2,now())",[o,randomUUID()]),e=>e.code==='23505')
  const lock=await pool.connect(),contender=await pool.connect()
  try{
   await lock.query('BEGIN');await lock.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[o])
   await contender.query('BEGIN');await contender.query("SET LOCAL lock_timeout='200ms'")
   await assert.rejects(contender.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[o]),e=>e.code==='55P03')
  }finally{await contender.query('ROLLBACK');await lock.query('ROLLBACK');lock.release();contender.release()}
  const attempt=await materializeSandboxAttempt(pool,{create:async()=>({sessionId:'cs_test_'+randomUUID().replaceAll('-',''),url:'https://checkout.stripe.com/test'})},attempts[0])
  const session={id:attempt.session_id,object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',currency:'cny',amount_total:1000,client_reference_id:o,metadata:{orderId:o},payment_intent:{id:'pi_synthetic',livemode:false,status:'succeeded',amount:1000,currency:'cny',latest_charge:{created:1700000000,payment_method_details:{type:'card'}}}}
  const observation=await createStripeSandboxClient({STRIPE_TEST_SECRET_KEY:'sk_test_synthetic'},async()=>({ok:true,json:async()=>session})).getSession(attempt)
  // Force failure after event/order/inventory writes; all must roll back.
  const invalid={...observation,session:{...session,payment_intent:{...session.payment_intent,latest_charge:{...session.payment_intent.latest_charge,created:NaN}}}}
  await assert.rejects(applySandboxObservation(pool,attempt,invalid),/Invalid time/)
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_events WHERE order_id=$1',[o])).rows[0].n,0)
  assert.equal((await pool.query('SELECT payment_status FROM orders WHERE id=$1',[o])).rows[0].payment_status,'unpaid')
  assert.equal((await pool.query('SELECT state FROM inventory_reservations WHERE order_id=$1',[o])).rows[0].state,'held')
  for(const table of ['inventory_movements','sandbox_payment_receipts'])assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table+' WHERE order_id=$1',[o])).rows[0].n,0)
  await Promise.all(Array.from({length:4},()=>applySandboxObservation(pool,attempt,observation)))
  assert.equal((await pool.query('SELECT payment_status,inventory_state FROM orders WHERE id=$1',[o])).rows[0].payment_status,'paid')
  assert.equal((await pool.query('SELECT state FROM inventory_reservations WHERE order_id=$1',[o])).rows[0].state,'committed')
  for(const table of ['payment_events','inventory_movements','sandbox_payment_receipts'])assert.equal((await pool.query('SELECT count(*)::int AS n FROM '+table+' WHERE order_id=$1',[o])).rows[0].n,1)
  assert.equal(Number((await pool.query('SELECT stock_quantity FROM products WHERE id=$1',[p])).rows[0].stock_quantity),7)
  await requestSandboxRefund(pool,{orderId:o,subject:'sbx-owner',amountCents:250,requestKey:'sbx_'+randomUUID()})
  let calls=0
  const client={refundPayment:async()=>{calls++;return {refundId:'re_synthetic',paymentIntentId:'pi_synthetic',status:'succeeded',completed:true}}}
  await Promise.all(Array.from({length:4},()=>processOneStripeTestRefund(pool,client)))
  assert.equal(calls,1);assert.equal((await pool.query('SELECT status FROM stripe_test_refund_jobs')).rows[0].status,'succeeded')
  console.log('NATIVE_POSTGRES_SYNTHETIC_PROVIDER: passed; no Stripe transaction. Synthetic rows retained; use a fresh dedicated DB for rerun.')
 }finally{await pool.end()}
})
