import test from 'node:test'
import assert from 'node:assert/strict'
import {linkVerifiedWechatIdentity} from '../src/customerIdentityLink.mjs'
const accountId='7f08a781-f880-41e6-a088-f6a849c1648a'
const subject='wx:wx0123456789abcdef:user123'
function fixture({account=true,linked=null,accountWechat=null,insertError=null}={}){
 const queries=[]
 const client={async query(sql,args=[]){
  queries.push({sql,args})
  if(sql.startsWith('SELECT id FROM customer_accounts'))return {rows:account?[{id:accountId}]:[]}
  if(sql.includes("SELECT account_id FROM customer_login_identities"))return {rows:linked?[{account_id:linked}]:[]}
  if(sql.includes('SELECT provider_subject FROM customer_login_identities'))return {rows:accountWechat?[{provider_subject:accountWechat}]:[]}
  if(sql.startsWith('INSERT')&&insertError)throw Object.assign(Error('insert_failed'),{code:insertError})
  return {rows:[]}
 },release(){queries.push({sql:'RELEASE'})}}
 return {pool:{async connect(){return client}},queries}
}
const input={accountId,wechatSubject:subject,verifiedByWechat:true,accountOwnershipVerified:true}
test('unverified attempts fail before database work',async()=>{
 const never={connect(){throw Error('should_not_connect')}}
 for(const props of [{verifiedByWechat:false},{accountOwnershipVerified:false},{accountId:'bad'},{wechatSubject:'phone:123'}])
  await assert.rejects(linkVerifiedWechatIdentity(never,{...input,...props}),/verification_required|invalid_/)
})
test('verified WeChat identity can be linked to original account',async()=>{
 const f=fixture()
 assert.equal(await linkVerifiedWechatIdentity(f.pool,input),'linked')
 assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT')).length,1)
 assert.deepEqual(f.queries.slice(-2).map(q=>q.sql),['COMMIT','RELEASE'])
})
test('existing other owner is not silently merged',async()=>{
 const f=fixture({linked:'another-account'})
 assert.equal(await linkVerifiedWechatIdentity(f.pool,input),'identity_belongs_to_other_account')
 assert.equal(f.queries.filter(q=>q.sql.startsWith('INSERT')).length,0)
})
test('same account repeated link is idempotently recognized',async()=>{
 const f=fixture({linked:accountId})
 assert.equal(await linkVerifiedWechatIdentity(f.pool,input),'already_linked')
})
test('second WeChat on same account is denied',async()=>{
 const f=fixture({accountWechat:'another-wechat'})
 assert.equal(await linkVerifiedWechatIdentity(f.pool,input),'account_already_has_wechat')
})
test('missing account and uniqueness race do not merge identities',async()=>{
 const f=fixture({account:false})
 assert.equal(await linkVerifiedWechatIdentity(f.pool,input),'account_not_found')
 const g=fixture({insertError:'23505'})
 assert.equal(await linkVerifiedWechatIdentity(g.pool,input),'identity_conflict')
 assert.equal(g.queries.at(-2).sql,'ROLLBACK')
})
