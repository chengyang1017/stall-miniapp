const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path')
const base=path.resolve(__dirname,'../../dist/customer/miniprogram')
const view=require(path.join(base,'modules/shared/domain/sandboxPayment.js')).sandboxPaymentView
const label=require(path.join(base,'modules/shared/domain/payment.js')).paymentLabel
const cfg={apiBase:'https://sandbox.invalid',storeSlug:'sandbox-test'},id='11111111-1111-4111-8111-111111111111'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function page(name,target='customer',paymentMode='sandbox'){
 let definition,identity='synthetic-A',requests=[],orders=[],modal,navigations=[]
 const mock={LIVE_WECHAT_PAY_ENABLED:paymentMode==='live',PAYMENT_SANDBOX_UI_ENABLED:paymentMode==='sandbox',cloudIdentity:()=>identity,customerOrdersConfig:()=>cfg,merchantOrderConfig:()=>cfg,merchantOrderContextKey:()=>identity,
  sandboxPaymentView:view,paymentLabel:label,sandboxPaymentRequest:(...args)=>{const d=deferred();requests.push({...d,args});return d.promise},customerOrdersRequest:()=>{const d=deferred();orders.push(d);return d.promise}}
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../dist/'+target+'/miniprogram/pages/'+name+'/'+name+'.js'),'utf8'),{
  exports:{},require:()=>mock,Page:p=>{definition=p},wx:{navigateTo:o=>navigations.push(o.url),showModal:o=>{modal=o},showToast(){},setClipboardData(){}}
 })
 const p={...definition,data:structuredClone(definition.data),setData(data){Object.assign(this.data,data)},detailVisible:true,detailSerial:1,visible:true,serial:1}
 p.data.order={id,paymentStatus:'unpaid'}
 return {p,requests,orders,navigations,modal:()=>modal,switchIdentity:()=>{identity='synthetic-B'}}
}
const status={sandbox:true,attempts:[{id:'attempt',channel:'card',amountCents:1000,status:'succeeded'}],refunds:[],receipts:[{id:'receipt',totalCents:1000,items:[]}],canRefund:true}
test('compiled customer page queries provider-backed status then refreshes order payment label',async()=>{
 const f=page('order-detail'),job=f.p.loadSandboxPayment()
 f.requests[0].resolve(status);await new Promise(setImmediate)
 f.orders[0].resolve({order:{paymentStatus:'paid',paymentSource:'stripe:sandbox'}});await job
 assert.equal(f.p.data.order.paymentStatus,'paid');assert.match(f.p.data.paymentText,/Sandbox/);assert.equal(f.p.data.sandbox.receipts.length,1)
})
test('compiled customer page discards hidden or changed-identity receipt response',async()=>{
 for(const action of ['hide','identity']){
  const f=page('order-detail'),job=f.p.loadSandboxPayment()
  if(action==='hide')f.p.detailVisible=false;else f.switchIdentity()
  f.requests[0].resolve(status);await job
  assert.equal(f.p.data.sandbox,null);assert.equal(f.orders.length,0)
 }
})
test('compiled merchant page reads receipts and discards stale store context',async()=>{
 const f=page('admin-orders','merchant'),job=f.p.viewSandboxPayment({currentTarget:{dataset:{id}}})
 assert.equal(f.requests[0].args[2],true);f.requests[0].resolve(status);await job
 assert.equal(f.p.data.sandbox.receipts.length,1)
 const second=f.p.viewSandboxPayment({currentTarget:{dataset:{id}}});f.switchIdentity();f.requests[1].resolve(status);await second
 assert.equal(f.p.data.sandbox,null)
})
test('merchant refund requires fresh server balance and refuses invalid amount before HTTP',async()=>{
 const f=page('admin-orders','merchant')
 f.p.data.sandboxOrderId=id
 f.p.data.sandbox=view({...status,canRefund:false})
 await f.p.requestSandboxRefund({currentTarget:{dataset:{mode:'partial'}}})
 assert.equal(f.requests.length,0)
 f.p.data.sandbox=view(status)
 const pending=f.p.requestSandboxRefund({currentTarget:{dataset:{mode:'partial'}}})
 assert.equal(f.requests.length,1)
 assert.equal(f.requests[0].args[3],undefined) // GET fresh server-backed balance first
 f.requests[0].resolve({...status,refundableAmountCents:1000})
 await new Promise(setImmediate)
 assert.ok(f.modal())
 f.modal().success({confirm:true,content:'-1.00'})
 await pending
 assert.equal(f.requests.length,1) // no refund POST for invalid input
 assert.equal(f.p.data.sandboxRefundBusy,false)
})

