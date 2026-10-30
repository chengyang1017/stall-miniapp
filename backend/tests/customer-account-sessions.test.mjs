import test from 'node:test'
import assert from 'node:assert/strict'
import {createCustomerAccountSession,authenticateCustomerAccountSession,revokeCustomerAccountSession} from '../src/customerAccountSessions.mjs'
const accountId='7f08a781-f880-41e6-a088-f6a849c1648a'
test('unverified login and invalid account never query DB',async()=>{
 const pool={query(){throw Error('unexpected query')}}
 await assert.rejects(createCustomerAccountSession(pool,{accountId,verifiedLogin:false}),/verified_login_required/)
 await assert.rejects(createCustomerAccountSession(pool,{accountId:'bad',verifiedLogin:true}),/invalid_account_id/)
})
test('new account session hashes token and separates account from legacy subject',async()=>{
 let sql,args
 const pool={async query(q,p){sql=q;args=p;return {rows:[{account_id:accountId}]}}}
 const out=await createCustomerAccountSession(pool,{accountId,verifiedLogin:true})
 assert.equal(out.accountId,accountId)
 assert.match(out.token,/^[A-Za-z0-9_-]{40,100}$/)
 assert.equal(args[0],accountId)
 assert.notEqual(args[1],out.token)
 assert.match(args[1],/^[a-f0-9]{64}$/)
 assert.match(sql,/customer_account_sessions/)
 assert.doesNotMatch(sql,/external_subject/)
})
test('missing account cannot generate a usable session',async()=>{
 const pool={async query(){return {rows:[]}}}
 await assert.rejects(createCustomerAccountSession(pool,{accountId,verifiedLogin:true}),/account_not_found/)
})
test('session lookup only returns server-owned account ID',async()=>{
 let param
 const pool={async query(q,p){param=p[0];assert.match(q,/revoked_at IS NULL/);return {rows:[{account_id:accountId}]}}}
 const token='x'.repeat(43)
 assert.equal(await authenticateCustomerAccountSession(pool,{headers:{authorization:'Bearer '+token}}),accountId)
 assert.notEqual(param,token)
 assert.equal(await authenticateCustomerAccountSession(pool,{headers:{authorization:'Bearer invalid'}}),null)
})
test('revocation hashes bearer token and affects only separate account session table',async()=>{
 const pool={async query(sql,p){assert.match(sql,/UPDATE customer_account_sessions/);assert.match(p[0],/^[a-f0-9]{64}$/);return {rowCount:1}}}
 assert.equal(await revokeCustomerAccountSession(pool,{headers:{authorization:'Bearer '+'x'.repeat(43)}}),true)
 assert.equal(await revokeCustomerAccountSession(pool,{headers:{authorization:'Bearer bad'}}),false)
})
