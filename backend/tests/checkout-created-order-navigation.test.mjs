import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {readFileSync} from 'node:fs'

const checkoutSource=readFileSync(new URL('../../miniprogram/pages/checkout/checkout.ts',import.meta.url),'utf8')
const app=JSON.parse(readFileSync(new URL('../../miniprogram/app.json',import.meta.url),'utf8'))
const targets=JSON.parse(readFileSync(new URL('../../apps/build-targets.json',import.meta.url),'utf8'))
const orderId='12345678-1234-4234-8234-123456789012'

function fixture({live=true,switchFailure=false}={}){
 let identity='user-a'
 let definition
 let modal
 const trace=[]
 const stack=['/pages/cart/cart','/pages/checkout/checkout']
 let pendingSwitch=null,created=0
 const wx={
  switchTab:options=>{
   trace.push(['switchTab',options.url])
   pendingSwitch=()=>{
    if(switchFailure){options.fail?.({errMsg:'switchTab:fail'});return}
    stack.splice(0,stack.length,options.url)
    options.success?.()
   }
  },
  navigateTo:options=>{trace.push(['navigateTo',options.url]);stack.push(options.url);options.success?.()},
  redirectTo:options=>{trace.push(['redirectTo',options.url]);stack[stack.length-1]=options.url;options.success?.()},
  showModal:options=>{modal=options;trace.push(['modal',options.title])},
  showToast:options=>trace.push(['toast',options.title]),
  getStorageSync:()=>null,setStorageSync:()=>{}
 }
 const address={receiverName:'测试收货人',phone:'13800138000',detail:'3号楼101',area:'区域A',latitude:23,longitude:113}
 const rules={accepting:true,areas:[{id:'region-a',name:'区域A',enabled:true}]}
 const slots=[{id:'slot-a',label:'上午',start:'09:00',end:'12:00'}]
 const context={
  Page:value=>definition=value,wx,console,Date,Math,
  LIVE_WECHAT_PAY_ENABLED:live,PAYMENT_SANDBOX_UI_ENABLED:!live,CLOUD_ONLY:true,
  supportIdentity:()=>identity,
  cloudCartConfig:()=>({storeSlug:'stall-test'}),
  getSelectedAddress:()=>address,
  resolveDeliveryArea:()=>rules.areas[0],
  deliveryAddressReason:()=>'',
  cloudDeliveryReason:()=>'',
  localDate:()=> '2026-11-11',
  availableCloudSlots:()=>slots,
  createCloudOrder:async()=>{created++;return {orderId,totalCents:1200}}
 }
 const js=stripTypeScriptTypes(checkoutSource,{mode:'strip'}).replace(/^import\s+.*$/gm,'')
 vm.runInNewContext(js,context,{filename:'checkout.ts'})
 const page={...definition,data:structuredClone(definition.data),cloudSerial:0,
  setData(patch){Object.assign(this.data,patch)}}
 page.data.cloudBusy=false
 page.data.cloudError=''
 page.data.deliveryError=''
 page.data.minimumReached=true
 page.data.totalCount=1
 page.data.cloudRules=rules
 page.data.deliveryDate='2026-11-11'
 page.data.selectedSlotId='slot-a'
 page.checkoutContext='user-a'
 return {
  page,stack,trace,
  confirm:()=>modal?.success?.({confirm:true}),
  navigate:()=>pendingSwitch?.(),
  changeIdentity:value=>identity=value,
  created:()=>created,
  getModal:()=>modal
 }
}

test('orders tab is placed under cloud payment detail, so Back returns orders not checkout',async()=>{
 const f=fixture()
 await f.page.submitCloudOrder()
 assert.equal(f.created(),1)
 assert.equal(f.getModal()?.title,'订单已创建（待支付）')
 f.confirm()
 assert.deepEqual(f.trace.slice(-1).map(x=>[...x]),[['switchTab','/pages/orders/orders']])
 f.navigate()
 assert.deepEqual(f.trace.slice(-1).map(x=>[...x]),[['navigateTo','/pages/order-detail/order-detail?id='+orderId]])
 assert.deepEqual(f.stack.slice(-2),['/pages/orders/orders','/pages/order-detail/order-detail?id='+orderId])
 f.stack.pop()
 assert.equal(f.stack.at(-1),'/pages/orders/orders')
 assert(!f.stack.some(x=>x.includes('/checkout/checkout')))
})

test('Sandbox navigation retains only WeChat test channel and returns to order list',async()=>{
 const f=fixture({live:false})
 await f.page.submitCloudOrder()
 f.confirm()
 f.navigate()
 assert.equal(f.stack.at(-1),'/pages/order-detail/order-detail?id='+orderId+'&sandboxChannel=wechat_pay')
 f.stack.pop()
 assert.equal(f.stack.at(-1),'/pages/orders/orders')
})

test('navigation failure redirects to detail rather than leaving completed checkout in the Back stack',async()=>{
 const f=fixture({switchFailure:true})
 await f.page.submitCloudOrder()
 f.confirm()
 f.navigate()
 assert.equal(f.stack.at(-1),'/pages/order-detail/order-detail?id='+orderId)
 assert(!f.stack.includes('/pages/checkout/checkout'))
})

test('already-created order is reused on another submit; no second order is created',async()=>{
 const f=fixture()
 await f.page.submitCloudOrder()
 await f.page.submitCloudOrder()
 assert.equal(f.created(),1)
 assert.equal(f.trace.filter(x=>x[0]==='switchTab').length,1)
})

test('identity switch before a delayed navigation callback prevents cross-account order opening',async()=>{
 const f=fixture()
 await f.page.submitCloudOrder()
 f.confirm()
 f.changeIdentity('user-b')
 f.navigate()
 assert.equal(f.stack.at(-1),'/pages/orders/orders')
 assert.equal(f.trace.filter(x=>x[0]==='navigateTo').length,0)
})

test('success and fallback routes are registered and detail is not a Tab page',()=>{
 const paths=app.tabBar.list.map(x=>x.pagePath)
 assert(paths.includes('pages/orders/orders'))
 assert(!paths.includes('pages/order-detail/order-detail'))
 assert(targets.targets.customer.pages.includes('pages/orders/orders'))
 assert(targets.targets.customer.pages.includes('pages/order-detail/order-detail'))
 assert.match(checkoutSource,/this\.createdOrderId=result\.orderId/)
 assert.match(checkoutSource,/wx\.switchTab\(\{/)
 assert.match(checkoutSource,/wx\.redirectTo\(\{/)
})
