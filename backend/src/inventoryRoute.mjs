import { authenticate, permittedStore } from './auth.mjs'
import { configureInventory, inventoryColumns, validStockInteger, stockError } from './inventory.mjs'
function reply(res,status,body) { res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body)) }
export async function inventoryRoute(req,res,url,pool) {
  const match=/^\/v1\/merchant\/stores\/([a-z0-9][a-z0-9-]{1,62})\/products\/([0-9a-f-]{36})\/inventory$/.exec(url.pathname)
  if (!match) return false
  const subject=await authenticate(pool,req)
  if (!subject) {reply(res,401,{error:'login_required'});return true}
  const store=await permittedStore(pool,subject,match[1])
  if (!store || !['owner','manager'].includes(store.role)) {reply(res,403,{error:'forbidden'});return true}
  if (req.method==='GET') {
    const {rows}=await pool.query(`SELECT p.id,${inventoryColumns()} FROM products p WHERE p.store_id=$1 AND p.id=$2`,[store.id,match[2]])
    if (!rows.length) {reply(res,404,{error:'product_not_found'});return true}
    const history=await pool.query(`SELECT id,product_id AS "productId",order_id AS "orderId",before_mode AS "beforeMode",after_mode AS "afterMode",before_quantity AS "beforeQuantity",delta,after_quantity AS "afterQuantity",reason,source,created_at AS "createdAt"
      FROM inventory_movements WHERE store_id=$1 AND product_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100`,[store.id,match[2]])
    reply(res,200,{product:rows[0],movements:history.rows});return true
  }
  if (req.method!=='POST') {reply(res,405,{error:'method_not_allowed'});return true}
  let body
  try {
    let raw='';for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>4096)throw Error()}
    body=JSON.parse(raw)
    if(!body||typeof body!=='object'||Array.isArray(body))throw Error()
  }catch{reply(res,400,{error:'invalid_inventory_payload'});return true}
  const client=await pool.connect()
  try {
    await client.query('BEGIN')
    const {rows}=await client.query('SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE',[store.id,match[2]])
    if(!rows.length)throw stockError('product_not_found')
    const product=rows[0]
    if (!Number.isSafeInteger(body.delta) || body.delta===0 || Math.abs(body.delta)>1000000) throw stockError('invalid_inventory_delta')
    // Replay the exact adjustment before version/quantity validation.
    const existing=await client.query('SELECT request_payload FROM inventory_movements WHERE store_id=$1 AND product_id=$2 AND operation_key=$3',[store.id,product.id,'manual_'+(body.requestKey || '')])
    if(existing.rows.length){
      const old=existing.rows[0].request_payload
      if (!old || old.adjustmentDelta!==body.delta || old.reason!==String(body.reason || '').trim()) throw stockError('inventory_retry_key_reused')
    }else{
      if(product.stock_mode!=='finite')throw stockError('inventory_unlimited_cannot_adjust')
      if(!validStockInteger(product.stock_quantity+body.delta))throw stockError('insufficient_stock_or_limit')
      await configureInventory(client,product,{stockMode:'finite',stockQuantity:product.stock_quantity+body.delta,lowStockThreshold:product.low_stock_threshold,reason:body.reason,requestKey:body.requestKey,expectedInventoryVersion:body.expectedInventoryVersion},subject,false,body.delta)
    }
    await client.query('COMMIT');reply(res,200,{ok:true})
  }catch(error){await client.query('ROLLBACK');if(error.inventoryError)reply(res,409,{error:error.message});else throw error}finally{client.release()}
  return true
}
