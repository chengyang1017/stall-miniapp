import test from 'node:test'
import assert from 'node:assert/strict'
import {canonicalMainlandPhone,linkVerifiedPhoneToAccount} from '../src/customerPhoneIdentity.mjs'
const id='7f08a781-f880-41e6-a088-f6a849c1648a'
const phone='+8613812345678'
function fixture({account=true,owner=null,insertError=null}={}){
 const queries=[]
 const client={async query(sql,args=[]){
  queries.push({sql,args})
  if(sql.startsWith('SELECT id'))return {rows:account?[{id}]:[]}
  if(sql.startsWith('SELECT account_id'))return {rows:owner?[{account_id:owner}]:[]}
  if(sql.startsWith('INSERT')&&insertError)throw Object.assign(Error('db_failure'),{code:insertError})
  return {rows:[]}
 },release(){queries.push({sql:'RELEASE'})}}
 return {pool:{async connect(){return client}},queries}
}
test('only canonical Mainland China phones are accepted',()=>{
 assert.equal(canonicalMainlandPhone(phone),phone)
 for(const value of ['13812345678','+60123456789','+8612812345678','+86 13812345678','+86138123456789',null])
  assert.throws(()=>canonicalMainlandPhone(value),/invalid_verified_phone/)
})
test('unverified claim and invalid account fail before database access',async()=>{
 const never={connect(){throw Error('should_not_connect')}}
 await assert.rejects(linkVerifiedPhoneToAccount(never,{accountId:id,phone,verifiedByServer:false}),/phone_verification_required/)
 await assert.rejects(linkVerifiedPhoneToAccount(never,{accountId:'not-an-id',phone,verifiedByServer:true}),/invalid_account_id/)
 await assert.rejects(linkVerifiedPhoneToAccount(never,{accountId:id,phone:'+60123456789',verifiedByServer:true}),/invalid_verified_phone/)
})
test('verified linking is transactional',async()=>{
 const f=fixture()
 assert.equal(await linkVerifiedPhoneToAccount(f.pool,{accountId:id,phone,verifiedByServer:true}),'bound')
 assert.deepEqual(f.queries.map(q=>q.sql.startsWith('SELECT')?'SELECT':q.sql.startsWith('INSERT')?'INSERT':q.sql),['BEGIN','SELECT','SELECT','INSERT','COMMIT','RELEASE'])
})
test('never reassigns another account phone',async()=>{
 const f=fixture({owner:'other-account'})
 assert.equal(await linkVerifiedPhoneToAccount(f.pool,{accountId:id,phone,verifiedByServer:true}),'phone_already_bound')
 assert.equal(f.queries.some(q=>q.sql.startsWith('INSERT')),false)
 assert.equal(f.queries.at(-2).sql,'ROLLBACK')
})
test('missing account cannot bind',async()=>{
 const f=fixture({account:false})
 assert.equal(await linkVerifiedPhoneToAccount(f.pool,{accountId:id,phone,verifiedByServer:true}),'account_not_found')
 assert.equal(f.queries.at(-2).sql,'ROLLBACK')
})
test('unique constraint conflict is not an account merge',async()=>{
 const f=fixture({insertError:'23505'})
 assert.equal(await linkVerifiedPhoneToAccount(f.pool,{accountId:id,phone,verifiedByServer:true}),'phone_already_bound')
 assert.equal(f.queries.at(-2).sql,'ROLLBACK')
})
