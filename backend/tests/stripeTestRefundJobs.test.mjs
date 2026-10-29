import test from 'node:test'
import assert from 'node:assert/strict'
import {enqueueStripeTestRefunds,claimStripeTestRefund,finishStripeTestRefund,failStripeTestRefund,processOneStripeTestRefund} from '../src/stripeTestRefundJobs.mjs'
const job={id:'job-1',order_id:'11111111-1111-4111-8111-111111111111',checkout_session_id:'cs_test_abc',amount_cents:1599,lease_token:'token-1',attempt_count:1}
function fake(rows){const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return rows.shift()||{rows:[],rowCount:0}}};return {db,calls}}
test('queue only verified refund-required audit events and prevent duplicates',async()=>{
 const m=fake([{rowCount:1}]);assert.equal(await enqueueStripeTestRefunds(m.db),1)
 assert.match(m.calls[0].sql,/e.event_type='refund_required'/)
 assert.match(m.calls[0].sql,/ON CONFLICT DO NOTHING/)
})
test('claim uses SKIP LOCKED and recovers only expired leases',async()=>{
 const m=fake([{rows:[job]}]);assert.deepEqual(await claimStripeTestRefund(m.db),job)
 assert.match(m.calls[0].sql,/FOR UPDATE SKIP LOCKED/)
 assert.match(m.calls[0].sql,/lease_expires_at<clock_timestamp/)
 assert.match(m.calls[0].sql,/attempt_count<5/)
})
test('completion requires valid refund ID and claimed lease',async()=>{
 const m=fake([{rowCount:1,rows:[{id:job.id}]}])
 assert.equal(await finishStripeTestRefund(m.db,job,{refundId:'re_abc',completed:true}),'succeeded')
 assert.deepEqual(m.calls[0].args.slice(0,2),[job.id,job.lease_token])
 assert.match(m.calls[0].sql,/lease_token=\$2/)
})
test('pending Stripe refunds are persisted as submitted, not succeeded',async()=>{
 const m=fake([{rowCount:1,rows:[{id:job.id}]}])
 assert.equal(await finishStripeTestRefund(m.db,job,{refundId:'re_abc',completed:false}),'submitted')
})
test('stale lease cannot complete or overwrite current job',async()=>{
 const m=fake([{rowCount:0,rows:[]}])
 await assert.rejects(finishStripeTestRefund(m.db,job,{refundId:'re_abc',completed:true}),/refund_lease_lost/)
})
test('transient API error is stored for retry',async()=>{
 const m=fake([{rowCount:1,rows:[{status:'pending'}]}])
 assert.equal(await failStripeTestRefund(m.db,job,Error('network_timeout')),'pending')
 assert.match(m.calls[0].sql,/next_attempt_at/)
})
test('five failed attempts go to manual review',async()=>{
 const m=fake([{rowCount:1,rows:[{status:'review'}]}])
 assert.equal(await failStripeTestRefund(m.db,{...job,attempt_count:5},Error('retry_exhausted')),'review')
 assert.match(m.calls[0].sql,/attempt_count>=5/)
})
test('processing one job records refund completion',async()=>{
 const m=fake([{rows:[job]},{rowCount:1,rows:[{id:job.id}]}])
 const out=await processOneStripeTestRefund(m.db,{refundLatePayment:async(audit)=>{
  assert.equal(audit.provider_event_id,'cs_test_abc');return {refundId:'re_abc',completed:true}
 }})
 assert.equal(out.action,'succeeded')
})
test('processing error schedules retry without claiming refund was completed',async()=>{
 const m=fake([{rows:[job]},{rowCount:1,rows:[{status:'pending'}]}])
 const out=await processOneStripeTestRefund(m.db,{refundLatePayment:async()=>{throw Error('network_timeout')}})
 assert.equal(out.action,'pending')
})
