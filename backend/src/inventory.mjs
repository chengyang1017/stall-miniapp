export const MAX_STOCK = 1000000
export const HOLD_MINUTES = 15
export function stockError(message) { return Object.assign(new Error(message),{inventoryError:true}) }
export function validStockInteger(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK }
export function inventoryColumns(alias = 'p') {
  return `${alias}.stock_mode AS "stockMode",${alias}.stock_quantity AS "stockQuantity",${alias}.low_stock_threshold AS "lowStockThreshold",${alias}.inventory_version AS "inventoryVersion",(${alias}.stock_mode='finite' AND ${alias}.stock_quantity=0) AS "outOfStock"`
}
export async function recordMovement(client, product, afterMode, afterQuantity, {orderId=null,source,reason,actor,key,payload=null}) {
  await client.query(`INSERT INTO inventory_movements(store_id,product_id,order_id,before_mode,after_mode,before_quantity,delta,after_quantity,reason,source,actor_subject,operation_key,request_payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
    [product.store_id,product.id,orderId,product.stock_mode,afterMode,product.stock_quantity,afterQuantity-product.stock_quantity,afterQuantity,reason,source,actor,key,payload === null ? null : JSON.stringify(payload)])
}

// Caller must hold the product row lock. This never updates manual sold_out.
export async function configureInventory(client, product, input, actor, initial = false, adjustmentDelta = null) {
  if (!input || !['finite','unlimited'].includes(input.stockMode) || !validStockInteger(input.stockQuantity) || !validStockInteger(input.lowStockThreshold) ||
    typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length>200 ||
    typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/.test(input.requestKey)) throw stockError('invalid_inventory')
  const quantity = input.stockMode === 'finite' ? input.stockQuantity : 0
  const payload = {stockMode:input.stockMode,stockQuantity:quantity,lowStockThreshold:input.lowStockThreshold,reason:input.reason.trim()}
  if (adjustmentDelta !== null) payload.adjustmentDelta=adjustmentDelta
  const operationKey='manual_'+input.requestKey
  const replay = await client.query('SELECT request_payload=$4::jsonb AS matches FROM inventory_movements WHERE store_id=$1 AND product_id=$2 AND operation_key=$3',[product.store_id,product.id,operationKey,JSON.stringify(payload)])
  if (replay.rows.length) { if (!replay.rows[0].matches) throw stockError('inventory_retry_key_reused'); return }
  if (!initial && input.expectedInventoryVersion !== product.inventory_version) throw stockError('inventory_changed_reload')
  const held = await client.query("SELECT COALESCE(SUM(quantity),0)::int AS quantity FROM inventory_reservations WHERE store_id=$1 AND product_id=$2 AND state='held'",[product.store_id,product.id])
  if (held.rows[0].quantity && input.stockMode !== product.stock_mode) throw stockError('inventory_has_reservations')
  if (quantity + held.rows[0].quantity > MAX_STOCK) throw stockError('inventory_limit_including_reservations')
  await client.query('UPDATE products SET stock_mode=$3,stock_quantity=$4,low_stock_threshold=$5,inventory_version=inventory_version+1 WHERE store_id=$1 AND id=$2',[product.store_id,product.id,input.stockMode,quantity,input.lowStockThreshold])
  await recordMovement(client,product,input.stockMode,quantity,{source:'manual',reason:payload.reason,actor,key:operationKey,payload})
}

// Caller owns the order lock. Lock products in the same UUID order everywhere.
export async function resolveOrderInventory(client, order, resolution, source, actor, reason) {
  if (order.inventory_state !== 'held') return false
  if (resolution === 'released' && (order.payment_status !== 'unpaid' || !['new','cancelled'].includes(order.fulfillment_status))) throw stockError('inventory_release_requires_review')
  if (resolution === 'committed' && order.payment_status !== 'paid') throw stockError('payment_not_confirmed')
  const holds = await client.query("SELECT product_id,quantity FROM inventory_reservations WHERE store_id=$1 AND order_id=$2 AND state='held' ORDER BY product_id",[order.store_id,order.id])
  for (const hold of holds.rows) {
    const {rows} = await client.query('SELECT * FROM products WHERE store_id=$1 AND id=$2 FOR UPDATE',[order.store_id,hold.product_id])
    const product = rows[0]
    if (!product || product.stock_mode !== 'finite') throw stockError('inventory_reservation_inconsistent')
    const after = product.stock_quantity + (resolution === 'released' ? hold.quantity : 0)
    if (after>MAX_STOCK) throw stockError('inventory_release_limit')
    await client.query('UPDATE products SET stock_quantity=$3,inventory_version=inventory_version+1 WHERE store_id=$1 AND id=$2',[order.store_id,product.id,after])
    await recordMovement(client,product,'finite',after,{orderId:order.id,source,reason,actor,key:resolution+'_'+order.id})
  }
  await client.query("UPDATE inventory_reservations SET state=$3,resolved_at=now() WHERE store_id=$1 AND order_id=$2 AND state='held'",[order.store_id,order.id,resolution])
  await client.query('UPDATE orders SET inventory_state=$3,updated_at=now() WHERE store_id=$1 AND id=$2',[order.store_id,order.id,resolution])
  return true
}

// A real server worker, also called before checkout. No frontend timer or fake payment.
export async function sweepInventory(pool, limit = 100) {
  let processed=0
  for (let index=0; index<limit; index++) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const {rows} = await client.query(`SELECT o.*,EXISTS(SELECT 1 FROM payment_events e WHERE e.order_id=o.id AND e.provider='wechat' AND e.event_type IN ('payment_failed','payment_closed')) AS payment_failed
        FROM orders o WHERE inventory_state='held' AND
        ((payment_status='unpaid' AND fulfillment_status IN ('new','cancelled') AND (inventory_expires_at <= clock_timestamp() OR fulfillment_status='cancelled'
          OR EXISTS(SELECT 1 FROM payment_events e WHERE e.order_id=o.id AND e.provider='wechat' AND e.event_type IN ('payment_failed','payment_closed'))))
          OR (payment_status='paid' AND fulfillment_status NOT IN ('cancelled','abnormal')))
        ORDER BY inventory_expires_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)
      if (!rows.length) { await client.query('COMMIT'); break }
      const order = rows[0]
      if (order.payment_status === 'paid') {
        await resolveOrderInventory(client,order,'committed','payment','system:inventory','已确认付款，预留转为正式扣减（不再次扣库存）')
      } else {
        const source = order.fulfillment_status === 'cancelled' ? 'cancel' : (order.payment_failed ? 'payment_failed' : 'expiry')
        const reason=source==='expiry'?'未支付预留超过15分钟，释放库存':source==='payment_failed'?'服务端支付失败或关闭事件，释放未支付预留':'未支付订单取消，释放预留'
        await resolveOrderInventory(client,order,'released',source,'system:inventory',reason)
        if (order.fulfillment_status === 'new') {
          await client.query("UPDATE orders SET fulfillment_status='cancelled',issue_reason=$2,updated_at=now() WHERE id=$1",[order.id,reason])
          await client.query("INSERT INTO order_status_events(store_id,order_id,actor_subject,from_status,to_status,note) VALUES($1,$2,'system:inventory','new','cancelled',$3)",[order.store_id,order.id,reason])
        }
      }
      await client.query('COMMIT')
      processed++
    } catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  }
  return processed
}
export function startInventoryWorker(pool) {
  let stopped=false, timer, running=Promise.resolve()
  const tick=()=>{
    running=sweepInventory(pool).catch(error=>{console.error('Inventory release worker failed',error.code || error.message);return 0}).then(processed=>{
      // Drain an overdue backlog in bounded batches without waiting another 30s.
      if (!stopped) { timer=setTimeout(tick,processed>=100?50:30000);timer.unref() }
    })
  }
  tick()
  return async()=>{stopped=true;clearTimeout(timer);await running}
}
