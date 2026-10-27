const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '../..')
// Execute actual compiled pages with in-memory wx APIs; no network or backend.
function fixture(target, page, denied = false) {
  const base = path.join(root, 'dist', target, 'miniprogram')
  const storage = new Map([
    ['stall_cloud_catalog_config_v1', {apiBase:'https://staging.invalid',storeSlug:'sample'}],
    ['stall_server_session_v1', 'a'.repeat(43)],
    ['stall_merchant_home_preference_v1', 'https://staging.invalid|sample']
  ])
  const calls = [], cache = new Map()
  let definition
  const wx = {
    getStorageSync:key=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value),
    removeStorageSync:key=>storage.delete(key),getSystemInfoSync:()=>({platform:'devtools'}),
    request:args=>{calls.push(['request',args.url]);args.success({statusCode:denied?403:200,data:denied?{error:'forbidden'}:{items:[]}})},
    navigateTo:args=>calls.push(['navigateTo',args.url]),switchTab:args=>calls.push(['switchTab',args.url]),
    showToast:args=>calls.push(['toast',args.title]),showShareMenu:()=>{},hideShareMenu:()=>{}
  }
  function load(file) {
    file = path.resolve(file)
    if(cache.has(file))return cache.get(file).exports
    const module = {exports:{}};cache.set(file,module)
    const wrapper = vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})', {
      wx,Page:value=>{definition=value},setTimeout,clearTimeout,console
    }, {filename:file})
    wrapper(spec=>{assert.ok(spec.startsWith('.'));return load(path.resolve(path.dirname(file),spec+'.js'))},module,module.exports)
    return module.exports
  }
  load(path.join(base,'pages',page,page+'.js'))
  const p = definition
  p.data = structuredClone(p.data)
  p.setData = values=>Object.assign(p.data,values)
  return {p,calls,storage,wx}
}
test('Combined homepage resumes a freshly authorized merchant workspace',async()=>{
  const {p,calls}=fixture('combined','index');await p.onShow()
  assert.equal(calls.filter(c=>c[0]==='request').length,1)
  assert.ok(calls.some(c=>c[0]==='navigateTo'&&c[1]==='/pages/admin/admin'))
})
test('Customer homepage ignores a saved Combined merchant preference',async()=>{
  const {p,calls}=fixture('customer','index');let loaded=0
  p.loadCloudHome=()=>{loaded++};await p.onShow()
  assert.equal(loaded,1)
  assert.equal(calls.filter(c=>c[0]==='navigateTo'||(c[0]==='request'&&c[1].includes('/v1/merchant/'))).length,0)
})
test('Customer profile never requests merchant permissions or opens workspace',async()=>{
  const {p,calls}=fixture('customer','profile');await p.checkMerchant()
  p.data.merchantAuthorized=true;await p.openMerchant()
  assert.equal(calls.length,0)
})
test('Combined profile still authorizes before explicitly opening workspace',async()=>{
  const {p,calls,storage}=fixture('combined','profile');await p.checkMerchant();await p.openMerchant()
  assert.equal(calls.filter(c=>c[0]==='request').length,2)
  assert.ok(calls.some(c=>c[0]==='navigateTo'&&c[1]==='/pages/admin/admin'))
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'https://staging.invalid|sample')
})
test('Combined profile does not navigate after a rejected permission request',async()=>{
  const {p,calls}=fixture('combined','profile',true);await p.checkMerchant();await p.openMerchant()
  assert.equal(p.data.merchantAuthorized,false)
  assert.equal(calls.filter(c=>c[0]==='navigateTo').length,0)
})
test('Combined workbench can explicitly switch back to customer tab',()=>{
  const {p,calls,storage}=fixture('combined','admin');p.openCustomerShop()
  assert.equal(p.data.canOpenCustomer,true)
  assert.deepEqual(calls,[['switchTab','/pages/index/index']])
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'customer|https://staging.invalid|sample')
})
test('Merchant workbench hides and rejects an unavailable customer tab',()=>{
  const {p,calls,storage}=fixture('merchant','admin');p.openCustomerShop()
  assert.equal(p.data.canOpenCustomer,false)
  assert.equal(calls.length,0)
  assert.equal(storage.get('stall_merchant_home_preference_v1'),'https://staging.invalid|sample')
  const layout=fs.readFileSync(path.join(root,'dist/merchant/miniprogram/pages/admin/admin.wxml'),'utf8')
  assert.match(layout,/wx:if="\{\{canOpenCustomer\}\}"[^>]*bindtap="openCustomerShop"/)
})

test('Combined profile suppresses repeated taps while permission is pending',async()=>{
  const {p,calls,wx}=fixture('combined','profile');let reply,requests=0
  wx.request=args=>{requests++;reply=args.success};p.data.merchantAuthorized=true
  const first=p.openMerchant(),second=p.openMerchant();reply({statusCode:200,data:{items:[]}})
  await Promise.all([first,second]);assert.equal(requests,1)
  assert.equal(calls.filter(c=>c[0]==='navigateTo').length,1)
})
test('Combined profile ignores permission response after hiding',async()=>{
  const {p,calls,wx}=fixture('combined','profile');let reply
  wx.request=args=>{reply=args.success};p.data.merchantAuthorized=true
  const pending=p.openMerchant();p.onHide();reply({statusCode:200,data:{items:[]}});await pending
  assert.equal(calls.filter(c=>c[0]==='navigateTo').length,0)
})
test('Combined profile ignores permission response after identity replacement',async()=>{
  const {p,calls,wx,storage}=fixture('combined','profile');let reply
  wx.request=args=>{reply=args.success};p.data.merchantAuthorized=true
  const pending=p.openMerchant();storage.set('stall_server_session_v1','b'.repeat(43))
  reply({statusCode:200,data:{items:[]}});await pending
  assert.equal(calls.filter(c=>c[0]==='navigateTo').length,0)
})
test('Combined homepage does not resume workspace after denied permission',async()=>{
  const {p,calls}=fixture('combined','index',true);p.loadCloudHome=()=>{}
  await p.onShow();assert.equal(calls.filter(c=>c[0]==='navigateTo').length,0)
})
