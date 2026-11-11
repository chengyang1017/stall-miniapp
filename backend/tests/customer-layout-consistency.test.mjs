import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const category=read('../../miniprogram/pages/category/category.wxml')
const categoryStyles=read('../../miniprogram/styles/customer-catalog.wxss')
const cart=read('../../miniprogram/pages/cart/cart.wxml')
const cartStyles=read('../../miniprogram/pages/cart/cart.wxss')
const checkoutStyles=read('../../miniprogram/pages/checkout/checkout.wxss')

test('category sidebar maintains spacing and one-line labels',()=>{
 assert.match(category,/class="side-category-label">全部商品<\/text>/)
 assert.match(category,/class="side-category-label">{{item.name}}<\/text>/)
 assert.match(categoryStyles,/\.category-layout\{display:flex;gap:22rpx/)
 assert.match(categoryStyles,/\.side-category \.side-category-label\{[^}]*white-space:nowrap/)
})

test('merchant-disabled coupons are comments only, while cart delivery and order note stay usable',()=>{
 const notes=cart.match(/<!-- 商家目前未启用优惠券[\s\S]*?-->/g)||[]
 assert.equal(notes.length,2)
 const visible=cart.replace(/<!--[\s\S]*?-->/g,'')
 assert.doesNotMatch(visible,/优惠券/)
 assert.match(visible,/url="\/pages\/addresses\/addresses"/)
 assert.match(visible,/bindinput="updateCartNote"/)
 assert.match(cartStyles,/\.cart-services \.service-row\{min-height:88rpx/)
})

test('checkout uses the same purple customer palette instead of green',()=>{
 assert.match(checkoutStyles,/page\{background:#f6f3ff;color:#2e243c\}/)
 assert.match(checkoutStyles,/\.slot-selected\{border-color:#7137db/)
 assert.match(checkoutStyles,/\.payment-option-active\{border-color:#7137db/)
 assert.match(checkoutStyles,/\.place-order\{[^}]*background:linear-gradient\(135deg,#9559ee,#4430bd\)!important/)
 assert.doesNotMatch(checkoutStyles,/#(?:1a8554|218657|238758|228758|f4f6f5)\b/i)
})
