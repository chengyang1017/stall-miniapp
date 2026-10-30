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
