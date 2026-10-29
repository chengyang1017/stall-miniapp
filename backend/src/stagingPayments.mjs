import { createHash } from 'node:crypto'
import { authenticate, bearerToken } from './auth.mjs'
import { resolveOrderInventory } from './inventory.mjs'
import {runtimeDeployment,reviewedDeployments,assertDatabaseIdentity} from './stagingDeployment.mjs'
import {inspectRuntimePrivileges} from './stagingPermissions.mjs'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const instanceId=env=>String(env.STAGING_PAYMENT_INSTANCE_ID||'').toLowerCase()
export function simulationConfigured(env=process.env,profiles=reviewedDeployments){
 return !!runtimeDeployment(env,profiles)
}
// A copied simulated row must never authorize production fulfillment.
export function paymentAllowsFulfillment(order,env=process.env,profiles=reviewedDeployments){
 return order.payment_status==='paid'&&(order.payment_source!=='staging_simulated'||simulationConfigured(env,profiles)&&order.simulation_instance_id===instanceId(env))
}
export async function verifiedFulfillmentPayment(db,order,env=process.env,profiles=reviewedDeployments){
 if(!paymentAllowsFulfillment(order,env,profiles))return false
 if(order.payment_source==='staging_simulated'){
  const p=runtimeDeployment(env,profiles)
  await assertDatabaseIdentity(db,p)
  if((await db.query('SELECT current_user AS role')).rows[0]?.role!==p.applicationRole)return false
 }
 return true
}
const fail=(status,message)=>Object.assign(Error(message),{status})
async function authorization(db,req,subject,storeId,env,profiles){
 const profile=runtimeDeployment(env,profiles)
 if(!profile)throw fail(404,'not_found')
 await assertDatabaseIdentity(db,profile)
 const role=await db.query('SELECT current_user AS role')
 if(role.rows[0]?.role!==profile.applicationRole)throw fail(403,'staging_runtime_role_rejected')
 try{await inspectRuntimePrivileges(db,profile)}catch(error){
  if(error.code==='42501'||/^staging_.*(?:privilege|roles_required)/.test(error.message||''))throw Object.assign(Error('staging_database_privileges_required'),{code:'42501'})
  throw error
 }
 if(!/^wx:[A-Za-z0-9]+:[A-Za-z0-9_-]+$/.test(subject))throw fail(403,'test_authorization_required')
 // Recheck and lock live session + grant inside the same transaction as confirmation.
 const token=bearerToken(req)
 const session=await db.query(`SELECT external_subject FROM auth_sessions WHERE token_hash=$1 AND external_subject=$2
  AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE`,[createHash('sha256').update(token||'').digest('hex'),subject])
 if(!session.rows.length)throw fail(401,'login_required')
 const {rows}=await db.query(`SELECT e.instance_id FROM staging_payment_environment e JOIN staging_payment_testers t ON t.instance_id=e.instance_id
  JOIN stores s ON s.id=t.store_id WHERE e.singleton=true AND e.enabled=true AND e.environment='staging'
  AND e.database_name=current_database() AND e.instance_id=$1 AND t.store_id=$2 AND t.customer_subject=$3
  AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp() AND s.is_active=true FOR SHARE OF e,t,s`,[instanceId(env),storeId,subject])
 if(!rows.length)throw fail(403,'test_authorization_required')
}
export async function stagingPaymentRoute(req,res,url,pool,env=process.env,profiles=reviewedDeployments){
 const match=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/orders\/([a-f0-9-]{36})\/staging-payment$/.exec(url.pathname)
 if(!match)return false
 const send=(status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
 if(!simulationConfigured(env,profiles)){send(404,{error:'not_found'});return true}
 if(!['GET','POST'].includes(req.method)){send(405,{error:'method_not_allowed'});return true}
 if(!uuid.test(match[2])||url.search){send(400,{error:'invalid_request'});return true}
 const subject=await authenticate(pool,req)
 if(!subject){send(401,{error:'login_required'});return true}
 let body
 if(req.method==='POST'){
  let raw=''
  try{if(Number(req.headers['content-length']||0)>512)throw Error();for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>512)throw Error()}body=JSON.parse(raw)
   if(!body||Array.isArray(body)||Object.keys(body).length!==1||!uuid.test(body.requestKey||''))throw Error()
   body.requestKey=body.requestKey.toLowerCase()
  }catch{send(400,{error:'invalid_test_confirmation'});return true}
 }
 const client=await pool.connect();let open=false,broken=false
 try{
  await client.query('BEGIN');open=true
  await client.query("SET LOCAL statement_timeout='5000ms'")
  // Discover only this customer's order; the authoritative lookup below locks it.
  const store=await client.query(`SELECT o.store_id FROM orders o JOIN stores s ON s.id=o.store_id
   WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3`,[match[1],match[2],subject])
  if(!store.rows.length)throw fail(404,'order_not_found')
  const storeId=store.rows[0].store_id
  await authorization(client,req,subject,storeId,env,profiles)
  if(body)await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[storeId,subject+':sim:'+body.requestKey])
  const result=await client.query(`SELECT *, (inventory_expires_at<=clock_timestamp() OR created_at+interval '15 minutes'<=clock_timestamp()) AS payment_expired
   FROM orders WHERE store_id=$1 AND id=$2 AND customer_subject=$3 FOR UPDATE`,[storeId,match[2],subject])
  const order=result.rows[0];if(!order)throw fail(404,'order_not_found')
  const same=order.payment_source==='staging_simulated'&&order.simulation_instance_id===instanceId(env)
  const eligible=order.payment_status==='unpaid'&&order.fulfillment_status==='new'&&!order.payment_expired&&['held','none'].includes(order.inventory_state)
  if(!body){await client.query('COMMIT');open=false;send(200,{authorized:true,eligible,simulated:same&&order.payment_status==='paid',label:'仅Staging模拟确认，不涉及资金到账'});return true}
  const prior=await client.query('SELECT order_id FROM staging_payment_confirmations WHERE store_id=$1 AND actor_subject=$2 AND request_key=$3',[storeId,subject,body.requestKey])
  if(prior.rows.length&&prior.rows[0].order_id!==order.id)throw fail(409,'test_request_key_reused')
  if(same&&order.payment_status==='paid'){
   const audit=await client.query('SELECT order_id,request_key FROM staging_payment_confirmations WHERE order_id=$1 AND instance_id=$2',[order.id,instanceId(env)])
   if(!audit.rows.length)throw fail(409,'simulation_audit_missing')
   if(audit.rows[0].request_key!==body.requestKey)throw fail(409,'simulation_confirmation_key_changed_refresh_order')
   if(['cancelled','abnormal'].includes(order.fulfillment_status))throw fail(409,'order_not_payable')
   await client.query('COMMIT');open=false;send(200,{ok:true,simulated:true,replayed:true,orderId:order.id});return true
  }
  if(!eligible)throw fail(409,order.payment_expired?'payment_window_expired':'order_not_payable')
  const holds=await client.query(`SELECT i.product_id,i.quantity,r.quantity AS reserved_quantity,r.state FROM order_items i
   JOIN products p ON p.store_id=$1 AND p.id=i.product_id LEFT JOIN inventory_reservations r ON r.store_id=$1 AND r.order_id=i.order_id AND r.product_id=i.product_id
   WHERE i.order_id=$2 AND p.stock_mode='finite' ORDER BY p.id FOR UPDATE OF p`,[storeId,order.id])
  if(order.inventory_state==='held'&&(!holds.rows.length||holds.rows.some(r=>r.state!=='held'||r.quantity!==r.reserved_quantity))||order.inventory_state==='none'&&holds.rows.length)throw fail(409,'inventory_reservation_inconsistent')
  const amount=Number(order.total_cents);if(!Number.isSafeInteger(amount)||amount<0||order.currency!=='CNY')throw fail(409,'invalid_order_amount')
  // Product lock waits must not extend payment/grant expiry. Recheck using DB time.
  await authorization(client,req,subject,storeId,env,profiles)
  const fresh=await client.query(`SELECT (created_at+interval '15 minutes'>clock_timestamp() AND (inventory_expires_at IS NULL OR inventory_expires_at>clock_timestamp())) AS valid FROM orders WHERE store_id=$1 AND id=$2`,[storeId,order.id])
  if(fresh.rows[0]?.valid!==true)throw fail(409,'payment_window_expired')
  await client.query(`INSERT INTO staging_payment_confirmations(order_id,store_id,instance_id,actor_subject,request_key,amount_cents) VALUES($1,$2,$3,$4,$5,$6)`,[order.id,storeId,instanceId(env),subject,body.requestKey,amount])
  await client.query(`INSERT INTO payment_events(order_id,provider,provider_event_id,event_type,amount_cents) VALUES($1,'staging_simulated',$2,'simulation_confirmed',$3)`,[order.id,'staging:'+order.id,amount])
  await client.query(`UPDATE orders SET payment_status='paid',payment_source='staging_simulated',simulation_instance_id=$3,paid_at=clock_timestamp(),updated_at=clock_timestamp() WHERE store_id=$1 AND id=$2`,[storeId,order.id,instanceId(env)])
  await resolveOrderInventory(client,{...order,payment_status:'paid'},'committed','payment',subject,'Staging模拟支付确认；不涉及真实收款，预留转正式扣减，不再次扣库存')
  await client.query('COMMIT');open=false
  send(200,{ok:true,simulated:true,replayed:false,orderId:order.id})
 }catch(error){
  if(open)try{await client.query('ROLLBACK');open=false}catch{broken=true}
  if(error.status||error.inventoryError)send(error.status||409,{error:error.message})
  else{broken=true;send(503,{error:error.code==='42501'?'staging_database_privileges_required':error.code==='42P01'?'staging_identity_or_migration_required':'test_confirmation_unknown_refresh_before_retry'})}
 }finally{client.release(broken)}
 return true
}
