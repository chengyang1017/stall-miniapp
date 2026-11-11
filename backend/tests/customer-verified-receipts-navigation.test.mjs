import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const category=read('../../miniprogram/pages/category/category.wxml')
const catalogStyles=read('../../miniprogram/styles/customer-catalog.wxss')
const profile=read('../../miniprogram/pages/profile/profile.wxml')
const profileController=read('../../miniprogram/pages/profile/profile.ts')
const receipt=read('../../miniprogram/pages/sandbox-receipts/sandbox-receipts.wxml')
const receiptController=read('../../miniprogram/pages/sandbox-receipts/sandbox-receipts.ts')
const receiptPage=JSON.parse(read('../../miniprogram/pages/sandbox-receipts/sandbox-receipts.json'))

test('category content starts with product tools without redundant purple banner',()=>{
 assert.doesNotMatch(category,/class="category-banner"/)
 assert.doesNotMatch(category,/class="feature-label"/)
 assert.doesNotMatch(category,/发现你需要的好物/)
 assert.match(category,/class="category-toolbar"/)
 assert.match(category,/class="category-layout"/)
 assert.match(category,/class="category-sidebar"/)
 assert.match(category,/class="product-grid"/)
 assert.doesNotMatch(catalogStyles,/\.category-banner/)
 assert.match(catalogStyles,/\.category-toolbar\{[^}]*margin-top:14rpx/)
 assert.match(catalogStyles,/\.feature-banner\{/)
})

test('profile labels receipts naturally only when an authorized payment mode is enabled',()=>{
 assert.match(profile,/wx:if="{{receiptAvailable}}" class="service-row" url="\/pages\/sandbox-receipts\/sandbox-receipts"/)
 assert.match(profile,/class="profile-row-label">我的电子小票/)
 assert.doesNotMatch(profile,/我的测试电子小票/)
 assert.match(profileController,/receiptAvailable:LIVE_WECHAT_PAY_ENABLED\|\|PAYMENT_SANDBOX_UI_ENABLED/)
 assert.equal(receiptPage.navigationBarTitleText,'我的电子小票')
})

test('verified live WeChat receipts and sandbox test receipts are kept separate',()=>{
 assert.match(receiptController,/const sandboxMode=!liveMode&&PAYMENT_SANDBOX_UI_ENABLED/)
 assert.match(receiptController,/fetchWechatLiveReceipt\(cfg,o\.id\)/)
 assert.match(receiptController,/receipt\.provider!=='wechatpay:live'/)
 assert.match(receiptController,/receipt\.invoice!==false/)
 assert.match(receiptController,/receipt\.orderId!==orderId/)
 assert.match(receiptController,/formatWechatLiveReceipt\(receipt as WechatLiveReceipt\)/)
 assert.match(receiptController,/r\.sandbox===true&&r\.orderId===o\.id/)
 assert.match(receiptController,/o\.paymentSource==='wechatpay:live'/)
 assert.match(receiptController,/o\.paymentSource==='stripe:sandbox'/)
 assert.match(receiptController,/const current=\(\)=>this\.visible&&serial===this\.serial&&identity===supportIdentity\(\)/)
 assert.match(receipt,/wx:if="{{sandboxMode}}"/)
 assert.match(receipt,/Stripe Sandbox 测试交易 · 非真实付款/)
 assert.match(receipt,/微信支付已通过服务器核验 · 非税务发票/)
 assert.match(receipt,/wx:if="{{!receipt.sandbox}}"/)
 assert.doesNotMatch(receipt,/我的测试电子小票/)
})

test('receipt page keeps copy, order navigation and infinite loading actions',()=>{
 for(const action of ['copyReceipt','openOrder','loadMore']){
  assert(receipt.includes('bindtap="'+action+'"'),action)
  assert(receiptController.includes(action+'('),action)
 }
 const source=receipt.replace(/<!--[\s\S]*?-->/g,'')
 for(const tag of ['view','text','button']){
  const opens=(source.match(new RegExp('<'+tag+'(?=[\\s/>])','g'))||[]).length
  const closes=(source.match(new RegExp('</'+tag+'>','g'))||[]).length
  const self=(source.match(new RegExp('<'+tag+'(?=[\\s/>])[^>]*\\/>','g'))||[]).length
  assert.equal(opens,closes+self,tag)
 }
})
