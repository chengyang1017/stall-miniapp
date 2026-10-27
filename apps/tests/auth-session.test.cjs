const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const TOKEN = 'stall_server_session_v1'
const CONFIG = 'stall_cloud_catalog_config_v1'
const SCOPE = 'stall_server_cache_scope_v1'
const oldToken = 'a'.repeat(43), newToken = 'b'.repeat(43)
function fixture(target = 'combined', withPage = false) {
  const root = path.resolve(__dirname, '../../dist', target, 'miniprogram')
  const storage = new Map([[TOKEN, oldToken], [SCOPE, 'old-scope'], [CONFIG, {apiBase:'https://staging.invalid',storeSlug:'sample'}]])
  const logins = [], requests = [], calls = [], cache = new Map()
  let page
  const wx = {
    getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),
    removeStorageSync:k=>storage.delete(k),getSystemInfoSync:()=>({platform:'devtools'}),
    login:args=>logins.push(args),request:args=>requests.push(args),
    navigateTo:args=>calls.push(args.url),showToast:()=>{}
  }
  function load(file) {
    if(cache.has(file))return cache.get(file).exports
    const module={exports:{}};cache.set(file,module)
    const fn=vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{wx,Page:p=>{page=p}},{filename:file})
    fn(spec=>load(path.resolve(path.dirname(file),spec+'.js')),module,module.exports)
    return module.exports
  }
  const auth=load(path.join(root,'modules/shared/runtime/auth.js'))
  if(withPage) {
    load(path.join(root,'pages/merchant-login/merchant-login.js'))
    page.data=structuredClone(page.data)
    page.setData=values=>Object.assign(page.data,values)
  }
  return {auth,storage,logins,requests,calls,page}
}
function start(f,active) {
  const promise=f.auth.loginWithWechat('https://staging.invalid',active)
  // Register a rejection handler before manually firing any deferred callback.
  promise.catch(()=>{})
  return promise
}
const success = request=>request.success({statusCode:200,data:{token:newToken,cacheScope:'c'.repeat(64)}})
test('current WeChat login saves the verified response and cache scope',async()=>{
  const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'});success(f.requests[0]);await p
  assert.equal(f.storage.get(TOKEN),newToken);assert.equal(f.storage.get(SCOPE),'c'.repeat(64))
  assert.equal(f.requests[0].timeout,15000)
})
test('store switch during wx.login prevents sending the old code',async()=>{
  const f=fixture(),p=start(f);f.storage.set(CONFIG,{apiBase:'https://staging.invalid',storeSlug:'other'})
  f.logins[0].success({code:'synthetic-code'})
  if(f.requests[0])success(f.requests[0])
  await assert.rejects(p,/session_or_store_changed/);assert.equal(f.requests.length,0)
  assert.equal(f.storage.get(TOKEN),oldToken)
})
test('backend switch during exchange cannot overwrite session or scope',async()=>{
  const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'})
  f.storage.set(CONFIG,{apiBase:'https://other.invalid',storeSlug:'sample'});success(f.requests[0])
  await assert.rejects(p,/session_or_store_changed/)
  assert.equal(f.storage.get(TOKEN),oldToken);assert.equal(f.storage.get(SCOPE),'old-scope')
})
test('logout during exchange cannot be undone by a late login response',async()=>{
  const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'});f.storage.delete(TOKEN)
  success(f.requests[0]);await assert.rejects(p,/session_or_store_changed/);assert.equal(f.storage.has(TOKEN),false)
})
test('replacement session cannot be overwritten by a late exchange',async()=>{
  const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'});f.storage.set(TOKEN,'d'.repeat(43))
  success(f.requests[0]);await assert.rejects(p,/session_or_store_changed/);assert.equal(f.storage.get(TOKEN),'d'.repeat(43))
})
test('newer login supersedes an earlier exchange even if the earlier one returns first',async()=>{
  const f=fixture(),first=start(f);f.logins[0].success({code:'synthetic-one'})
  const second=start(f);f.logins[1].success({code:'synthetic-two'})
  success(f.requests[0]);await assert.rejects(first,/session_or_store_changed/)
  success(f.requests[1]);await second;assert.equal(f.storage.get(TOKEN),newToken)
})
test('inactive requesting page cannot start a backend exchange',async()=>{
  const f=fixture();let active=true;const p=start(f,()=>active);active=false
  f.logins[0].success({code:'synthetic-code'});if(f.requests[0])success(f.requests[0])
  await assert.rejects(p,/session_or_store_changed/)
  assert.equal(f.requests.length,0)
})
test('inactive requesting page cannot save an in-flight exchange',async()=>{
  const f=fixture();let active=true;const p=start(f,()=>active)
  f.logins[0].success({code:'synthetic-code'});active=false;success(f.requests[0])
  await assert.rejects(p,/session_or_store_changed/);assert.equal(f.storage.get(TOKEN),oldToken)
})
test('malformed server token is rejected without overwriting the session',async()=>{
  for(const token of ['', 'short', 'has spaces '.repeat(5)]) {
    const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'})
    f.requests[0].success({statusCode:200,data:{token}})
    await assert.rejects(p,/server_login_failed/);assert.equal(f.storage.get(TOKEN),oldToken)
  }
})
test('HTTP and network failures preserve the previous session',async()=>{
  for(const fail of [request=>request.success({statusCode:503,data:{}}),request=>request.fail(Error('offline'))]) {
    const f=fixture(),p=start(f);f.logins[0].success({code:'synthetic-code'});fail(f.requests[0])
    await assert.rejects(p);assert.equal(f.storage.get(TOKEN),oldToken)
  }
})

