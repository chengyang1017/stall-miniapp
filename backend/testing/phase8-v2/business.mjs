// Runs ONLY behind the V2 ready/identity/image/grant gates. All SQL is real pg;
// business algorithms are imported from src, never reimplemented here.
// Per-case UUID tenants, no DELETE/TRUNCATE/DROP or audit-trigger bypass.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {checkoutRoute} from '../../src/checkout.mjs'
import {orderWorkflowRoute} from '../../src/orderWorkflow.mjs'
import {sweepInventory} from '../../src/inventory.mjs'
import {fixture} from './fixture.mjs'
import {check,UUID} from './policy.mjs'

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
async function bounded(p,ms=7000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('bounded_wait'),{code:'TEST_TIMEOUT'})),ms)})])}finally{clearTimeout(timer)}}
function request(token,body,method='POST',key='retry_'+randomUUID().replaceAll('-','')){
 const raw=JSON.stringify(body)
 return {method,headers:{authorization:'Bearer '+token,'idempotency-key':key,'content-length':String(Buffer.byteLength(raw))},async *[Symbol.asyncIterator](){yield Buffer.from(raw)}}
}
async function call(route,pool,path,token,body={},method='POST',key){
 const res={status:null,body:null,writeHead(status){this.status=status},end(raw){this.body=JSON.parse(raw)}}
 assert.equal(await route(request(token,body,method,key),res,new URL('http://isolated.invalid'+path),pool),true)
 assert.notEqual(res.status,null);return res
}
// Hooks coordinate real locks or inject a real SQL error / lost transport result.
// Every original query is forwarded unchanged, never answered with synthetic rows.
function intercepted(pool,after){return {query:(s,a)=>pool.query(s,a),async connect(){const c=await pool.connect();return {query:async(s,a)=>{const r=await c.query(s,a);await after(String(s),a,c,r);return r},release:e=>c.release(e)}}}}
async function seed(pool,{quantity=3,mode='finite'}={}){
 const id=randomUUID(),other=randomUUID(),merchant=randomUUID(),owner='p8owner:'+randomUUID(),customer='p8customer:'+randomUUID()
 const slug='p8-'+id,otherSlug='p8-'+other,products=[randomUUID(),randomUUID()].sort(),tokens={}
 const c=await pool.connect()
 try{
  await c.query('BEGIN')
  await c.query('INSERT INTO merchants(id,display_name) VALUES($1,$2)',[merchant,'isolated integration fixture'])
  await c.query('INSERT INTO stores(id,merchant_id,slug,name,is_active) VALUES($1,$3,$4,$6,true),($2,$3,$5,$6,true)',[id,other,merchant,slug,otherSlug,'isolated integration fixture'])
  await c.query("INSERT INTO merchant_members(merchant_id,external_subject,role) VALUES($1,$2,'owner')",[merchant,owner])
  for(const [name,subject]of Object.entries({owner,customer,second:'p8customer:'+randomUUID()})){
   const token=randomBytes(32).toString('base64url');tokens[name]=token
   await c.query("INSERT INTO auth_sessions(token_hash,external_subject,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",[createHash('sha256').update(token).digest('hex'),subject])
  }
  const rules={accepting:true,days:Array.from({length:7},()=>({enabled:true,start:'00:00',end:'23:59'})),areas:[{id:'area',name:'Integration area',enabled:true,latitude:null,longitude:null,radiusMeters:null}],slots:[{id:'slot',label:'Integration slot',enabled:true,start:'00:00',end:'23:59'}]}
  await c.query('INSERT INTO store_delivery_rules(store_id,configuration) VALUES($1,$2::jsonb)',[id,JSON.stringify(rules)])
  for(const product of products)await c.query('INSERT INTO products(id,store_id,name,price_cents,stock_mode,stock_quantity) VALUES($1,$2,$3,1500,$4,$5)',[product,id,'Integration product',mode,mode==='finite'?quantity:0])
  const date=(await c.query("SELECT to_char((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')+interval '1 day','YYYY-MM-DD') AS date")).rows[0].date
  await c.query('COMMIT')
  const body={items:[{productId:products[0],quantity:1}],address:{receiverName:'Integration fixture',phone:'13800000000',areaId:'area',detail:'Isolated test only'},slot:{id:'slot',date},note:''}
  const place=(p=pool,b=body,key,token=tokens.customer)=>call(checkoutRoute,p,`/v1/stores/${slug}/orders`,token,b,'POST',key)
  const status=(orderId,next='cancelled',p=pool,store=slug)=>call(orderWorkflowRoute,p,`/v1/merchant/stores/${store}/orders/${orderId}/status`,tokens.owner,{status:next,reason:'integration cancellation'},'POST')
  const state=async()=>({products:(await pool.query('SELECT id,stock_quantity,sold_out FROM products WHERE store_id=$1 ORDER BY id',[id])).rows,
   orders:(await pool.query('SELECT * FROM orders WHERE store_id=$1 ORDER BY id',[id])).rows,
   items:(await pool.query('SELECT i.* FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.store_id=$1',[id])).rows,
   reservations:(await pool.query('SELECT * FROM inventory_reservations WHERE store_id=$1',[id])).rows,
   movements:(await pool.query('SELECT * FROM inventory_movements WHERE store_id=$1 ORDER BY created_at,id',[id])).rows,
   events:(await pool.query('SELECT * FROM order_status_events WHERE store_id=$1',[id])).rows})
  return {id,other,slug,otherSlug,products,tokens,body,place,status,state}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
const ok=(r,status=201)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body.orderId}
async function empty(s,pool,quantity=3){const x=await s.state();assert.equal(x.orders.length,0);assert.equal(x.items.length,0);assert.equal(x.reservations.length,0);assert.equal(x.movements.length,0);assert.equal(x.events.length,0);assert(x.products.every(p=>p.stock_quantity===quantity));return x}
async function released(s){const x=await s.state();assert.equal(x.orders[0].inventory_state,'released');assert.equal(x.orders[0].fulfillment_status,'cancelled');assert.equal(x.reservations[0].state,'released');assert.equal(x.products[0].stock_quantity,3);assert.equal(x.movements.length,2);assert.equal(x.movements.reduce((n,m)=>n+m.delta,0),0);assert.equal(x.events.length,1);return x}
async function expire(s,pool){await pool.query("UPDATE orders SET inventory_expires_at=clock_timestamp()-interval '1 minute' WHERE store_id=$1",[s.id])}
async function concurrentPlace(s,pool,f,{sameKey=false,changed=false}={}){
 return f.connections(async x=>{
  const locked=deferred(),release=deferred(),key='race_'+randomUUID().replaceAll('-','');let held=false
  const first=intercepted(x.firstPool,async sql=>{if(!held&&sql.includes('ORDER BY p.id FOR UPDATE')){held=true;locked.resolve();await bounded(release.promise)}})
  const a=s.place(first,s.body,key)
  // Observe early failure rather than leave a pending route unhandled.
  a.catch(()=>{});let b
  try{
   await bounded(Promise.race([locked.promise,a.then(()=>{throw Error('expected_product_lock')})]))
   b=s.place(x.secondPool,changed?{...s.body,items:[{productId:s.products[0],quantity:2}]}:s.body,sameKey?key:undefined,sameKey?s.tokens.customer:s.tokens.second);b.catch(()=>{})
   await f.waitForBlocked(x.observer,x.pids[1],x.pids[0]);release.resolve()
   return await bounded(Promise.all([a,b]))
  }finally{release.resolve();await Promise.allSettled([a,...b?[b]:[]])}
 })
}
const cases=[]
const add=(name,run)=>cases.push(Object.freeze({name,run}))
add('same key serial retry creates one order and one reservation',async(pool)=>{
 const s=await seed(pool),key='serial_'+randomUUID().replaceAll('-',''),a=await s.place(pool,s.body,key),b=await s.place(pool,s.body,key)
 assert.equal(ok(a),ok(b,200));const x=await s.state();assert.equal(x.orders.length,1);assert.equal(x.items.length,1);assert.equal(x.reservations.length,1);assert.equal(x.movements.length,1);assert.equal(x.products[0].stock_quantity,2);assert.equal(x.orders[0].payment_status,'unpaid');assert.equal(Number(x.orders[0].total_cents),1500)
})
for(const changed of [false,true])add(changed?'concurrent same key different payload conflicts without extra decrement':'concurrent same key waits and returns one committed order',async(pool,f)=>{
 const s=await seed(pool),r=await concurrentPlace(s,pool,f,{sameKey:true,changed});ok(r[0]);assert.equal(r[1].status,changed?409:200)
 if(changed)assert.equal(r[1].body.error,'idempotency_key_reused');else assert.equal(r[0].body.orderId,r[1].body.orderId)
 const x=await s.state();assert.equal(x.orders.length,1);assert.equal(x.items.length,1);assert.equal(x.reservations.length,1);assert.equal(x.movements.length,1);assert.equal(x.products[0].stock_quantity,2)
})
add('two customers contend for last item using observed PostgreSQL row blocking',async(pool,f)=>{
 const s=await seed(pool,{quantity:1}),r=await concurrentPlace(s,pool,f);assert.deepEqual(r.map(x=>x.status),[201,409]);assert.equal(r[1].body.error,'insufficient_stock')
 const x=await s.state();assert.equal(x.products[0].stock_quantity,0);assert.equal(x.orders.length,1);assert.equal(x.reservations.length,1);assert.equal(x.movements.length,1)
})
add('many simultaneous requests cannot oversell available stock',async(pool)=>{
 const s=await seed(pool,{quantity:2}),r=await Promise.all(Array.from({length:6},()=>s.place()))
 assert.equal(r.filter(x=>x.status===201).length,2);assert(r.filter(x=>x.status!==201).every(x=>x.status===409&&x.body.error==='insufficient_stock'))
 const x=await s.state();assert.equal(x.products[0].stock_quantity,0);assert.equal(x.orders.length,2);assert.equal(x.items.length,2);assert.equal(x.reservations.reduce((n,r)=>n+r.quantity,0),2);assert.equal(x.movements.reduce((n,m)=>n+m.delta,0),-2)
})
add('insufficient stock rejects without any partial order',async(pool)=>{const s=await seed(pool),r=await s.place(pool,{...s.body,items:[{productId:s.products[0],quantity:4}]});assert.equal(r.status,409);assert.equal(r.body.error,'insufficient_stock');await empty(s,pool)})
add('multi-product insufficiency rolls back every product and order line',async(pool)=>{
 const s=await seed(pool),r=await s.place(pool,{...s.body,items:s.products.map((productId,i)=>({productId,quantity:i?4:1}))});assert.equal(r.status,409);await empty(s,pool)
})
add('product delisted during checkout lock wait is not purchased',async(pool,f)=>{
 const s=await seed(pool)
 await f.connections(async x=>{
  await x.first.query('BEGIN');await x.first.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[s.products[0]])
  const pending=s.place(x.secondPool);pending.catch(()=>{})
  try{await f.waitForBlocked(x.observer,x.pids[1],x.pids[0]);await x.first.query('UPDATE products SET active=false WHERE id=$1',[s.products[0]]);await x.first.query('COMMIT');const r=await bounded(pending);assert.equal(r.status,409);assert.equal(r.body.error,'product_unavailable')}
  finally{await x.first.query('ROLLBACK').catch(()=>{});await Promise.allSettled([pending])}
 });await empty(s,pool)
})
for(const at of ['INSERT INTO order_items','UPDATE products SET stock_quantity=stock_quantity-$3'])add('real SQL failure after '+at+' rolls back and same key can retry',async(pool)=>{
 const s=await seed(pool),key='fault_'+randomUUID().replaceAll('-','');let injected=false
 const faulty=intercepted(pool,async(sql,_a,c)=>{if(!injected&&sql.startsWith(at)){injected=true;await c.query('SELECT 1/0')}})
 await assert.rejects(()=>s.place(faulty,s.body,key),e=>e.code==='22012');assert.equal(injected,true);await empty(s,pool)
 ok(await s.place(pool,s.body,key));const x=await s.state();assert.equal(x.orders.length,1);assert.equal(x.reservations.length,1);assert.equal(x.movements.length,1)
})
add('successful COMMIT with lost result is reconciled by retry key',async(pool)=>{
 const s=await seed(pool),key='commit_'+randomUUID().replaceAll('-','');let committed=false
 // sweepInventory also COMMITs; target only the checkout transaction after INSERT.
 let inserting=false
 const lost=intercepted(pool,async sql=>{if(sql.startsWith('INSERT INTO orders('))inserting=true;if(inserting&&!committed&&sql==='COMMIT'){committed=true;throw Object.assign(Error('controlled_lost_commit_result'),{code:'ECONNRESET'})}})
 await assert.rejects(()=>s.place(lost,s.body,key),e=>e.code==='ECONNRESET');assert.equal(committed,true)
 const before=await s.state();assert.equal(before.orders.length,1);const r=await s.place(pool,s.body,key);assert.equal(ok(r,200),before.orders[0].id)
 const x=await s.state();assert.equal(x.products[0].stock_quantity,2);assert.equal(x.movements.length,1);assert.equal(x.items.length,1);assert.equal(x.reservations.length,1)
})
add('expiry workers compete without releasing stock twice',async(pool)=>{
 const s=await seed(pool);ok(await s.place());await expire(s,pool);await Promise.all([sweepInventory(pool),sweepInventory(pool)]);await sweepInventory(pool)
 const x=await released(s);assert.equal(x.events[0].note,'未支付预留超过15分钟，释放库存');assert.equal(x.movements[1].source,'expiry')
})
add('terminated checkout connection rolls back real stock and permits safe retry',async(pool,f)=>{
 const s=await seed(pool),key='terminate_'+randomUUID().replaceAll('-','');let terminated=false
 await f.connections(async x=>{
  const killed=intercepted(x.firstPool,async sql=>{if(!terminated&&sql.startsWith('UPDATE products SET stock_quantity=stock_quantity-$3')){
   const r=await x.second.query('SELECT pg_terminate_backend($1,1000) AS stopped',[x.pids[0]]);assert.equal(r.rows[0].stopped,true);terminated=true
  }})
  await assert.rejects(()=>s.place(killed,s.body,key),e=>['57P01','08006','ECONNRESET'].includes(e.code)||e.phase8Code==='phase8_connection_released')
 });assert.equal(terminated,true);await empty(s,pool);ok(await s.place(pool,s.body,key))
 const x=await s.state();assert.equal(x.orders.length,1);assert.equal(x.movements.length,1);assert.equal(x.products[0].stock_quantity,2)
})
add('opposite cart order uses consistent product lock order without deadlock',async(pool,f)=>{
 const s=await seed(pool);s.body.items=s.products.map(productId=>({productId,quantity:1}))
 const original=s.place;s.place=(p,b,key,token)=>original(p,b&&token===s.tokens.second?{...b,items:[...b.items].reverse()}:b,key,token)
 const r=await concurrentPlace(s,pool,f);assert(r.every(v=>v.status===201))
 const x=await s.state();assert(x.products.every(p=>p.stock_quantity===1));assert.equal(x.orders.length,2);assert.equal(x.items.length,4);assert.equal(x.reservations.length,4);assert.equal(x.movements.length,4)
})
add('concurrent accept serializes an explicitly paid test fixture without duplicate commit',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place())
 // Isolated state-machine fixture, NOT a trusted payment or WeChat-pay test.
 await pool.query("UPDATE orders SET payment_status='paid' WHERE store_id=$1 AND id=$2",[s.id,id])
 const r=await Promise.all([s.status(id,'accepted'),s.status(id,'accepted')]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409])
 const x=await s.state();assert.equal(x.orders[0].fulfillment_status,'accepted');assert.equal(x.orders[0].inventory_state,'committed');assert.equal(x.reservations[0].state,'committed');assert.equal(x.products[0].stock_quantity,2);assert.equal(x.events.length,1);assert.equal(x.movements.filter(m=>m.delta<0).length,1)
})
add('two concurrent cancellations create one event and one release',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place()),r=await Promise.all([s.status(id),s.status(id)])
 assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);await released(s)
})
add('cancellation racing expiry commits one release atomically',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place());await expire(s,pool);await Promise.all([s.status(id),sweepInventory(pool)]);await released(s)
})
for(const mode of ['finite','unlimited'])add('unpaid '+mode+' order cannot be accepted',async(pool)=>{
 const s=await seed(pool,{mode}),id=ok(await s.place()),r=await s.status(id,'accepted');assert.equal(r.status,409);assert.equal(r.body.error,'payment_not_confirmed')
 const x=await s.state();assert.equal(x.orders[0].fulfillment_status,'new');assert.equal(x.events.length,0);assert.equal(x.products[0].stock_quantity,mode==='finite'?2:0)
})
add('merchant cannot change order through another store path',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place()),r=await s.status(id,'cancelled',pool,s.otherSlug);assert.equal(r.status,404)
 const x=await s.state();assert.equal(x.orders[0].fulfillment_status,'new');assert.equal(x.products[0].stock_quantity,2);assert.equal(x.events.length,0)
})
add('unrelated merchant identity is rejected before changing another tenant',async(pool)=>{
 const s=await seed(pool),stranger=await seed(pool),id=ok(await s.place())
 const r=await call(orderWorkflowRoute,pool,`/v1/merchant/stores/${s.slug}/orders/${id}/status`,stranger.tokens.owner,{status:'cancelled',reason:'integration'})
 assert.equal(r.status,403);const x=await s.state();assert.equal(x.orders[0].fulfillment_status,'new');assert.equal(x.events.length,0);assert.equal(x.products[0].stock_quantity,2)
})
add('database unique index independently rejects duplicate retry key',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place())
 await assert.rejects(()=>pool.query('INSERT INTO orders(store_id,customer_subject,subtotal_cents,total_cents,checkout_key,checkout_fingerprint) SELECT store_id,customer_subject,subtotal_cents,total_cents,checkout_key,checkout_fingerprint FROM orders WHERE id=$1',[id]),e=>e.code==='23505')
 const x=await s.state();assert.equal(x.orders.length,1);assert.equal(x.items.length,1);assert.equal(x.reservations.length,1);assert.equal(x.products[0].stock_quantity,2)
})
add('customer cannot read another customer order',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place());const path=`/v1/stores/${s.slug}/orders/${id}`
 assert.equal((await call(orderWorkflowRoute,pool,path,s.tokens.second,{},'GET')).status,404)
 assert.equal((await call(orderWorkflowRoute,pool,path,s.tokens.customer,{},'GET')).status,200)
})
add('CHECK and composite foreign key constraints reject invalid inventory',async(pool)=>{
 const s=await seed(pool),id=ok(await s.place())
 await assert.rejects(()=>pool.query('UPDATE products SET stock_quantity=-1 WHERE id=$1',[s.products[0]]),e=>e.code==='23514')
 await assert.rejects(()=>pool.query('INSERT INTO inventory_reservations(store_id,order_id,product_id,quantity) VALUES($1,$2,$3,1)',[s.other,id,s.products[1]]),e=>e.code==='23503')
 const x=await s.state();assert.equal(x.products[0].stock_quantity,2);assert.equal(x.reservations.length,1)
})
add('SKIP LOCKED skips a genuinely eligible locked expired order',async(pool,f)=>{
 const s=await seed(pool),one=ok(await s.place()),two=ok(await s.place());await expire(s,pool)
 await f.connections(async x=>{
  await x.first.query('BEGIN');await x.first.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[one])
  try{await bounded(sweepInventory(x.secondPool,1));const rows=(await x.observer.query('SELECT id,inventory_state FROM orders WHERE store_id=$1',[s.id])).rows
   assert.equal(rows.find(r=>r.id===one).inventory_state,'held');assert.equal(rows.find(r=>r.id===two).inventory_state,'released')}
  finally{await x.first.query('ROLLBACK')}
 });await sweepInventory(pool);const x=await s.state();assert.equal(x.products[0].stock_quantity,3);assert(x.reservations.every(r=>r.state==='released'));assert.equal(x.movements.length,4)
})
add('real deadlock yields 40P01 and both transactions leave no stock change',async(pool,f)=>{
 const s=await seed(pool)
 await f.connections(async x=>{
  await x.first.query('BEGIN');await x.second.query('BEGIN')
  await x.first.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[s.products[0]])
  await x.second.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[s.products[1]])
  const attempt=async(c,id)=>{try{await c.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[id]);return {ok:true}}catch(e){return {code:e.code}}finally{await c.query('ROLLBACK').catch(()=>{})}}
  const a=attempt(x.first,s.products[1]);a.catch(()=>{})
  try{await f.waitForBlocked(x.observer,x.pids[0],x.pids[1]);const r=await bounded(Promise.all([a,attempt(x.second,s.products[0])]))
   assert.equal(r.filter(v=>v.code==='40P01').length,1);assert.equal(r.filter(v=>v.ok).length,1)}
  finally{await x.first.query('ROLLBACK').catch(()=>{});await x.second.query('ROLLBACK').catch(()=>{});await Promise.allSettled([a])}
 });await empty(s,pool)
})

export const BUSINESS_CASES=Object.freeze(cases)
export async function runBusiness(pool,g){
 check(g.purpose==='business'&&g.role==='app'&&g.scope==='business-consistency-v1'&&UUID.test(g.runId||''),'business_scope_rejected')
 const f=fixture(pool,g),results=[]
 for(const item of BUSINESS_CASES){
  const started=performance.now()
  try{await item.run(pool,f);results.push({name:item.name,status:'passed',milliseconds:Math.round(performance.now()-started)})}
  catch(e){results.push({name:item.name,status:'failed',code:/^[0-9A-Z_]{5,30}$/.test(e.code||'')?e.code:'ASSERTION_OR_TRANSPORT',milliseconds:Math.round(performance.now()-started)})}
 }
 return {status:'business_finished',ready:true,namespace:'p8r2_'+g.runId.replaceAll('-',''),passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,skipped:0,results}
}
