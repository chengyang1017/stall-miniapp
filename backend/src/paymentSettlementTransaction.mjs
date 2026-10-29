// Payment settlement transaction using the existing orders, payment_events and
// inventory reservations schema. This module is NOT mounted on an HTTP route.
import {isVerifiedPaymentEvent} from './paymentGateway.mjs'
import {authorizePaymentSettlement} from './paymentSettlement.mjs'
import {resolveOrderInventory} from './inventory.mjs'
const fail=code=>Object.assign(Error(code),{code})
const providerKey=event=>event.provider+':'+event.mode
export async function settleVerifiedOrderPayment(pool,{event,expectedProvider,expectedMode}){
 if(!isVerifiedPaymentEvent(event))throw fail('unverified_payment_notification')
 if(event.provider!==expectedProvider||event.mode!==expectedMode)throw fail('payment_environment_mismatch')
 const db=await pool.connect()
 let active=false
 try{
  await db.query('BEGIN');active=true
  await db.query("SET LOCAL statement_timeout='5000ms'")
  const result=await db.query(`SELECT *, (created_at+interval '15 minutes'>clock_timestamp()
   AND (inventory_expires_at IS NULL OR inventory_expires_at>clock_timestamp())) AS payment_window_open
   FROM orders WHERE id=$1 FOR UPDATE`,[event.orderId])
  const order=result.rows[0]
  if(!order)throw fail('payment_order_not_found')
  const provider=providerKey(event)
  if(order.payment_status==='paid'){
   // A repeated notification may be acknowledged only if its existing event
   // matches this paid order; no duplicate inventory or status update.
   const prior=await db.query(`SELECT order_id,amount_cents,event_type FROM payment_events
    WHERE provider=$1 AND provider_event_id=$2`,[provider,event.transactionId])
   if(prior.rows.length===1&&prior.rows[0].order_id===order.id&&
    Number(prior.rows[0].amount_cents)===event.amountCents&&prior.rows[0].event_type==='payment_succeeded'){
    await db.query('COMMIT');active=false
    return {action:'already_settled',orderId:order.id}
   }
   throw fail('paid_order_different_transaction')
  }
  // A payment may succeed at Stripe after our 15-minute inventory hold has
  // expired. Record the paid transaction durably for refund reconciliation,
  // but NEVER mark the cancelled/expired order paid or re-reserve stock.
  // This branch applies only to the explicitly isolated Stripe sandbox.
  if(event.provider==='stripe'&&event.mode==='sandbox'&&
    (order.payment_window_open!==true||order.fulfillment_status!=='new'||!['held','none'].includes(order.inventory_state)||order.payment_status!=='unpaid')){
    const previous=await db.query(`SELECT order_id,amount_cents,event_type FROM payment_events
      WHERE provider=$1 AND provider_event_id=$2`,[provider,event.transactionId])
    if(previous.rows.length){
      const prior=previous.rows[0]
      if(prior.order_id!==order.id||Number(prior.amount_cents)!==event.amountCents||prior.event_type!=='refund_required')
        throw fail('provider_transaction_reused')
      await db.query('COMMIT');active=false
      return {action:'refund_required',orderId:order.id,replayed:true}
    }
    await db.query(`INSERT INTO payment_events(order_id,provider,provider_event_id,event_type,amount_cents)
      VALUES($1,$2,$3,'refund_required',$4)`,[order.id,provider,event.transactionId,event.amountCents])
    await db.query('COMMIT');active=false
    return {action:'refund_required',orderId:order.id,replayed:false}
  }
  const decision=authorizePaymentSettlement({order,event,expectedProvider,expectedMode})
  const collision=await db.query('SELECT order_id FROM payment_events WHERE provider=$1 AND provider_event_id=$2',[provider,event.transactionId])
  if(collision.rows.length)throw fail('provider_transaction_reused')
  // Inventory was removed from available stock at reservation time. Committing
  // only resolves the hold, and is executed within the same transaction.
  await db.query(`INSERT INTO payment_events(order_id,provider,provider_event_id,event_type,amount_cents)
   VALUES($1,$2,$3,'payment_succeeded',$4)`,[order.id,provider,event.transactionId,event.amountCents])
  const updated=await db.query(`UPDATE orders SET payment_status='paid',updated_at=clock_timestamp()
   WHERE id=$1 AND payment_status='unpaid' RETURNING id`,[order.id])
  if(updated.rowCount!==1||updated.rows?.[0]?.id!==order.id)throw fail('payment_order_update_failed')
  await resolveOrderInventory(db,{...order,payment_status:'paid'},'committed','payment','system:gateway',
   '支付网关验签成功，预留库存转为正式扣减（不再次扣库存）')
  await db.query('COMMIT');active=false
  return decision
 }catch(error){
  if(active)await db.query('ROLLBACK')
  throw error
 }finally{db.release()}
}
