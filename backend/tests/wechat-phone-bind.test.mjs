import test from 'node:test'
import assert from 'node:assert/strict'
import {customerWechatPhoneBindRoute} from '../src/customerWechatPhone.mjs'

function response(){
 const out={status:null,body:null}
 return {out,res:{writeHead(code){out.status=code},end(value){out.body=JSON.parse(value)}}}
}
test('non-phone route is not intercepted',async()=>{
 const {out,res}=response()
 const handled=await customerWechatPhoneBindRoute({method:'POST'},res,new URL('http://localhost/v1/other'),null)
 assert.equal(handled,false)
 assert.equal(out.status,null)
})
test('phone binding defaults to unavailable and cannot contact database',async()=>{
 const keys=['PAYMENT_DB_ENV','CUSTOMER_ACCOUNT_MAPPING_ENABLED','WECHAT_PHONE_BIND_ENABLED']
 const saved=keys.map(k=>process.env[k])
 try{
  for(const k of keys)delete process.env[k]
  const {out,res}=response()
  const handled=await customerWechatPhoneBindRoute({method:'POST'},res,new URL('http://localhost/v1/customer/phone/wechat-bind'),{connect(){throw Error('should not connect')}})
  assert.equal(handled,true)
  assert.equal(out.status,404)
  assert.equal(out.body.error,'not_enabled')
 }finally{keys.forEach((k,i)=>saved[i]===undefined?delete process.env[k]:process.env[k]=saved[i])}
})
test('phone binding rejects unexpected HTTP method',async()=>{
 const {out,res}=response()
 assert.equal(await customerWechatPhoneBindRoute({method:'GET'},res,new URL('http://localhost/v1/customer/phone/wechat-bind'),null),false)
 assert.equal(out.status,null)
})

import {saveVerifiedWechatPhone} from '../src/customerWechatPhone.mjs'
function fakeDb({account='account-a',owner=null,failInsert=null}={}){
 const statements=[];let released=false
 const client={async query(sql,args=[]){
  statements.push({sql,args})
  if(sql.startsWith('SELECT a.id'))return {rows:account?[{id:account}]:[]}
  if(sql.startsWith('SELECT account_id'))return {rows:owner?[{account_id:owner}]:[]}
  if(sql.startsWith('INSERT')&&failInsert)throw Object.assign(Error('database error'),{code:failInsert})
  return {rows:[]}
 },release(){released=true}}
 return {pool:{async connect(){return client}},statements,get released(){return released}}
}
test('verified phone is saved transactionally against authenticated account',async()=>{
 const db=fakeDb()
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'bound')
 assert.deepEqual(db.statements.map(x=>x.sql.startsWith('SELECT')?'SELECT':x.sql.startsWith('INSERT')?'INSERT':x.sql),['BEGIN','SELECT','SELECT','INSERT','COMMIT'])
 assert.equal(db.statements.find(x=>x.sql.startsWith('INSERT')).args[0],'account-a')
 assert.equal(db.released,true)
})
test('different account owning phone is never merged or overwritten',async()=>{
 const db=fakeDb({owner:'account-b'})
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'phone_already_bound')
 assert.equal(db.statements.some(x=>x.sql.startsWith('INSERT')),false)
 assert.equal(db.statements.at(-1).sql,'ROLLBACK')
 assert.equal(db.released,true)
})
test('missing authenticated account cannot bind',async()=>{
 const db=fakeDb({account:null})
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'profile_not_found')
 assert.equal(db.statements.at(-1).sql,'ROLLBACK')
 assert.equal(db.released,true)
})
test('database write failures roll back and release connection',async()=>{
 const db=fakeDb({failInsert:'08006'})
 await assert.rejects(saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'))
 assert.equal(db.statements.at(-1).sql,'ROLLBACK')
 assert.equal(db.released,true)
})
test('unique phone constraint conflicts return conflict without commit',async()=>{
 const db=fakeDb({failInsert:'23505'})
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'phone_already_bound')
 assert.equal(db.statements.at(-1).sql,'ROLLBACK')
})
test('invalid phone and untrusted subject never connect to database',async()=>{
 const db=fakeDb()
 await assert.rejects(saveVerifiedWechatPhone(db.pool,'wx:verified','13812345678'),/invalid_verified_phone_input/)
 await assert.rejects(saveVerifiedWechatPhone(db.pool,'unverified','+8613812345678'),/invalid_verified_phone_input/)
 assert.equal(db.statements.length,0)
})
