// Internal-only verified-phone account lookup. NEVER expose this function as
// a login endpoint: possession of a phone string is not authentication.
// Caller must validate an actual provider-issued, one-time server-side proof.
import {canonicalMainlandPhone} from './customerPhoneIdentity.mjs'
export async function resolveExistingVerifiedPhoneAccount(pool,{phone,verifiedByServer}){
 if(verifiedByServer!==true)throw Error('phone_verification_required')
 const normalized=canonicalMainlandPhone(phone)
 const result=await pool.query(`SELECT account_id FROM customer_verified_phones
 WHERE phone_e164=$1`,[normalized])
 if(result.rows.length>1)throw Error('phone_identity_integrity_error')
 return result.rows[0]?.account_id||null
}
