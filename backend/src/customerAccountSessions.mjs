// Separate customer-account sessions for future independently verified phone login.
// No HTTP route or SMS verification is enabled by this module.
// Sessions must never reuse legacy auth_sessions.external_subject (wx:...).
import {createHash,randomBytes} from 'node:crypto'
const sha=value=>createHash('sha256').update(value).digest('hex')
const ACCOUNT=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TOKEN=/^[A-Za-z0-9_-]{40,100}$/
const lifetime=24*60*60*1000

export async function createCustomerAccountSession(pool,{accountId,verifiedLogin}){
 // Only an internal identity-verification service may supply verifiedLogin.
 // Never expose this function directly to untrusted HTTP payloads.
 if(verifiedLogin!==true)throw Error('verified_login_required')
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId))throw Error('invalid_account_id')
 const token=randomBytes(32).toString('base64url')
 const expiresAt=new Date(Date.now()+lifetime).toISOString()
 const result=await pool.query(
  `INSERT INTO customer_account_sessions(account_id,token_hash,expires_at)
   SELECT id,$2,$3 FROM customer_accounts WHERE id=$1 RETURNING account_id`,
  [accountId,sha(token),expiresAt])
 if(result.rows.length!==1)throw Error('account_not_found')
 return {token,expiresAt,accountId,cacheScope:sha('customer-account:'+accountId)}
}

export async function authenticateCustomerAccountSession(pool,req){
 const authorization=req?.headers?.authorization
 if(typeof authorization!=='string'||!authorization.startsWith('Bearer '))return null
 const token=authorization.slice(7)
 if(!TOKEN.test(token))return null
 const result=await pool.query(
  'SELECT account_id FROM customer_account_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',
  [sha(token)])
 return result.rows[0]?.account_id||null
}

export async function revokeCustomerAccountSession(pool,req){
 const authorization=req?.headers?.authorization
 const token=typeof authorization==='string'&&authorization.startsWith('Bearer ')?authorization.slice(7):''
 if(!TOKEN.test(token))return false
 const result=await pool.query('UPDATE customer_account_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL',[sha(token)])
 return (result.rowCount||0)>0
}
