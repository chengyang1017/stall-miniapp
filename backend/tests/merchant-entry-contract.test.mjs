// Repository-level regression guard for one AppID and merchant-first navigation.
// Reads the actual source files; does not simulate a successful authorization.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8')
const index=read('miniprogram/pages/index/index.ts')
const home=read('miniprogram/pages/index/index.wxml')
const login=read('miniprogram/pages/merchant-login/merchant-login.ts')
const auth=read('miniprogram/modules/shared/runtime/auth.ts')
const app=JSON.parse(read('miniprogram/app.json'))

test('one AppID contains merchant-login and admin plus customer landing page',()=>{
 assert.ok(app.pages.includes('pages/index/index'))
 assert.ok(app.pages.includes('pages/merchant-login/merchant-login'))
 assert.ok(app.pages.includes('pages/admin/admin'))
})
test('shop homepage does not display a merchant administration entry',()=>{
 assert.doesNotMatch(home,/bindtap=["']goAdmin["']/)
 assert.doesNotMatch(home,/商家管理演示/)
})
test('merchant preference is set only after server-backed permission check',()=>{
 const validate=login.indexOf("const result = await authorizedGet(")
 const check=login.indexOf("Array.isArray(result.items)")
 const save=login.indexOf("wx.setStorageSync('stall_merchant_home_preference_v1'")
 assert.ok(validate>=0 && check>validate && save>check)
 assert.match(login,/url:'\/pages\/admin\/admin'/)
})
test('app opening cannot route to merchant without fresh authorized request',()=>{
 const section=index.slice(index.indexOf('const merchantPreference='),index.indexOf("this.setData({entryLoading:false});refreshPagePresentation(this);"))
 assert.match(section,/await authorizedGet\(/)
 assert.match(section,/Array\.isArray\(result.items\)/)
 assert.ok(section.indexOf('await authorizedGet(')<section.indexOf('openMerchantWorkspace()'))
 assert.match(read('miniprogram/modules/integration/singleAppHost.ts'),/wx.navigateTo\(\{url:'\/pages\/admin\/admin'\}\)/)
 assert.match(auth,/Authorization: `Bearer \$\{token\}`/)
})
test('merchant logout clears saved merchant-first preference',()=>{
 assert.match(login,/wx.removeStorageSync\('stall_merchant_home_preference_v1'\)/)
})

test('merchant can choose the customer shop without creating another AppID',()=>{
 const admin=read('miniprogram/pages/admin/admin.ts')
 const layout=read('miniprogram/pages/admin/admin.wxml')
 assert.match(admin,/openCustomerShop\(/)
 assert.match(admin,/customer\|/)
 assert.match(admin,/if\(!CAN_OPEN_CUSTOMER\)return/)
 assert.match(read('miniprogram/modules/integration/singleAppHost.ts'),/wx.switchTab/)
 assert.match(layout,/bindtap="openCustomerShop"/)
})
test('customer profile shows merchant navigation only after a server check',()=>{
 const profile=read('miniprogram/pages/profile/profile.ts')
 const layout=read('miniprogram/pages/profile/profile.wxml')
 assert.match(profile,/await authorizedGet\(/)
 assert.match(profile,/merchantAuthorized:false/)
 assert.match(profile,/async openMerchant\(/)
 assert.match(layout,/wx:if="\{\{merchantAuthorized\}\}"/)
})