for(const target of ['combined','merchant']) {
  test(`${target} merchant logout: old response cannot release a newer identity verification`,async()=>{
    const f=fixture(target,true);f.page.pageVisible=true
    f.page.setData({apiBase:'https://staging.invalid',storeSlug:'sample'})
    const pending=f.page.logout();f.page.onHide();f.storage.set(TOKEN,newToken);f.page.onShow()
    f.requests[0].success({statusCode:200,data:{}});await pending
    assert.equal(f.storage.get(TOKEN),newToken);assert.equal(f.page.data.busy,true)
    f.requests[1].success({statusCode:200,data:{items:[]}});await Promise.resolve();await Promise.resolve()
    assert.equal(f.page.data.authenticated,true);assert.equal(f.page.data.busy,false)
  })
  test(`${target} merchant login: hidden page cannot authenticate or navigate after permission response`,async()=>{
    const f=fixture(target,true);f.page.pageVisible=true
    f.page.setData({apiBase:'https://staging.invalid',storeSlug:'sample'})
    const pending=f.page.verifyExisting(true);f.page.onHide()
    f.requests[0].success({statusCode:200,data:{items:[]}});await pending
    assert.equal(f.page.data.authenticated,false);assert.equal(f.calls.length,0)
  })
  test(`${target} merchant login: current explicit verification opens workspace only after authorization`,async()=>{
    const f=fixture(target,true);f.page.pageVisible=true
    f.page.setData({apiBase:'https://staging.invalid',storeSlug:'sample'})
    const pending=f.page.verifyExisting(true);assert.equal(f.calls.length,0)
    f.requests[0].success({statusCode:200,data:{items:[]}});await pending
    assert.equal(f.page.data.authenticated,true);assert.deepEqual(f.calls,['/pages/admin/admin'])
  })
  test(`${target} merchant login: old finally cannot release a newer page verification`,async()=>{
    const f=fixture(target,true);f.page.pageVisible=true
    f.page.setData({apiBase:'https://staging.invalid',storeSlug:'sample'})
    const old=f.page.verifyExisting();f.page.onHide();f.page.onShow()
    assert.equal(f.requests.length,2);f.requests[0].fail(Error('offline'));await old
    assert.equal(f.page.data.busy,true);assert.equal(f.page.data.authenticated,false)
    f.requests[1].success({statusCode:200,data:{items:[]}});await Promise.resolve();await Promise.resolve()
    assert.equal(f.page.data.busy,false);assert.equal(f.page.data.authenticated,true)
    assert.equal(f.calls.length,0)
  })
  test(`${target} merchant login: busy inputs and repeat verification cannot switch the request context`,async()=>{
    const f=fixture(target,true);f.page.pageVisible=true
    f.page.setData({apiBase:'https://staging.invalid',storeSlug:'sample'})
    const pending=f.page.verifyExisting(true)
    f.page.onBaseInput({detail:{value:'https://other.invalid'}})
    f.page.onSlugInput({detail:{value:'other'}});await f.page.verifyExisting(true)
    assert.equal(f.requests.length,1);assert.equal(f.page.data.storeSlug,'sample')
    assert.equal(f.page.data.apiBase,'https://staging.invalid')
    f.requests[0].success({statusCode:403,data:{error:'forbidden'}});await pending
    assert.equal(f.page.data.authenticated,false);assert.equal(f.calls.length,0)
  })
  test(`${target} merchant login: leaving during code exchange prevents session resurrection`,async()=>{
    const f=fixture(target,true);f.storage.delete(TOKEN);f.page.onShow()
    const pending=f.page.loginWechat();f.logins[0].success({code:'synthetic-code'});f.page.onHide()
    success(f.requests[0]);await pending
    assert.equal(f.storage.has(TOKEN),false);assert.equal(f.calls.length,0)
    assert.equal(f.page.data.busy,false);assert.equal(f.page.data.authenticated,false)
  })
}
