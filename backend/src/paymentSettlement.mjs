// Pure settlement gate for a future provider webhook handler.
// No writes or HTTP routes: actual settlement must lock the order in a DB
// transaction, deduplicate provider transaction IDs, then update inventory.
import {isVerifiedPaymentEvent} from './paymentGateway.mjs'
const fail=code=>Object.assign(Error(code),{code})
export function authorizePaymentSettlement({order,event,expectedMode,expectedProvider}){
 if(!order||!event||!['sandbox','live'].includes(expectedMode))throw fail('invalid_settlement_input')
 if(!isVerifiedPaymentEvent(event))throw fail('unverified_payment_notification')
 if(event.status!=='succeeded'||event.provider!==expectedProvider||event.mode!==expectedMode)throw fail('untrusted_payment_result')
 if(!event.transactionId||typeof event.transactionId!=='string')throw fail('invalid_provider_transaction')
 if(event.orderId!==order.id||event.amountCents!==Number(order.total_cents)||event.currency!==order.currency)throw fail('payment_reconciliation_mismatch')
 if(order.payment_status==='paid'){
  // Never silently treat an arbitrary second transaction as a replay.
  if(order.payment_provider===event.provider&&order.payment_mode===event.mode&&order.provider_transaction_id===event.transactionId)return Object.freeze({action:'already_settled',orderId:order.id})
  throw fail('paid_order_different_transaction')
 }
 if(order.payment_status!=='unpaid'||order.fulfillment_status!=='new'||!['held','none'].includes(order.inventory_state))throw fail('order_not_payable')
 if(order.payment_window_open!==true)throw fail('payment_window_expired')
 return Object.freeze({action:'settle',orderId:order.id,provider:event.provider,mode:event.mode,transactionId:event.transactionId,amountCents:event.amountCents,currency:event.currency})
}
