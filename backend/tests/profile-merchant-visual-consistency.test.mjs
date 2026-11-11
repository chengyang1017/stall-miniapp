import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const profile=read('../../miniprogram/pages/profile/profile.wxml')
const profileStyles=read('../../miniprogram/pages/profile/profile.wxss')
const merchant=read('../../miniprogram/pages/admin/admin.wxml')
const merchantStyles=read('../../miniprogram/pages/admin/admin.wxss')

test('personal center uses fixed-size icon, aligned row label and separate count/arrow',()=>{
 for(const title of ['收货地址','我的收藏','浏览记录','我的商品评价']){
  assert(profile.includes('<text class="profile-row-label">'+title+'</text>'),title)
 }
 assert.match(profileStyles,/\.profile-links \.service-icon,[^}]*width:44rpx;height:44rpx;line-height:1;font-size:34rpx/)
 assert.match(profileStyles,/\.profile-row-label\{[^}]*font-size:27rpx/)
 assert.match(profileStyles,/\.profile-row-arrow\{[^}]*font-size:27rpx/)
 assert.match(profile,/class="profile-row-count">{{favoriteCount/)
 assert.match(profile,/class="profile-row-count">{{historyCount/)
 assert.match(profile,/bindtap="openFavorites"/)
 assert.match(profile,/bindtap="openHistory"/)
})

test('help, service and merchant entry icons have consistent wrappers and text scale',()=>{
 assert.equal((profile.match(/class="help-icon"/g)||[]).length,4)
 assert.equal((profile.match(/class="help-label"/g)||[]).length,4)
 assert.match(profileStyles,/\.help-grid \.help-icon\{[^}]*font-size:36rpx/)
 assert.match(profileStyles,/\.help-grid \.help-label\{[^}]*font-size:24rpx/)
 assert.match(profileStyles,/\.merchant-entry \.profile-merchant-title\{[^}]*font-size:28rpx/)
 assert.match(profile,/bindtap="openMerchant"/)
 assert.match(profile,/bindtap="serviceInfo"/)
})

test('merchant amounts, switches and buttons use unified type sizes without changing actions',()=>{
 assert.equal((merchant.match(/merchant-setting-toggle-label/g)||[]).length,2)
 assert.equal((merchant.match(/color="#7137db"/g)||[]).length,2)
 assert.match(merchant,/class="merchant-minimum-current merchant-setting-amount">¥/)
 assert.match(merchant,/class="merchant-minimum-current merchant-setting-amount">每单 ¥/)
 assert.match(merchantStyles,/\.merchant-minimum \.merchant-setting-amount\{[^}]*font-size:29rpx/)
 assert.match(merchantStyles,/\.merchant-minimum \.merchant-setting-toggle-label\{[^}]*font-size:27rpx/)
 assert.match(merchantStyles,/\.merchant-minimum \.merchant-save\{[^}]*font-size:25rpx!important/)
 for(const action of ['saveMinimumOrder','toggleDeliveryFee','toggleTrackingVisibility','saveDeliveryFee']){
  assert(merchant.includes(action),action)
 }
})
