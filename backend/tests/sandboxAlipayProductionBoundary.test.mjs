import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const checkout=read('../../miniprogram/pages/checkout/checkout.ts')
const checkoutWxml=read('../../miniprogram/pages/checkout/checkout.wxml')
const detail=read('../../miniprogram/pages/order-detail/order-detail.ts')
const detailWxml=read('../../miniprogram/pages/order-detail/order-detail.wxml')
test('Alipay is rendered only inside explicitly sandbox-only WXML sections',()=>{
 const start=checkoutWxml.indexOf('wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled}}"')
 const end=checkoutWxml.indexOf('wx:if="{{cloudMode && livePayEnabled}}"')
 assert(start>=0&&end>start)
 assert(checkoutWxml.slice(start,end).includes('data-channel="alipay"'))
 assert(!checkoutWxml.slice(end).includes('data-channel="alipay"'))
 assert.match(detailWxml,/wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled && !phoneReadOnly/ )
})
test('sandbox handlers reject production or simultaneous live flags, including direct invocation',()=>{
 assert.match(checkout,/chooseSandboxChannel\(e:any\)\{if\(!PAYMENT_SANDBOX_UI_ENABLED\|\|LIVE_WECHAT_PAY_ENABLED\)return/)
 assert.match(detail,/sandboxPaymentAllowed\(\)\{return PAYMENT_SANDBOX_UI_ENABLED&&!LIVE_WECHAT_PAY_ENABLED\}/)
 for(const method of ['scheduleSandboxPolling','copySandboxReceipt','loadSandboxPayment',
   'copyActiveSandboxCheckout','cancelSandboxPayment','switchSandboxChannel',
   'createSandboxCheckoutLink','retrySandboxCheckout','openSandboxCheckout']){
  const start=detail.indexOf(method+'(')
  assert(start>=0,method)
  assert(detail.slice(start,start+250).includes('if(!this.sandboxPaymentAllowed())return'),method)
 }
 assert.match(checkout,/LIVE_WECHAT_PAY_ENABLED&&PAYMENT_SANDBOX_UI_ENABLED/)
})
