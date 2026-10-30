// Prepared identity-linking primitive for a future independently verified SMS flow.
// This function never sends OTPs and must only be called after trusted server-side SMS verification.
// No HTTP route is exported: independent phone sign-in remains disabled until provider,
// abuse controls, recovery policy, schema permissions, and real integration tests are approved.
const PHONE=/^\+861[3-9][0-9]{9}$/
const ACCOUNT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function canonicalMainlandPhone(value){
 if(typeof value!=='string'||!PHONE.test(value))throw Error('invalid_verified_phone')
 return value
}

// Never create a duplicate account for an already-bound phone.
// Caller is responsible for proving that accountId belongs to the authenticated user.
export async function linkVerifiedPhoneToAccount(pool,{accountId,phone,verifiedByServer}){
 if(verifiedByServer!==true)throw Error('phone_verification_required')
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId))throw Error('invalid_account_id')
 const verifiedPhone=canonicalMainlandPhone(phone)
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const account=await client.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE',[accountId])
  if(account.rows.length!==1){await client.query('ROLLBACK');return 'account_not_found'}
  const existing=await client.query('SELECT account_id FROM customer_verified_phones WHERE phone_e164=$1',[verifiedPhone])
  if(existing.rows.some(row=>row.account_id!==accountId)){
   await client.query('ROLLBACK');return 'phone_already_bound'
  }
  await client.query('INSERT INTO customer_verified_phones(account_id,phone_e164,verified_at) VALUES ($1,$2,now()) ON CONFLICT (account_id) DO UPDATE SET phone_e164=EXCLUDED.phone_e164,verified_at=EXCLUDED.verified_at',[accountId,verifiedPhone])
  await client.query('COMMIT')
  return 'bound'
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  if(error?.code==='23505')return 'phone_already_bound'
  throw error
 }finally{client.release()}
}
