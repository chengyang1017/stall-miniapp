// Internal-only SMS issuance. An audited provider adapter and trusted remote IP
// must be supplied by the server, never by an HTTP request body.
import {randomInt,createHash} from 'node:crypto'
import {canonicalMainlandPhone} from './customerPhoneIdentity.mjs'
import {hashCustomerSmsCode} from './customerSmsChallenge.mjs'
const ipDigest=(secret,ip)=>createHash('sha256').update(secret+':'+ip).digest('hex')
export async function issueCustomerSmsChallenge(pool,{phone,remoteIp,secret,send,now=new Date()}){
 const normalized=canonicalMainlandPhone(phone)
 if(typeof remoteIp!=='string'||remoteIp.length<3||remoteIp.length>64||!/^[a-fA-F0-9:.]+$/.test(remoteIp))throw Error('trusted_remote_ip_required')
 if(typeof secret!=='string'||secret.length<32)throw Error('sms_secret_required')
 if(typeof send!=='function')throw Error('approved_sms_provider_required')
 const code=String(randomInt(0,1000000)).padStart(6,'0'),ipHash=ipDigest(secret,remoteIp)
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  await db.query("SET LOCAL statement_timeout='12s'")
  // Serialize both quota scopes; fixed lock order avoids deadlocks.
  const keys=['ip:'+ipHash,'phone:'+normalized].sort()
  for(const key of keys)await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['sms-issue:'+key])
  const count=await db.query(`SELECT
    count(*) FILTER (WHERE phone_e164=$1 AND created_at>$3::timestamptz-interval '1 hour')::int AS phone_hour,
    count(*) FILTER (WHERE ip_hash=$2 AND created_at>$3::timestamptz-interval '1 hour')::int AS ip_hour,
    count(*) FILTER (WHERE phone_e164=$1 AND created_at>$3::timestamptz-interval '60 seconds')::int AS phone_minute
    FROM customer_sms_issue_attempts`,[normalized,ipHash,now.toISOString()])
  const quota=count.rows[0]
  if(!quota||quota.phone_hour>=5||quota.ip_hour>=20||quota.phone_minute>=1){
   await db.query('ROLLBACK');return {accepted:false,reason:'rate_limited'}
  }
  // Record before provider call. A provider failure rolls back the challenge.
  // Do not return the OTP in the result or log it.
  await db.query('INSERT INTO customer_sms_issue_attempts(phone_e164,ip_hash,created_at) VALUES($1,$2,$3)',[normalized,ipHash,now.toISOString()])
  await db.query(`INSERT INTO customer_sms_challenges(phone_e164,code_hash,attempts,expires_at,consumed_at,created_at)
   VALUES($1,$2,0,$3,NULL,$4)
   ON CONFLICT(phone_e164) DO UPDATE SET code_hash=EXCLUDED.code_hash,attempts=0,
   expires_at=EXCLUDED.expires_at,consumed_at=NULL,created_at=EXCLUDED.created_at`,
   [normalized,hashCustomerSmsCode(secret,normalized,code),new Date(now.getTime()+5*60000).toISOString(),now.toISOString()])
  // Commit the OTP before dispatching SMS: never send an unusable code because
  // a later database commit failed. Keep quota records even when SMS fails.
  await db.query('COMMIT')
  try{
   await send({phone:normalized,code})
  }catch(error){
   // Guard by the exact hash so a concurrent replacement is not invalidated.
   await db.query(`UPDATE customer_sms_challenges SET consumed_at=now()
    WHERE phone_e164=$1 AND code_hash=$2 AND consumed_at IS NULL`,
    [normalized,hashCustomerSmsCode(secret,normalized,code)]).catch(()=>{})
   throw error
  }
  return {accepted:true}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
