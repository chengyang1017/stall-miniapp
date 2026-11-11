import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8')
const xml=read('../../miniprogram/pages/addresses/addresses.wxml')
const css=read('../../miniprogram/pages/addresses/addresses.wxss')
const logic=read('../../miniprogram/pages/addresses/addresses.ts')
const nav=JSON.parse(read('../../miniprogram/pages/addresses/addresses.json'))

test('address redesign uses matching purple customer cards and compact controls',()=>{
 assert.match(css,/@import "\.\.\/\.\.\/styles\/customer-theme\.wxss"/)
 assert.match(css,/page\{background:#f6f3ff/)
 assert.match(css,/\.address-card\{padding:22rpx/)
 assert.match(css,/\.address-form-card\{width:100%;box-sizing:border-box;padding:24rpx/)
 assert.match(css,/\.address-map-row\{width:100%;box-sizing:border-box/)
 assert.match(css,/\.address-map-button\{[^}]*width:140rpx!important;[^}]*box-sizing:border-box/)
 assert.match(css,/\.address-save-btn\{[^}]*width:100%!important;box-sizing:border-box;[^}]*margin:24rpx 0 0!important/)
 assert.match(css,/\.address-cancel-btn\{[^}]*width:100%!important;box-sizing:border-box/)
 assert.match(css,/\.address-save-btn\{[^}]*background:linear-gradient\(135deg,#9559ee,#4930c3\)/)
 assert.match(css,/\.default-tag\{[^}]*color:#6a38c7/)
 assert.equal(nav.navigationBarTitleText,'收货地址')
 assert.equal(nav.navigationBarTextStyle,'white')
 assert.doesNotMatch(xml,/class="address-heading-title"/)
 assert.doesNotMatch(xml,/class="address-cloud-state"/)
 assert.doesNotMatch(xml,/class="address-bottom-note"/)
 assert.doesNotMatch(xml,/云端地址/)
 assert.match(xml,/class="address-section-head"/)
 assert.match(xml,/wx:if="{{deliveryError}}" class="address-alert"/)
 assert.match(xml,/bindtap="login"/)
 assert.match(xml,/bindtap="refresh"/)
})

test('all existing address operations and cloud safety guards remain wired',()=>{
 for(const name of ['choose','edit','setDefault','remove','save','clearForm','chooseMapLocation','login','refresh']){
  assert(xml.includes('bindtap="'+name+'"'),name)
 }
 for(const name of ['changeName','changePhone','changeArea','changeDetail']){
  assert(xml.includes('="'+name+'"'),name)
 }
 assert.match(xml,/cloudMode && \(addressBusy \|\| addressListSync \|\| deliveryBusy \|\| deliveryError \|\| item\.deliveryIssue\)/)
 assert.match(xml,/addressBusy \|\| \(cloudMode && \(deliveryBusy \|\| deliveryError\)\)/)
 assert.match(logic,/async cloudChange\(/)
 assert.match(logic,/async setDefault\(/)
 assert.match(logic,/async save\(/)
 assert.match(logic,/selectAddress\(id\)/)
 assert.match(xml,/wx:for="{{addresses}}"/)
})

test('phone account test-only address operations remain available but visually separated',()=>{
 assert.match(xml,/class="address-phone-testing"/)
 assert.match(xml,/测试功能/)
 assert.match(xml,/wx:for="{{phoneAddressList}}"/)
 for(const name of ['phoneEdit','phoneDefault','phoneRemove','phoneNew','phoneField','phoneSave']){
  assert(xml.includes('="'+name+'"'),name)
 }
 assert.match(logic,/async phoneSave\(/)
 assert.match(logic,/phoneWrite\(method:/)
})

test('address WXML tag counts are balanced',()=>{
 const source=xml.replace(/<!--[\s\S]*?-->/g,'')
 for(const tag of ['view','text','button','input','picker']){
  const opens=(source.match(new RegExp('<'+tag+'(?=[\\s/>])','g'))||[]).length
  const closes=(source.match(new RegExp('</'+tag+'>','g'))||[]).length
  const self=(source.match(new RegExp('<'+tag+'(?=[\\s/>])[^>]*\\/>','g'))||[]).length
  assert.equal(opens,closes+self,tag)
 }
})