test('compiled checkout accepts only WeChat sandbox channel',()=>{
 const f=page('checkout')
 assert.equal(f.p.data.sandboxChannel,'wechat_pay')
 for(const channel of ['alipay','card','fake']){
  f.p.chooseSandboxChannel({currentTarget:{dataset:{channel}}})
  assert.equal(f.p.data.sandboxChannel,'wechat_pay')
 }
 f.p.chooseSandboxChannel({currentTarget:{dataset:{channel:'wechat_pay'}}})
 assert.equal(f.p.data.sandboxChannel,'wechat_pay')
})
test('compiled merchant production build refuses Alipay sandbox event handlers',async()=>{
 const checkout=page('checkout','customer','live')
 checkout.p.chooseSandboxChannel({currentTarget:{dataset:{channel:'alipay'}}})
 assert.equal(checkout.p.data.sandboxChannel,'wechat_pay')
 const detail=page('order-detail','customer','live')
 await detail.p.loadSandboxPayment()
 await detail.p.openSandboxCheckout({currentTarget:{dataset:{channel:'alipay'}}})
 assert.equal(detail.requests.length,0)
})
test('view models preserve all payment, refund and original receipt states',()=>{
 const data=view({attempts:['creating','processing','failed','cancelled','expired','succeeded','refund_required'].map(status=>({status,channel:'wechat_pay',amountCents:1000})),refunds:['pending','processing','submitted','succeeded','review'].map(status=>({status,amountCents:250})),receipts:[{totalCents:1000,items:[{unitPriceCents:500,quantity:2}]}]})
 assert.equal(data.attempts.length,7);assert.ok(data.attempts.every(x=>x.label&&x.channelText.includes('Stripe')))
 assert.equal(data.refunds.length,5);assert.equal(data.receipts[0].items[0].unitText,'5.00')
})
test('shared compiled HTTP adapter uses merchant route and rejects changed identity or untrusted success',async()=>{
 const file=path.join(base,'modules/shared/api/sandboxPayment.js')
 for(const mode of ['identity','untrusted','network']){
  let request,identity='synthetic-A';const exports={}
  vm.runInNewContext(fs.readFileSync(file,'utf8'),{exports,require:()=>({cloudIdentity:()=>identity,getSessionToken:()=> 'synthetic-session'}),wx:{request:r=>{request=r}}})
  const job=exports.sandboxPaymentRequest(cfg,id,true)
  assert.ok(request.url.includes('/v1/merchant/stores/'))
  if(mode==='identity'){identity='synthetic-B';request.success({statusCode:200,data:status})}
  else if(mode==='untrusted')request.success({statusCode:200,data:{sandbox:false}})
  else request.fail()
  await assert.rejects(job)
 }
})

test('compiled orders page carries selected test channel to existing order without creating a new order',()=>{
 const f=page('orders');f.p.data.cloudMode=true
 f.p.openSandboxOrder({currentTarget:{dataset:{id,channel:'wechat_pay'}}})
 assert.equal(f.navigations[0],'/pages/order-detail/order-detail?id='+id+'&sandboxChannel=wechat_pay')
 f.p.openSandboxOrder({currentTarget:{dataset:{id,channel:'fake'}}});assert.equal(f.navigations.length,1)
})
test('shared order labels distinguish Sandbox progress and refunds from Staging simulation',()=>{
 assert.match(label({paymentStatus:'unpaid',sandboxPaymentStatus:'processing'}),/付款处理中/)
 assert.match(label({paymentStatus:'paid',paymentSource:'stripe:sandbox',sandboxRefundStatus:'submitted'}),/退款处理中/)
 assert.match(label({paymentStatus:'paid',paymentSource:'staging_simulated',sandboxRefundStatus:'submitted'}),/模拟支付/)
})
