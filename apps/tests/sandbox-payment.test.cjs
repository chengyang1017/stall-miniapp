const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const path=require('node:path')
function fixture(){
 let identity='synthetic-A',request
 const exports={}
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../dist/customer/miniprogram/modules/customer/api/sandboxPayment.js'),'utf8'),{
  exports,require:()=>({cloudIdentity:()=>identity}),wx:{getStorageSync:()=> 'synthetic-session',request:r=>{request=r}},Promise,Error
 })
 return {api:exports,request:()=>request,switchIdentity(){identity='synthetic-B'}}
}
const cfg={apiBase:'https://test.invalid',storeSlug:'demo'},id='11111111-1111-4111-8111-111111111111'
for(const channel of ['card','alipay','wechat_pay'])test(channel+' actual compiled adapter only accepts external test Checkout',async()=>{
 const f=fixture(),job=f.api.createSandboxCheckout(cfg,id,channel,'synthetic_request_123')
 assert.equal(f.request().data.channel,channel)
 assert.equal(f.request().header['Idempotency-Key'],'synthetic_request_123')
 f.request().success({statusCode:200,data:{testMode:true,nativePayment:false,channel,url:'https://checkout.stripe.com/c/pay/cs_test_demo'}})
 assert.equal(await job,'https://checkout.stripe.com/c/pay/cs_test_demo')
})
test('late response after identity change is discarded',async()=>{
 const f=fixture(),job=f.api.createSandboxCheckout(cfg,id,'card','synthetic_request_123')
 f.switchIdentity();f.request().success({statusCode:200,data:{}})
 await assert.rejects(job,/identity_changed/)
})
test('network interruption remains unknown, never successful',async()=>{
 const f=fixture(),job=f.api.createSandboxCheckout(cfg,id,'card','synthetic_request_123')
 f.request().fail();await assert.rejects(job,/network_result_unknown/)
})
test('non Stripe URL is rejected',async()=>{
 const f=fixture(),job=f.api.createSandboxCheckout(cfg,id,'card','synthetic_request_123')
 f.request().success({statusCode:200,data:{testMode:true,nativePayment:false,channel:'card',url:'https://checkout.stripe.com.attacker.invalid/'}})
 await assert.rejects(job,/sandbox_checkout_unavailable/)
})
