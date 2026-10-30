import test from 'node:test'
import assert from 'node:assert/strict'
import {rotateVerifiedPhone} from '../src/customerPhoneRotation.mjs'
const accountId='7f08a781-f880-41e6-a088-f6a849c1648a'
const expectedOldPhone='+8613812345678',newPhone='+8613912345678'
const input={accountId,expectedOldPhone,newPhone,accountStepUpVerified:true,newPhoneVerified:true}
function mock({account=true,bound=expectedOldPhone,owner=null,updateError=null,updatedRows=1,auditError=null,sessionError=null}={}){
 const calls=[]
 const client={async query(sql,params=[]){
  calls.push({sql,params})
  if(sql.startsWith('SELECT id'))return {rows:account?[{id:accountId}]:[]}
  if(sql.startsWith('SELECT phone_e164'))return {rows:bound?[{phone_e164:bound}]:[]}
  if(sql.startsWith('SELECT account_id'))return {rows:owner?[{account_id:owner}]:[]}
  if(sql.startsWith('INSERT INTO customer_phone_rotation_audit')&&auditError)throw Error('audit_write_failed')
  if(sql.startsWith('UPDATE customer_account_sessions')&&sessionError)throw Error('session_revoke_failed')
  if(sql.startsWith('UPDATE customer_verified_phones')&&updateError)throw Object.assign(Error('db_failure'),{code:updateError})
  if(sql.startsWith('UPDATE'))return {rowCount:updatedRows}
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
 assert.equal(f.calls.filter(x=>x.sql.startsWith('UPDATE')).length,2)
 assert.equal(f.calls.filter(x=>x.sql.startsWith('INSERT INTO customer_phone_rotation_audit')).length,1)
 assert.equal(f.calls.find(x=>x.sql.startsWith('INSERT INTO customer_phone_rotation_audit')).params[1],'5678')
 assert.equal(f.calls.some(x=>x.sql.startsWith('UPDATE customer_account_sessions')),true)
 assert.equal(f.calls.at(-2).sql,'COMMIT')
 assert.equal(f.calls.find(x=>x.sql.startsWith('UPDATE customer_verified_phones')).params[1],newPhone)
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

test('same-number operation verifies account and current phone before returning unchanged',async()=>{
 const f=mock()
 assert.equal(await rotateVerifiedPhone(f.pool,{...input,newPhone:expectedOldPhone}),'unchanged')
 assert.equal(f.calls.some(x=>x.sql.startsWith('SELECT phone_e164')),true)
 assert.equal(f.calls.some(x=>x.sql.startsWith('UPDATE')),false)
 const missing=mock({account:false})
 assert.equal(await rotateVerifiedPhone(missing.pool,{...input,newPhone:expectedOldPhone}),'account_not_found')
 const stale=mock({bound:'+8613712345678'})
 assert.equal(await rotateVerifiedPhone(stale.pool,{...input,newPhone:expectedOldPhone}),'old_phone_mismatch')
})
test('concurrent update with zero affected rows is not reported as a successful rotation',async()=>{
 const f=mock({updatedRows:0})
 assert.equal(await rotateVerifiedPhone(f.pool,input),'old_phone_mismatch')
 assert.equal(f.calls.at(-2).sql,'ROLLBACK')
})

test('audit failure rolls back number change and session operations',async()=>{
 const f=mock({auditError:true})
 await assert.rejects(rotateVerifiedPhone(f.pool,input),/audit_write_failed/)
 assert.equal(f.calls.at(-2).sql,'ROLLBACK')
 assert.equal(f.calls.some(x=>x.sql.startsWith('UPDATE customer_account_sessions')),false)
})
test('session revocation failure rolls back number change and audit',async()=>{
 const f=mock({sessionError:true})
 await assert.rejects(rotateVerifiedPhone(f.pool,input),/session_revoke_failed/)
 assert.equal(f.calls.at(-2).sql,'ROLLBACK')
})
test('no phone change means no audit record or session revocation',async()=>{
 const f=mock()
 assert.equal(await rotateVerifiedPhone(f.pool,{...input,newPhone:expectedOldPhone}),'unchanged')
 assert.equal(f.calls.some(x=>x.sql.startsWith('INSERT INTO customer_phone_rotation_audit')),false)
 assert.equal(f.calls.some(x=>x.sql.startsWith('UPDATE customer_account_sessions')),false)
})
