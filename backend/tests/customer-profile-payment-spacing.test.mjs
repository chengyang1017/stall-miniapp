import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const profile=read('../../miniprogram/pages/profile/profile.wxml')
const profileCss=read('../../miniprogram/pages/profile/profile.wxss')
const checkout=read('../../miniprogram/pages/checkout/checkout.wxml')
const checkoutCss=read('../../miniprogram/pages/checkout/checkout.wxss')
const mark=read('../../miniprogram/assets/payment/wechat-pay-mark.svg')

test('main profile links and settings use equally compact row height and padding',()=>{
 assert.match(profile,/class="surface profile-links"/)
 assert.match(profile,/class="surface account-controls"/)
 assert.match(profile,/设置与隐私/)
 assert.match(profileCss,/\.profile-links \.service-row,\.account-controls \.service-row\{min-height:78rpx/)
 assert.match(profileCss,/\.profile-body \.profile-links,\.profile-body \.account-controls\{padding:8rpx 24rpx\}/)
 assert.match(profileCss,/\.profile-body \.profile-links \.service-row,\.profile-body \.account-controls \.service-row\{min-height:78rpx\}/)
 assert.doesNotMatch(profileCss,/min-height:92rpx/)
})

test('both WeChat checkout modes show local genuine green payment icon instead of a glyph',()=>{
 const src='/assets/payment/wechat-pay-mark.svg'
 assert.equal(checkout.split('src="'+src+'"').length-1,2)
 assert.doesNotMatch(checkout,/class="payment-mark payment-mark-wechat">微/)
 assert.match(checkout,/wx:if="{{cloudMode && livePayEnabled}}"/)
 assert.match(checkout,/wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled}}"/)
 assert.match(checkout,/仅供测试/)
 assert.match(checkout,/不代表微信支付已开通/)
 assert.match(mark,/viewBox="39 12 42 39"/)
 assert.match(mark,/fill="#14AB39"/)
 assert.match(mark,/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
 assert.match(checkoutCss,/\.checkout-payment\{padding:22rpx 24rpx\}/)
 assert.match(checkoutCss,/\.checkout-payment \.wechat-pay-logo\{[^}]*width:60rpx;height:60rpx/)
})

test('profile and checkout WXML remain balanced',()=>{
 for(const xml of [profile,checkout]){
  const stripped=xml.replace(/<!--[\s\S]*?-->/g,'')
  for(const tag of ['view','text','navigator','button','picker','image']){
   const opens=(stripped.match(new RegExp('<'+tag+'(?=[\\s/>])','g'))||[]).length
   const closes=(stripped.match(new RegExp('</'+tag+'>','g'))||[]).length
   const self=(stripped.match(new RegExp('<'+tag+'(?=[\\s/>])[^>]*\\/>','g'))||[]).length
   assert.equal(opens,closes+self,tag)
  }
 }
})
