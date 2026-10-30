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
function fakeDb({account='account-a',owner=null,currentPhone=null,failInsert=null}={}){
 const statements=[];let released=false
 const client={async query(sql,args=[]){
  statements.push({sql,args})
  if(sql.startsWith('SELECT a.id'))return {rows:account?[{id:account}]:[]}
  if(sql.startsWith('SELECT account_id'))return {rows:owner?[{account_id:owner}]:[]}
  if(sql.startsWith('SELECT phone_e164'))return {rows:currentPhone?[{phone_e164:currentPhone}]:[]}
  if(sql.startsWith('INSERT')&&failInsert)throw Object.assign(Error('database error'),{code:failInsert})
  return {rows:[]}
 },release(){released=true}}
 return {pool:{async connect(){return client}},statements,get released(){return released}}
}
test('verified phone is saved transactionally against authenticated account',async()=>{
 const db=fakeDb()
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'bound')
 assert.deepEqual(db.statements.map(x=>x.sql.startsWith('SELECT')?'SELECT':x.sql.startsWith('INSERT')?'INSERT':x.sql),['BEGIN','SELECT','SELECT','SELECT','INSERT','COMMIT'])
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
test('repeated same-number binding is idempotent and cannot overwrite verification timestamp',async()=>{
 const db=fakeDb({currentPhone:'+8613812345678'})
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'bound')
 assert.equal(db.statements.some(x=>x.sql.startsWith('INSERT')),false)
 assert.equal(db.statements.at(-1).sql,'COMMIT')
})
test('first-login binding cannot silently replace a previously verified phone',async()=>{
 const db=fakeDb({currentPhone:'+8613912345678'})
 assert.equal(await saveVerifiedWechatPhone(db.pool,'wx:verified','+8613812345678'),'phone_change_requires_reverification')
 assert.equal(db.statements.some(x=>x.sql.startsWith('INSERT')),false)
 assert.equal(db.statements.at(-1).sql,'ROLLBACK')
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

import {verifyWechatPhoneCode} from '../src/customerWechatPhone.mjs'
const app={appId:'wx0123456789abcdef',secret:'test-secret'}
function wechatReplies(phoneResult,tokenResult={access_token:'mock-token'}){
 const calls=[]
 const request=async(url,options={})=>{
  calls.push({url:String(url),options})
  return {ok:true,json:async()=>calls.length===1?tokenResult:phoneResult}
 }
 return {request,calls}
}
test('official response yields a verified E.164 number without trusting client phone text',async()=>{
 const w=wechatReplies({errcode:0,phone_info:{countryCode:'86',purePhoneNumber:'13812345678'}})
 assert.equal(await verifyWechatPhoneCode(app,'test-valid-code',w.request),'+8613812345678')
 assert.equal(w.calls.length,2)
 assert.match(w.calls[1].url,/getuserphonenumber/)
 assert.deepEqual(JSON.parse(w.calls[1].options.body),{code:'test-valid-code'})
})
test('invalid or expired phone authorization code is rejected',async()=>{
 const w=wechatReplies({errcode:40029,errmsg:'invalid code'})
 await assert.rejects(verifyWechatPhoneCode(app,'expired-code',w.request),/phone_verification_failed/)
})
test('invalid regional or malformed phone responses are rejected',async()=>{
 for(const phone of [{countryCode:'60',purePhoneNumber:'13812345678'},{countryCode:'86',purePhoneNumber:'1234'}]){
  const w=wechatReplies({errcode:0,phone_info:phone})
  await assert.rejects(verifyWechatPhoneCode(app,'test-code',w.request),/phone_verification_failed/)
 }
})
test('missing access token stops before the second API call',async()=>{
 const w=wechatReplies({errcode:0},{errcode:40013})
 await assert.rejects(verifyWechatPhoneCode(app,'test-code',w.request),/wechat_access_token_unavailable/)
 assert.equal(w.calls.length,1)
})
test('HTTP error from WeChat does not produce a number',async()=>{
 const request=async()=>({ok:false,status:503})
 await assert.rejects(verifyWechatPhoneCode(app,'test-code',request),/wechat_unavailable/)
})

import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

test('identity schema and phone grants are present in reviewed migrations',()=>{
 const root=new URL('../',import.meta.url)
 const schema=readFileSync(new URL('sql/023_customer_identity_groundwork.sql',root),'utf8')
 const grants=readFileSync(new URL('migrations/proposals/wechat-verified-phone-binding.sql',root),'utf8')
 assert.match(schema,/CREATE TABLE IF NOT EXISTS customer_verified_phones/)
 assert.match(schema,/phone_e164 text NOT NULL UNIQUE/)
 assert.match(schema,/account_id uuid PRIMARY KEY/)
 assert.match(schema,/REVOKE ALL ON customer_accounts,customer_login_identities,customer_verified_phones FROM PUBLIC/)
 for(const fragment of [
  'GRANT INSERT ON public.customer_accounts',
  'GRANT SELECT (id) ON public.customer_accounts',
  'GRANT INSERT (account_id,provider,provider_subject,verified_at) ON public.customer_login_identities',
  'GRANT SELECT (account_id,provider,provider_subject) ON public.customer_login_identities',
  'GRANT SELECT (account_id,phone_e164,verified_at) ON public.customer_verified_phones',
  'GRANT INSERT (account_id,phone_e164,verified_at) ON public.customer_verified_phones',
  'GRANT UPDATE (phone_e164,verified_at) ON public.customer_verified_phones'
 ])assert.ok(grants.includes(fragment),'missing permission: '+fragment)
})

test('first verified WeChat login privilege preflight is not phone-write-only',()=>{
 const root=new URL('../',import.meta.url)
 const preflight=readFileSync(new URL('scripts/check-phone-binding-readiness.mjs',root),'utf8')
 for(const flag of ['account_create','account_id_read','login_account_insert','login_provider_insert','login_subject_insert','login_verified_insert','insufficient_first_wechat_login_privileges'])
  assert.ok(preflight.includes(flag),'missing first-login preflight check: '+flag)
})
