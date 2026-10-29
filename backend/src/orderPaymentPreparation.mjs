// Initiate a provider payment from a SERVER-OWNED order snapshot.
// This is deliberately not wired to an HTTP route or order state transitions.
import {paymentRequest} from './paymentGateway.mjs'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail=(code)=>Object.assign(Error(code),{code})
export async function prepareOrderPayment(db,{orderId,subject,requestKey}){
 if(typeof orderId!=='string'||!uuid.test(orderId)||typeof subject!=='string'||!subject||typeof requestKey!=='string')throw fail('invalid_payment_input')
 const result=await db.query(`SELECT id,total_cents,currency,payment_status,fulfillment_status,
 inventory_state, (created_at + interval '15 minutes' > clock_timestamp()
 AND (inventory_expires_at IS NULL OR inventory_expires_at > clock_timestamp())) AS payment_window_open
 FROM orders WHERE id=$1 AND customer_subject=$2`,[orderId,subject])
 if(result.rows.length!==1)throw fail('payment_order_not_found')
 const o=result.rows[0]
 if(o.payment_status!=='unpaid'||o.fulfillment_status!=='new'||!['held','none'].includes(o.inventory_state)||o.payment_window_open!==true)throw fail('payment_order_not_payable')
 const amountCents=Number(o.total_cents)
 return paymentRequest({orderId:o.id,amountCents,currency:o.currency,requestKey})
}
export async function createOrderPayment(gateway,db,input){
 const serverRequest=await prepareOrderPayment(db,input)
 return gateway.create(serverRequest)
}
