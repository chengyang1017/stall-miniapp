import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const manifest=JSON.parse(read('../../miniprogram/app.json'))
const config=JSON.parse(read('../../apps/build-targets.json'))
const admin=read('../../miniprogram/pages/admin/admin.wxml')
const adminTs=read('../../miniprogram/pages/admin/admin.ts')
const banner=read('../../miniprogram/pages/admin-banner/admin-banner.wxml')
const bannerTs=read('../../miniprogram/pages/admin-banner/admin-banner.ts')
const checkout=read('../../miniprogram/pages/checkout/checkout.wxml')

test('banner manager is a merchant-only independent page, linked from dashboard',()=>{
 const page='pages/admin-banner/admin-banner'
 assert(manifest.pages.includes(page))
 assert.deepEqual(manifest.pages,config.targets.combined.pages)
 assert(config.targets.merchant.pages.includes(page))
 assert(!config.targets.customer.pages.includes(page))
 assert.equal(config.pages[page],'merchant')
 assert.match(admin,/url="\/pages\/admin-banner\/admin-banner"/)
 assert.doesNotMatch(admin,/bindtap="uploadPromoBanner"/)
 assert.doesNotMatch(adminTs,/uploadPromoBanner\(/)
 assert.doesNotMatch(admin,/部分功能仍在逐步接入云端/)
})

test('standalone banner page preserves upload, replacement, ordering, deletion and version check',()=>{
 for(const action of ['uploadPromoBanner','changePromoOrder','removePromoBanner','hidePromoBanner'])
  assert.match(banner,new RegExp('bindtap="'+action+'"'))
 assert.match(banner,/1200 × 300/)
 assert.match(banner,/5MB/)
 assert.match(bannerTs,/patchMerchantBusiness\(cfg,this\.revision,\{promoBannerImageKeys:keys\}\)/)
 assert.match(bannerTs,/settings\.revision!==revision/)
 assert.match(bannerTs,/businessContextKey\(\)/)
 assert.match(bannerTs,/merchantBusiness\(cfg\)/)
})

test('production payment remains clean and Sandbox must still be labeled as a test',()=>{
 const sandboxStart=checkout.indexOf('wx:if="{{cloudMode && !livePayEnabled && sandboxUiEnabled}}"')
 const liveStart=checkout.indexOf('wx:if="{{cloudMode && livePayEnabled}}"')
 const offStart=checkout.indexOf('wx:if="{{cloudMode && !livePayEnabled && !sandboxUiEnabled}}"')
 assert(sandboxStart>=0&&liveStart>sandboxStart&&offStart>liveStart)
 const sandbox=checkout.slice(sandboxStart,liveStart)
 const live=checkout.slice(liveStart,offStart)
 assert.match(sandbox,/仅供测试/)
 assert.match(sandbox,/不代表微信支付已开通/)
 assert.match(live,/微信支付/)
 assert.doesNotMatch(live,/Stripe|Sandbox|测试|外部/)
 assert.doesNotMatch(checkout,/Stripe/)
})
