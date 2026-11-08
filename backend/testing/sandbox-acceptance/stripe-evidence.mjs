// Read-only real Stripe verification. Never creates payments or refunds.
import {createStripeSandboxClient} from '../../src/stripeSandboxClient.mjs'
import {verifyStripeSignature} from '../../src/stripeCheckoutGateway.mjs'
export async function verifyTestSession(env,fetchImpl){
 if(env.SBX_STRIPE_READONLY!=='I_CONFIRM_STRIPE_TEST_ACCOUNT'||env.APP_ENV!=='sandbox'||env.PAYMENT_DB_ENV!=='isolated-test')throw Error('explicit_test_account_required')
 if(!/^[a-f0-9-]{36}$/i.test(env.SBX_ORDER_ID||'')||!/^cs_test_[A-Za-z0-9_]+$/.test(env.SBX_SESSION_ID||'')||!Number.isSafeInteger(Number(env.SBX_AMOUNT_CENTS))||Number(env.SBX_AMOUNT_CENTS)<=0||!['card','alipay','wechat_pay'].includes(env.SBX_CHANNEL))throw Error('expected_test_transaction_required')
 const observation=await createStripeSandboxClient(env,fetchImpl).getSession({session_id:env.SBX_SESSION_ID,order_id:env.SBX_ORDER_ID,amount_cents:Number(env.SBX_AMOUNT_CENTS),request_key:'readonly-acceptance',channel:env.SBX_CHANNEL})
 if(observation.event&&observation.actualChannel!==env.SBX_CHANNEL)throw Error('actual_channel_mismatch')
 return {kind:'STRIPE_TEST_API_READ_ONLY',paid:!!observation.event,status:observation.session.status,actualChannel:observation.actualChannel,serverLedgerVerified:false}
}
export function verifyTestWebhook(raw,header,secret){
 const e=verifyStripeSignature(raw,header,secret)
 if(e.livemode!==false||!/^evt_/.test(e.id||''))throw Error('test_event_required')
 return {kind:'CAPTURED_SIGNATURE_ONLY',signatureVerified:true,testMode:true,serverLedgerVerified:false}
}
