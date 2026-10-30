import test from 'node:test'
import assert from 'node:assert/strict'
import {rotateVerifiedPhone} from '../src/customerPhoneRotation.mjs'
const accountId='7f08a781-f880-41e6-a088-f6a849c1648a'
const expectedOldPhone='+8613812345678',newPhone='+8613912345678'
const input={accountId,expectedOldPhone,newPhone,accountStepUpVerified:true,newPhoneVerified:true}
function mock({account=true,bound=expectedOldPhone,owner=null,updateError=null}={}){
 const calls=[]
 const client={async query(sql,params=[]){
  calls.push({sql,params})
  if(sql.startsWith('SELECT id'))return {rows:account?[{id:accountId}]:[]}
  if(sql.startsWith('SELECT phone_e164'))return {rows:bound?[{phone_e164:bound}]:[]}
  if(sql.startsWith('SELECT account_id'))return {rows:owner?[{account_id:owner}]:[]}
  if(sql.startsWith('UPDATE')&&updateError)throw Object.assign(Error('db_failure'),{code:updateError})
  return {rows:[]}
 },release(){calls.push({sql:'RELEASE'})}}
 return {pool:{async connect(){return client}},calls}
}
test('requires both fresh step-up authentication and new phone proof',async()=>{
 const never={connect(){throw Error('must not connect')}}
 for(const change of [{accountStepUpVerified:false},{newPhoneVerified:false}])
  await assert.rejects(rotateVerifiedPhone(never,{...input,...change}),/rotation_verification_required/)
})
test('invalid account and phone fail before any database query',async()=>{
 const never={connect(){throw Error('must not connect')}}
 for(const change of [{accountId:'bad'},{newPhone:'13812345678'},{expectedOldPhone:'+60123456789'}])
  await assert.rejects(rotateVerifiedPhone(never,{...input,...change}),/invalid_/)
})
test('rotates only verified current account phone in one transaction',async()=>{
 const f=mock()
 assert.equal(await rotateVerifiedPhone(f.pool,input),'rotated')
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE')).length,1)
 assert.equal(f.calls.at(-2).sql,'COMMIT')
 assert.equal(f.calls.find(x=>x.sql.startsWith('UPDATE')).params[1],newPhone)
})
test('stale expected old phone fails without update',async()=>{
 const f=mock({bound:'+8613712345678'})
 assert.equal(await rotateVerifiedPhone(f.pool,input),'old_phone_mismatch')
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE')).length,0)
 assert.equal(f.calls.at(-2).sql,'ROLLBACK')
})
test('new phone already bound to another account cannot be stolen',async()=>{
 const f=mock({owner:'someone-else'})
 assert.equal(await rotateVerifiedPhone(f.pool,input),'phone_already_bound')
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE')).length,0)
})
test('unique conflict rolls back and is not treated as success',async()=>{
 const f=mock({updateError:'23505'})
 assert.equal(await rotateVerifiedPhone(f.pool,input),'phone_already_bound')
 assert.equal(f.calls.at(-2).sql,'ROLLBACK')
})
test('missing account fails closed',async()=>{
 const f=mock({account:false})
 assert.equal(await rotateVerifiedPhone(f.pool,input),'account_not_found')
})
