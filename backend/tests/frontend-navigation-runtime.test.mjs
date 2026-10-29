// Runtime-oriented navigation regressions. Evaluates the actual page handlers
// with mocked WeChat APIs and deferred permissions; never makes network calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const source = path => readFileSync(new URL('../../'+path, import.meta.url), 'utf8')
function handler(file, method, following, context) {
  const code = source(file)
  const marker = new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?${method}\\(`, 'm')
  const found = marker.exec(code)
  assert.ok(found, `${file}: ${method} method not found`)
  const start = found.index + found[0].indexOf(method) - (found[0].includes('async ') ? 6 : 0)
  const end = code.indexOf(following, start)
  assert.ok(end > start, `${file}: ${method} boundary not found`)
  const body = code.slice(start,end).trim().replace(/,\s*$/, '')
  return vm.runInNewContext(`({${body}}).${method}`, context, {filename:file})
}
const profile = 'miniprogram/pages/profile/profile.ts'
const login = 'miniprogram/pages/merchant-login/merchant-login.ts'
const admin = 'miniprogram/pages/admin/admin.ts'
const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok,fail) => {resolve=ok;reject=fail})
  return {promise,resolve,reject}
}
function makeProfile(authorizedGet) {
  const calls = []
  let identity = 'user-A'
  const storage = new Map()
  const wx = {
    navigateTo: args => calls.push(['navigateTo',args.url]),
    setStorageSync: (key,value) => storage.set(key,value),
    showToast: args => calls.push(['showToast',args.title])
  }
  const globals = {wx,authorizedGet,
    CAN_OPEN_MERCHANT:true,openMerchantWorkspace:()=>wx.navigateTo({url:'/pages/admin/admin'}),
    getCloudContext:()=>({apiBase:'https://test.example',storeSlug:'demo'}),
    supportIdentity:()=>identity}
  const p = {data:{merchantAuthorized:true,supportUnread:0},merchantSerial:0,merchantOpening:false,serial:0,
    setData(v){Object.assign(this.data,v)}}
  p.openMerchant = handler(profile,'openMerchant','async onShow()',globals)
  p.onHide = handler(profile,'onHide','  onUnload',globals)
  return {p,calls,storage,setIdentity:x=>{identity=x}}
}

test('profile: a verified merchant explicitly enters workspace and saves preference',async()=>{
  const {p,calls,storage}=makeProfile(async()=>({items:[]}))
  await p.openMerchant.call(p)
  assert.deepEqual(calls,[['navigateTo','/pages/admin/admin']])
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'https://test.example|demo')
})

test('profile: rejected permission never navigates or stores merchant preference',async()=>{
  const {p,calls,storage}=makeProfile(async()=>{throw Error('denied')})
  await p.openMerchant.call(p)
  assert.equal(calls.filter(x=>x[0]==='navigateTo').length,0)
  assert.equal(storage.size,0)
  assert.equal(p.merchantOpening,false)
})

test('profile: simultaneous taps make only one authorization request',async()=>{
  const gate=deferred();let requests=0
  const {p,calls}=makeProfile(()=>{requests++;return gate.promise})
  const a=p.openMerchant.call(p), b=p.openMerchant.call(p)
  gate.resolve({items:[]})
  await Promise.all([a,b])
  assert.equal(requests,1)
  assert.equal(calls.filter(x=>x[0]==='navigateTo').length,1)
})

test('profile: hiding while permission is pending prevents late navigation',async()=>{
  const gate=deferred()
  const {p,calls,storage}=makeProfile(()=>gate.promise)
  const pending=p.openMerchant.call(p)
  p.onHide.call(p)
  gate.resolve({items:[]})
  await pending
  assert.equal(calls.filter(x=>x[0]==='navigateTo').length,0)
  assert.equal(storage.size,0)
})

test('profile: session identity changes invalidate a pending authorization',async()=>{
  const gate=deferred()
  const {p,calls,storage,setIdentity}=makeProfile(()=>gate.promise)
  const pending=p.openMerchant.call(p)
  setIdentity('user-B')
  gate.resolve({items:[]})
  await pending
  assert.equal(calls.filter(x=>x[0]==='navigateTo').length,0)
  assert.equal(storage.size,0)
})

function makeLogin(authorizedGet){
  const calls=[], storage=new Map()
  const wx={setStorageSync:(k,v)=>storage.set(k,v),navigateTo:args=>calls.push(args.url)}
  const p={data:{apiBase:'https://test.example',storeSlug:'demo',busy:false},setData(v){Object.assign(this.data,v)},config:()=>true}
  p.verifyExisting=handler(login,'verifyExisting','async loginWechat()', {wx,authorizedGet})
  return {p,calls,storage}
}

test('merchant login: passive session verification must not navigate',async()=>{
  const {p,calls,storage}=makeLogin(async()=>({items:[]}))
  await p.verifyExisting.call(p)
  assert.equal(p.data.authenticated,true)
  assert.equal(calls.length,0)
  assert.equal(storage.size,0)
})

test('merchant login: explicit verified action can navigate',async()=>{
  const {p,calls,storage}=makeLogin(async()=>({items:[]}))
  await p.verifyExisting.call(p,true)
  assert.deepEqual(calls,['/pages/admin/admin'])
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'https://test.example|demo')
})

test('merchant login: invalid permission response never navigates',async()=>{
  const {p,calls,storage}=makeLogin(async()=>({error:'unauthorized'}))
  await p.verifyExisting.call(p,true)
  assert.equal(p.data.authenticated,false)
  assert.equal(calls.length,0)
  assert.equal(storage.size,0)
})

test('merchant workbench: customer switch navigates to home tab',()=>{
  const calls=[],storage=new Map()
  const fn=handler(admin,'openCustomerShop','revision:',{
    CAN_OPEN_CUSTOMER:true,openCustomerShop:()=>calls.push('/pages/index/index'),
    getCloudContext:()=>({apiBase:'https://test.example',storeSlug:'demo'}),
    wx:{switchTab:args=>calls.push(args.url),setStorageSync:(k,v)=>storage.set(k,v)}})
  fn.call({})
  assert.deepEqual(calls,['/pages/index/index'])
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'customer|https://test.example|demo')
})
