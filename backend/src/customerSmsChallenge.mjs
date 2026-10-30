// Server-side OTP consumption: never trust a client-side "verified" flag.
// This is a foundation only. No send endpoint or production SMS provider exists.
import {createHmac,timingSafeEqual} from 'node:crypto'
import {canonicalMainlandPhone} from './customerPhoneIdentity.mjs'
const digest=(secret,phone,code)=>createHmac('sha256',secret).update(phone+'|'+code).digest('hex')
export async function consumeCustomerSmsChallenge(pool,{phone,code,secret,now=new Date()}){
 const normalized=canonicalMainlandPhone(phone)
 if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))throw Error('invalid_otp')
 if(typeof secret!=='string'||secret.length<32)throw Error('otp_secret_not_configured')
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  // All attempts (including wrong codes) are serialized and persisted.
  const r=await db.query(`SELECT phone_e164,code_hash,attempts,expires_at,consumed_at
    FROM customer_sms_challenges WHERE phone_e164=$1 FOR UPDATE`,[normalized])
  const row=r.rows[0],validTime=row&&new Date(row.expires_at)>now&&!row.consumed_at
  if(!validTime||row.attempts>=5){await db.query('COMMIT');return false}
  await db.query('UPDATE customer_sms_challenges SET attempts=attempts+1 WHERE phone_e164=$1',[normalized])
  const expected=digest(secret,normalized,code)
  const stored=typeof row.code_hash==='string'&&/^[a-f0-9]{64}$/.test(row.code_hash)?row.code_hash:'0'.repeat(64)
  const equal=timingSafeEqual(Buffer.from(stored,'hex'),Buffer.from(expected,'hex'))
  if(equal){
   const result=await db.query('UPDATE customer_sms_challenges SET consumed_at=now() WHERE phone_e164=$1 AND consumed_at IS NULL RETURNING phone_e164',[normalized])
   if(result.rows.length!==1){await db.query('ROLLBACK');return false}
  }
  await db.query('COMMIT')
  return equal
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
export function hashCustomerSmsCode(secret,phone,code){
 if(typeof secret!=='string'||secret.length<32||typeof code!=='string'||!/^[0-9]{6}$/.test(code))throw Error('invalid_sms_setup')
 return digest(secret,canonicalMainlandPhone(phone),code)
}
