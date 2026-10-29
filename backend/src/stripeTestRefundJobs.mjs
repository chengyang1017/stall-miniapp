// Isolated test-only refund reconciliation. Not mounted on a route or timer.
// The claim/complete steps persist state around Stripe calls, never hold a DB transaction during network IO.
const fail=code=>{throw Error(code)}
export async function enqueueStripeTestRefunds(db){
 const result=await db.query(`INSERT INTO stripe_test_refund_jobs(payment_event_id,order_id,checkout_session_id,amount_cents)
 SELECT e.id,e.order_id,e.provider_event_id,e.amount_cents
 FROM payment_events e WHERE e.provider='stripe:sandbox' AND e.event_type='refund_required'
 ON CONFLICT DO NOTHING RETURNING id`)
 return result.rowCount
}
export async function claimStripeTestRefund(db){
 const result=await db.query(`
 UPDATE stripe_test_refund_jobs j SET status='processing',lease_token=gen_random_uuid(),
 lease_expires_at=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1,
 updated_at=clock_timestamp()
 WHERE j.id=(SELECT id FROM stripe_test_refund_jobs WHERE
   (status='pending' AND next_attempt_at<=clock_timestamp() OR
    status='processing' AND lease_expires_at<clock_timestamp())
   AND attempt_count<5
   ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING id,order_id,checkout_session_id,amount_cents,lease_token,attempt_count`)
 return result.rows[0]||null
}
export async function finishStripeTestRefund(db,job,result){
 if(!job?.id||!job?.lease_token)fail('refund_lease_required')
 const status=result?.completed===true?'succeeded':'submitted'
 if(!/^re_[a-zA-Z0-9_]+$/.test(result?.refundId||''))fail('invalid_stripe_refund_id')
 const row=await db.query(`UPDATE stripe_test_refund_jobs SET status=$3,refund_id=$4,
  lease_token=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=clock_timestamp()
 WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING id`,
 [job.id,job.lease_token,status,result.refundId])
 if(row.rowCount!==1)fail('refund_lease_lost')
 return status
}
export async function failStripeTestRefund(db,job,error){
 const message=String(error?.message||'stripe_refund_error').slice(0,200)
 const result=await db.query(`UPDATE stripe_test_refund_jobs SET
  status=CASE WHEN attempt_count>=5 THEN 'review' ELSE 'pending' END,
  next_attempt_at=clock_timestamp()+(interval '1 minute' * LEAST(60,POWER(2,LEAST(attempt_count,6))::int)),
  last_error=$3,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
 WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING status`,[job.id,job.lease_token,message])
 if(result.rowCount!==1)fail('refund_lease_lost')
 return result.rows[0].status
}
export async function processOneStripeTestRefund(db,client){
 const job=await claimStripeTestRefund(db)
 if(!job)return {action:'idle'}
 // A stale lease may retry; Stripe idempotency key uses the checkout Session ID.
 const audit={provider:'stripe:sandbox',event_type:'refund_required',
  order_id:job.order_id,provider_event_id:job.checkout_session_id,amount_cents:job.amount_cents}
 try{
  const result=await client.refundLatePayment(audit)
  const status=await finishStripeTestRefund(db,job,result)
  return {action:status,jobId:job.id}
 }catch(e){
  // Errors from the Stripe API are recorded, rather than assumed refunded.
  const status=await failStripeTestRefund(db,job,e)
  return {action:status,jobId:job.id}
 }
}
