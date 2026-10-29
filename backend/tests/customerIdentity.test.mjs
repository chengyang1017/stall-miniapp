import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveVerifiedWechatAccount} from '../src/customerIdentity.mjs'
const subject='wx:wxeb1890c397d038d8:openid123'
function fakePool(){
  const state={identity:null,created:0,queries:[],releases:0}
  return {state,async connect(){
    return {async query(sql,args=[]){
      state.queries.push(sql)
      if(sql.includes('SELECT account_id FROM customer_login_identities'))return {rows:state.identity?[{account_id:state.identity}]:[]}
      if(sql.includes('INSERT INTO customer_accounts')){state.created++;return {rows:[{id:'customer-1'}]}}
      if(sql.includes('INSERT INTO customer_login_identities')){state.identity=args[0];return {rows:[]}}
      return {rows:[]}
    },release(){state.releases++}}
  }}
}
test('same verified WeChat subject always maps to the same account',async()=>{
  const db=fakePool()
  assert.equal(await resolveVerifiedWechatAccount(db,subject),'customer-1')
  assert.equal(await resolveVerifiedWechatAccount(db,subject),'customer-1')
  assert.equal(db.state.created,1)
  assert.equal(db.state.releases,2)
  assert.equal(db.state.queries.filter(s=>s==='COMMIT').length,2)
})
test('rejects unverified and phone-supplied identifiers',async()=>{
  const db=fakePool()
  for(const bad of ['+8613812345678','wx:fake','',null]){
    await assert.rejects(resolveVerifiedWechatAccount(db,bad),/unverified_wechat_identity/)
  }
  assert.equal(db.state.created,0)
})
test('failed insert rolls back and releases connection',async()=>{
  let rolledBack=false,released=false
  const db={async connect(){return{async query(sql){
    if(sql.includes('SELECT account_id'))return{rows:[]}
    if(sql.includes('INSERT INTO customer_accounts'))throw Error('database_failed')
    if(sql==='ROLLBACK')rolledBack=true
    return {rows:[]}
  },release(){released=true}}}}
  await assert.rejects(resolveVerifiedWechatAccount(db,subject),/database_failed/)
  assert.equal(rolledBack,true)
  assert.equal(released,true)
})

test('legacy order subject is not replaced by internal account id',async()=>{
 const db=fakePool()
 const internal=await resolveVerifiedWechatAccount(db,subject)
 assert.equal(internal,'customer-1')
 assert.notEqual(internal,subject)
 assert.equal(db.state.identity,internal)
})
