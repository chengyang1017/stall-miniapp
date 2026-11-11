import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const checkout=read('../../miniprogram/pages/checkout/checkout.ts')
const checkoutWxml=read('../../miniprogram/pages/checkout/checkout.wxml')
const detail=read('../../miniprogram/pages/order-detail/order-detail.ts')
const detailWxml=read('../../miniprogram/pages/order-detail/order-detail.wxml')
const orders=read('../../miniprogram/pages/orders/orders.ts')

test('only WeChat sandbox payment actions appear in customer-facing checkout and order detail',()=>{
 const start=checkoutWxml.indexOf('wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled}}"')
 const end=checkoutWxml.indexOf('wx:if="{{cloudMode && livePayEnabled}}"')
 assert(start>=0&&end>start)
 const sandboxCheckout=checkoutWxml.slice(start,end)
 assert.match(sandboxCheckout,/data-channel="wechat_pay"/)
 assert.doesNotMatch(sandboxCheckout,/data-channel="(?:card|alipay)"/)
 assert.match(detailWxml,/wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled && !phoneReadOnly/)
 assert.match(detailWxml,/data-channel="wechat_pay"/)
 assert.doesNotMatch(detailWxml,/data-channel="(?:card|alipay)"/)
 // Historical attempts and receipt labels are retained; no old transaction data is deleted.
 assert.match(detailWxml,/sandbox\.attempts/)
 assert.match(detailWxml,/sandbox\.receipts/)
 assert.match(detailWxml,/sandbox\.resumeCheckout\.channel !== 'wechat_pay'/)
})

test('payment event handlers reject hidden sandbox channels even when invoked directly',()=>{
 assert.match(checkout,/chooseSandboxChannel\(e:any\)\{if\(!PAYMENT_SANDBOX_UI_ENABLED\|\|LIVE_WECHAT_PAY_ENABLED\)return/)
 assert.match(checkout,/if\(channel==='wechat_pay'\)this\.setData/)
 assert.match(checkout,/sandboxChannel:'wechat_pay'/)
 assert.match(detail,/sandboxPaymentAllowed\(\)\{return PAYMENT_SANDBOX_UI_ENABLED&&!LIVE_WECHAT_PAY_ENABLED\}/)
 assert.match(detail,/if\(!cfg\|\|channel!=='wechat_pay'\|\|this\.phoneReadOnly/)
 assert.match(detail,/if\(!this\.sandboxPaymentAllowed\(\)\|\|channel!=='wechat_pay'\)return/)
 assert.match(detail,/resumeCheckout\?\.channel!=='wechat_pay'/)
 assert.match(orders,/channel!=='wechat_pay'/)
 for(const method of ['scheduleSandboxPolling','copySandboxReceipt','loadSandboxPayment',
   'copyActiveSandboxCheckout','cancelSandboxPayment','switchSandboxChannel',
   'createSandboxCheckoutLink','retrySandboxCheckout','openSandboxCheckout']){
  const location=detail.indexOf('\n  async '+method+'(')>=0
   ?detail.indexOf('\n  async '+method+'('):detail.indexOf('\n  '+method+'(')
  assert(location>=0,method)
  assert(detail.slice(location,location+320).includes('if(!this.sandboxPaymentAllowed())return')||
    (method==='createSandboxCheckoutLink'&&detail.slice(location,location+320).includes('if(!this.sandboxPaymentAllowed()||channel')),method)
 }
 assert.match(checkout,/LIVE_WECHAT_PAY_ENABLED&&PAYMENT_SANDBOX_UI_ENABLED/)
})
