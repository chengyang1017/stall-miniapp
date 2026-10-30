import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveExistingVerifiedPhoneAccount} from '../src/customerPhoneAccountLookup.mjs'
const phone='+8613812345678'
test('unverified phone never reaches database',async()=>{
 const pool={query(){throw Error('must not query')}}
 await assert.rejects(resolveExistingVerifiedPhoneAccount(pool,{phone,verifiedByServer:false}),/phone_verification_required/)
 await assert.rejects(resolveExistingVerifiedPhoneAccount(pool,{phone:'13812345678',verifiedByServer:true}),/invalid_verified_phone/)
})
test('verified phone resolves only existing stable account; never creates it',async()=>{
 const accountId='7f08a781-f880-41e6-a088-f6a849c1648a'
 let sql,params
 const pool={async query(q,p){sql=q;params=p;return {rows:[{account_id:accountId}]}}}
 assert.equal(await resolveExistingVerifiedPhoneAccount(pool,{phone,verifiedByServer:true}),accountId)
 assert.match(sql,/SELECT account_id FROM customer_verified_phones/)
 assert.deepEqual(params,[phone])
})
test('unknown verified phone is not silently registered or merged',async()=>{
 const pool={query:async()=>({rows:[]})}
 assert.equal(await resolveExistingVerifiedPhoneAccount(pool,{phone,verifiedByServer:true}),null)
})
test('corrupted duplicate mapping fails closed',async()=>{
 const pool={query:async()=>({rows:[{account_id:'a'},{account_id:'b'}]})}
 await assert.rejects(resolveExistingVerifiedPhoneAccount(pool,{phone,verifiedByServer:true}),/phone_identity_integrity_error/)
})
