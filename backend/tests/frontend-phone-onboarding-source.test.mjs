import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const root=new URL('../../miniprogram/pages/profile/',import.meta.url)
const ts=readFileSync(new URL('profile.ts',root),'utf8')
const wxml=readFileSync(new URL('profile.wxml',root),'utf8')
test('first WeChat login checks phone status after verified login',()=>{
 assert.match(ts,/await loginWithWechat\(cfg\.apiBase\)/)
 assert.match(ts,/await this\.checkFirstLoginPhoneBinding\(serial,cfg\.apiBase\)/)
 assert.match(ts,/status\?\.bound===false&&status\?\.verificationAvailable===true/)
})
test('phone consent uses official WeChat authorization and verified server endpoint',()=>{
 assert.match(wxml,/open-type="getPhoneNumber" bindgetphonenumber="bindFirstLoginPhone"/)
 assert.match(ts,/\/v1\/customer\/phone\/wechat-bind/)
 assert.match(wxml,/稍后再绑定/)
 assert.match(ts,/phone_already_bound/)
})
test('phone binding URL uses a valid slash-trimming expression',()=>{
 assert.ok(ts.includes("cfg.apiBase.replace(/\\/$/,'')"),'expected a single escaped slash')
 assert.equal(ts.includes("cfg.apiBase.replace(/\\\\/$/,'')"),false,'invalid double-backslash regex')
})
test('onboarding does not survive logout or navigation',()=>{
 assert.match(ts,/phoneOnboarding:false,phoneBindBusy:false,loginBusy:false/)
 assert.match(ts,/onHide\(\).*phoneOnboarding:false/)
})

test('phone login session is stored separately and can be independently verified and revoked',()=>{
 assert.match(ts,/stall_customer_phone_session_v1/)
 assert.match(ts,/refreshPhoneSession\(\)/)
 assert.match(ts,/logoutPhoneSession\(\)/)
 assert.match(ts,/\/v1\/customer\/auth\/session/)
 assert.match(wxml,/bindtap="logoutPhoneSession"/)
})

test('phone address editing preserves existing map coordinates and stable create retry key',()=>{
 const addr=readFileSync(new URL('../addresses/addresses.ts',root),'utf8')
 assert.match(addr,/latitude:original\?\.latitude\?\?null/)
 assert.match(addr,/longitude:original\?\.longitude\?\?null/)
 assert.match(addr,/locationName:original\?\.locationName\?\?''/)
 assert.match(addr,/mapAddress:original\?\.mapAddress\?\?''/)
 assert.match(addr,/this\.phoneCreateFingerprint!==fingerprint/)
 assert.match(addr,/this\.phoneCreateKey=supportKey\(\)/)
 assert.doesNotMatch(addr,/detail,latitude:null,longitude:null,locationName:'',mapAddress:''/)
})
