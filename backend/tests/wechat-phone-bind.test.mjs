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
