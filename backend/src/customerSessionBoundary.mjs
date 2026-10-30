// Narrow customer-only session boundary. No HTTP route uses this yet.
// This NEVER returns the legacy external_subject used by merchant permission checks.
import {authenticateCustomerAccountSession} from './customerAccountSessions.mjs'
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveCustomerOnlySession(pool,req){
 const accountId=await authenticateCustomerAccountSession(pool,req)
 if(typeof accountId!=='string'||!UUID.test(accountId))return null
 return {kind:'customer',accountId}
}

// Guard internal customer-only handlers from ever accepting a merchant/legacy subject.
// Returning only an account ID makes accidental reuse in merchantStores impossible.
export function requireCustomerIdentity(identity){
 if(!identity||identity.kind!=='customer'||typeof identity.accountId!=='string'||!UUID.test(identity.accountId))
  throw Error('customer_session_required')
 return identity.accountId
}
