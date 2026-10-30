// Internal-only phone rotation primitive. No HTTP endpoint is exported.
// Caller must establish BOTH current account ownership with a fresh step-up
// authentication AND ownership of the new number using a server-verified proof.
// These boolean guards are internal preconditions, not proof by themselves.
// Never pass booleans directly from a client request.
import {canonicalMainlandPhone} from './customerPhoneIdentity.mjs'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function rotateVerifiedPhone(pool,{accountId,expectedOldPhone,newPhone,accountStepUpVerified,newPhoneVerified}){
 if(accountStepUpVerified!==true||newPhoneVerified!==true)throw Error('rotation_verification_required')
 if(typeof accountId!=='string'||!UUID.test(accountId))throw Error('invalid_account_id')
 const oldNumber=canonicalMainlandPhone(expectedOldPhone)
 const nextNumber=canonicalMainlandPhone(newPhone)
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const account=await client.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE',[accountId])
  if(account.rows.length!==1){await client.query('ROLLBACK');return 'account_not_found'}
  const bound=await client.query('SELECT phone_e164 FROM customer_verified_phones WHERE account_id=$1 FOR UPDATE',[accountId])
  if(bound.rows.length!==1||bound.rows[0].phone_e164!==oldNumber){await client.query('ROLLBACK');return 'old_phone_mismatch'}
  if(oldNumber===nextNumber){await client.query('COMMIT');return 'unchanged'}
  const other=await client.query('SELECT account_id FROM customer_verified_phones WHERE phone_e164=$1',[nextNumber])
  if(other.rows.some(row=>row.account_id!==accountId)){await client.query('ROLLBACK');return 'phone_already_bound'}
  const changed=await client.query('UPDATE customer_verified_phones SET phone_e164=$2,verified_at=now() WHERE account_id=$1 AND phone_e164=$3',[accountId,nextNumber,oldNumber])
  if(changed.rowCount!==1){await client.query('ROLLBACK');return 'old_phone_mismatch'}
  await client.query('COMMIT')
  return 'rotated'
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  if(error?.code==='23505')return 'phone_already_bound'
  throw error
 }finally{client.release()}
}
