import { createHash } from 'node:crypto'
import { authenticate } from './auth.mjs'
import { verifyDelivery } from './deliveryRules.mjs'
import { publishedSql } from './productPublishing.mjs'
import { sweepInventory, recordMovement, HOLD_MINUTES, stockError } from './inventory.mjs'

const slugRe = /^[a-z0-9][a-z0-9-]{1,62}$/
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const keyRe = /^[A-Za-z0-9_-]{20,100}$/
const headers = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
function reply(res,status,obj){res.writeHead(status,headers);res.end(JSON.stringify(obj))}
async function readPayload(req){
  if(Number(req.headers['content-length']||0)>16384) throw new Error('too_large')
  let body=''
  for await(const chunk of req){body+=chunk.toString('utf8');if(Buffer.byteLength(body)>16384)throw new Error('too_large')}
  try {return JSON.parse(body)}catch {throw new Error('invalid_json')}
}
function validItems(items){
  return Array.isArray(items)&&items.length>0&&items.length<=40&&items.every(i=>i&&uuidRe.test(i.productId)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=99)&&new Set(items.map(i=>i.productId)).size===items.length
}
function validAddress(a){return a&&typeof a==='object'&&typeof a.receiverName==='string'&&a.receiverName.trim().length>=1&&a.receiverName.length<=100&&typeof a.phone==='string'&&/^[+0-9 ()-]{6,24}$/.test(a.phone)&&typeof a.areaId==='string'&&a.areaId.length>=1&&a.areaId.length<=60&&typeof a.detail==='string'&&a.detail.trim().length>=1&&a.detail.length<=300}
function validSlot(s){return s&&typeof s==='object'&&typeof s.id==='string'&&s.id.length>=1&&s.id.length<=100&&typeof s.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)}
function fingerprint(obj){return createHash('sha256').update(JSON.stringify(obj)).digest('hex')}
export async function checkoutRoute(req,res,url,pool){
  const match=/^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/orders$/.exec(url.pathname)
  if(!match)return false
  if(req.method!=='POST'){reply(res,405,{error:'method_not_allowed'});return true}
  const slug=match[1]
  if(!slugRe.test(slug)){reply(res,400,{error:'invalid_store'});return true}
  const subject=await authenticate(pool,req)
  if(!subject){reply(res,401,{error:'login_required'});return true}
  let body
  try{body=await readPayload(req)}catch(e){reply(res,e.message==='too_large'?413:400,{error:'invalid_json'});return true}
  const key=req.headers['idempotency-key']
  if(typeof key!=='string'||!keyRe.test(key)||!body||!validItems(body.items)||!validAddress(body.address)||!validSlot(body.slot)){
    reply(res,400,{error:'invalid_checkout'});return true
  }
  if (typeof body.note !== 'string' || body.note.length > 200) { reply(res,400,{error:'invalid_note'});return true }
  const normalized={items:[...body.items].map(i=>({productId:i.productId.toLowerCase(),quantity:i.quantity})).sort((a,b)=>a.productId.localeCompare(b.productId)),
    address:{receiverName:body.address.receiverName.trim(),phone:body.address.phone.trim(),areaId:body.address.areaId,latitude:body.address.latitude??null,longitude:body.address.longitude??null,detail:body.address.detail.trim()},slot:{id:body.slot.id,date:body.slot.date},note:body.note.trim()}
  const fp=fingerprint(normalized)
  await sweepInventory(pool,1)
  const client=await pool.connect()
  try{
    await client.query('BEGIN')
    // Serialize concurrent retries by store + customer + retry key, including the first INSERT.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[slug,subject+':'+key])
    const storeResult=await client.query('SELECT id FROM stores WHERE slug=$1 AND is_active=true',[slug])
    if(!storeResult.rows.length){await client.query('ROLLBACK');reply(res,404,{error:'store_unavailable'});return true}
    const storeId=storeResult.rows[0].id
    const existing=await client.query('SELECT id,total_cents,checkout_fingerprint,payment_status,fulfillment_status,inventory_state,inventory_expires_at FROM orders WHERE store_id=$1 AND customer_subject=$2 AND checkout_key=$3',[storeId,subject,key])
    if(existing.rows.length){
      await client.query('COMMIT')
      const saved=existing.rows[0]
      if(saved.checkout_fingerprint!==fp){reply(res,409,{error:'idempotency_key_reused'});return true}
      reply(res,200,{orderId:saved.id,totalCents:Number(saved.total_cents),paymentStatus:saved.payment_status,fulfillmentStatus:saved.fulfillment_status,inventoryState:saved.inventory_state,inventoryExpiresAt:saved.inventory_expires_at,replayed:true});return true
    }
    const delivery=await verifyDelivery(client,storeId,normalized.address,normalized.slot)
    if(delivery.error){await client.query('ROLLBACK');reply(res,409,{error:delivery.error});return true}
    const ids=normalized.items.map(i=>i.productId)
    const products=await client.query(`SELECT p.id,p.store_id,p.name,p.price_cents,p.discount_price_cents,p.discount_start,p.discount_end,${publishedSql('p')} AS active,p.sold_out,p.stock_mode,p.stock_quantity FROM products p WHERE p.store_id=$1 AND p.id=ANY($2::uuid[]) ORDER BY p.id FOR UPDATE`,[storeId,ids])
    if(products.rows.length!==ids.length||products.rows.some(p=>!p.active||p.sold_out)){
      await client.query('ROLLBACK');reply(res,409,{error:'product_unavailable'});return true
    }
    const byId=new Map(products.rows.map(p=>[p.id,p]))
    if (normalized.items.some(item=>byId.get(item.productId).stock_mode==='finite' && byId.get(item.productId).stock_quantity<item.quantity)) {
      await client.query('ROLLBACK');reply(res,409,{error:'insufficient_stock'});return true
    }
    const lines=normalized.items.map(i=>({...i,name:byId.get(i.productId).name,priceCents:(byId.get(i.productId).discount_price_cents !== null && (!byId.get(i.productId).discount_start || new Date(byId.get(i.productId).discount_start) <= new Date()) && (!byId.get(i.productId).discount_end || new Date(byId.get(i.productId).discount_end) > new Date()) ? byId.get(i.productId).discount_price_cents : byId.get(i.productId).price_cents)}))
    const total=lines.reduce((sum,i)=>sum+i.priceCents*i.quantity,0)
    if(!Number.isSafeInteger(total)||total<0||total>100000000){await client.query('ROLLBACK');reply(res,400,{error:'cart_total_too_large'});return true}
    // Delivery is checked against server-owned rules; payment is not yet implemented. Delivery fee remains zero.
    const inserted=await client.query(`INSERT INTO orders(store_id,customer_subject,subtotal_cents,total_cents,checkout_key,checkout_fingerprint,contact_snapshot,delivery_slot_snapshot)
      VALUES($1,$2,$3,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING id`,[storeId,subject,total,key,fp,JSON.stringify({...normalized.address,note:normalized.note}),JSON.stringify(delivery.snapshot)])
    const orderId=inserted.rows[0].id
    for(const line of lines)await client.query('INSERT INTO order_items(order_id,product_id,product_name,unit_price_cents,quantity) VALUES($1,$2,$3,$4,$5)',[orderId,line.productId,line.name,line.priceCents,line.quantity])
    let inventoryExpiresAt=null
    const finiteLines=lines.filter(line=>byId.get(line.productId).stock_mode==='finite')
    if (finiteLines.length) {
      const expiry=await client.query(`UPDATE orders SET inventory_state='held',inventory_expires_at=clock_timestamp()+interval '1 minute' * $2 WHERE id=$1 RETURNING inventory_expires_at`,[orderId,HOLD_MINUTES])
      inventoryExpiresAt=expiry.rows[0].inventory_expires_at
      for (const line of finiteLines) {
        const product=byId.get(line.productId)
        const changed=await client.query('UPDATE products SET stock_quantity=stock_quantity-$3,inventory_version=inventory_version+1 WHERE store_id=$1 AND id=$2 AND stock_mode=$4 AND stock_quantity >= $3 RETURNING id',[storeId,product.id,line.quantity,'finite'])
        if (!changed.rows.length) throw stockError('insufficient_stock')
        await client.query('INSERT INTO inventory_reservations(store_id,order_id,product_id,quantity) VALUES($1,$2,$3,$4)',[storeId,orderId,product.id,line.quantity])
        await recordMovement(client,product,'finite',product.stock_quantity-line.quantity,{orderId,source:'order',reason:'待支付订单预留，尚未收款',actor:subject,key:'reserve_'+orderId})
      }
    }
    await client.query('COMMIT')
    reply(res,201,{orderId,totalCents:total,paymentStatus:'unpaid',inventoryState:finiteLines.length?'held':'none',inventoryExpiresAt,replayed:false,deliveryVerified:true})
  }catch(e){try{await client.query('ROLLBACK')}catch{};if(e.inventoryError){reply(res,409,{error:e.message});return true}throw e}finally{client.release()}
  return true
}
