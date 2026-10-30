import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveCustomerOnlySession,requireCustomerIdentity} from '../src/customerSessionBoundary.mjs'
const id='7f08a781-f880-41e6-a088-f6a849c1648a'
const request={headers:{authorization:'Bearer '+'x'.repeat(43)}}
test('a verified independent session yields a customer-only identity',async()=>{
 let sql
 const pool={async query(q){sql=q;return {rows:[{account_id:id}]}}}
 const identity=await resolveCustomerOnlySession(pool,request)
 assert.deepEqual(identity,{kind:'customer',accountId:id})
 assert.match(sql,/FROM customer_account_sessions/)
 assert.doesNotMatch(sql,/auth_sessions\s/)
 assert.equal(requireCustomerIdentity(identity),id)
})
test('legacy WeChat session cannot authenticate through customer table',async()=>{
 const pool={async query(q){assert.match(q,/FROM customer_account_sessions/);return {rows:[]}}}
 assert.equal(await resolveCustomerOnlySession(pool,request),null)
})
test('merchant subject cannot be used as a customer account ID',()=>{
 for(const value of [{kind:'merchant',accountId:id},{kind:'customer',accountId:'wx:wx0123456789abcdef:user'},{kind:'customer',external_subject:'wx:subject'},null])
  assert.throws(()=>requireCustomerIdentity(value),/customer_session_required/)
})
test('invalid or revoked session always fails closed',async()=>{
 const pool={async query(){return {rows:[]}}}
 assert.equal(await resolveCustomerOnlySession(pool,{headers:{authorization:'Bearer invalid'}}),null)
 assert.equal(await resolveCustomerOnlySession(pool,request),null)
})
test('malformed database account IDs are never accepted as customer identities',async()=>{
 const pool={async query(){return {rows:[{account_id:'wx:fake'}]}}}
 assert.equal(await resolveCustomerOnlySession(pool,request),null)
})
