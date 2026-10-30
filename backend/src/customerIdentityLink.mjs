// Safe, non-routed account identity linking. Only trusted server-side verified
// subjects may reach this function; client JSON is never proof of ownership.
// Existing sign-in, sessions, orders and merchant permissions are untouched.
const ACCOUNT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WECHAT=/^wx:wx[a-f0-9]{16}:[A-Za-z0-9_-]{1,128}$/
export async function linkVerifiedWechatIdentity(pool,{accountId,wechatSubject,verifiedByWechat,accountOwnershipVerified}){
 if(verifiedByWechat!==true||accountOwnershipVerified!==true)throw Error('identity_verification_required')
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId))throw Error('invalid_account_id')
 if(typeof wechatSubject!=='string'||!WECHAT.test(wechatSubject))throw Error('invalid_verified_wechat_subject')
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[wechatSubject])
  const account=await client.query('SELECT id FROM customer_accounts WHERE id=$1 FOR UPDATE',[accountId])
  if(account.rows.length!==1){await client.query('ROLLBACK');return 'account_not_found'}
  const existing=await client.query("SELECT account_id FROM customer_login_identities WHERE provider='wechat' AND provider_subject=$1",[wechatSubject])
  if(existing.rows.length){
   await client.query('ROLLBACK')
   return existing.rows[0].account_id===accountId?'already_linked':'identity_belongs_to_other_account'
  }
  const accountWechat=await client.query("SELECT provider_subject FROM customer_login_identities WHERE account_id=$1 AND provider='wechat'",[accountId])
  if(accountWechat.rows.length){await client.query('ROLLBACK');return 'account_already_has_wechat'}
  await client.query("INSERT INTO customer_login_identities(account_id,provider,provider_subject,verified_at) VALUES($1,'wechat',$2,now())",[accountId,wechatSubject])
  await client.query('COMMIT')
  return 'linked'
 }catch(error){
  try{await client.query('ROLLBACK')}catch{}
  if(error?.code==='23505')return 'identity_conflict'
  throw error
 }finally{client.release()}
}
