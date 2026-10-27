// Offline only: actual profile policy and TypeScript controllers, synthetic wx transport.
// No phone acceptance, deployed data, live login, network, database or Docker operation.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmdirSync,existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import { validatePhoneProfile,cloudSource,readPhoneProfile } from '../../scripts/phone-preview-profile.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url))
const profile={version:1,environment:'staging',apiBase:'https://api.staging.unit.test',storeSlug:'real-store',appId:'wx0123456789abcdef'}
const clone=v=>JSON.parse(JSON.stringify(v))
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
function code(file){
 let js=stripTypeScriptTypes(readFileSync(file,'utf8'),{mode:'strip',sourceUrl:file})
 js=js.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,list,spec)=>`const {${list.replace(/\s+as\s+/g,': ')}}=require(${JSON.stringify(spec)});`)
 const names=[]
 js=js.replace(/^export\s+(?=(?:async\s+)?(?:const|let|function|class)\s+(\w+))/gm,(_,name)=>{names.push(name);return ''})
 assert.doesNotMatch(js,/^\s*(?:import|export)\b/m)
 return js+'\n'+names.map(n=>`exports.${n}=${n};`).join('\n')
}
function fixture(){
 const storage=new Map([['stall_cloud_catalog_config_v1',{apiBase:'http://localhost:8787',storeSlug:'stall-demo'}],
  ['stall_server_session_v1','old-development-session'],['stall_cart_v1',[{productId:'preserved-only',quantity:2}]]])
 const requests=[],loginCalls=[],navigations=[],toasts=[];let definition,appId=profile.appId
 const wx={getStorageSync:k=>storage.has(k)?clone(storage.get(k)):'',setStorageSync:(k,v)=>storage.set(k,clone(v)),removeStorageSync:k=>storage.delete(k),
  getSystemInfoSync:()=>({platform:'devtools'}),getAccountInfoSync:()=>({miniProgram:{appId}}),
  login:o=>loginCalls.push(o),request:o=>requests.push(o),navigateTo:o=>navigations.push(o.url),showToast:o=>toasts.push(o.title),showShareMenu(){},hideShareMenu(){}}
 const cache=new Map(),mocks=new Map(),context=vm.createContext({wx,Page:d=>{definition=d},clearTimeout(){},setTimeout(){throw Error('Unexpected timer')},fetch(){assert.fail('Network forbidden')}})
 const generated=stripTypeScriptTypes(cloudSource(profile),{mode:'strip'}).replace(/^export /gm,'')
 mocks.set(path.join(root,'miniprogram/config/cloud.ts'),vm.runInContext(generated+'\n;({CLOUD_ONLY,PUBLIC_API_BASE,DEFAULT_STORE_SLUG,PREVIEW_APP_ID})',context))
 function load(file){file=path.resolve(root,file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file);assert(file.startsWith(path.join(root,'miniprogram')+path.sep));const exports={};cache.set(file,exports);const require=s=>{assert(s.startsWith('.'));return load(path.resolve(path.dirname(file),s+'.ts'))};vm.runInContext(`(function(require,exports){${code(file)}\n})`,context,{filename:file,timeout:1000})(require,exports);return exports}
 const runtime=load('miniprogram/modules/shared/runtime/phonePreview.ts'),auth=load('miniprogram/modules/shared/runtime/auth.ts'),cfg=load('miniprogram/modules/shared/runtime/context.ts')
 return {storage,requests,loginCalls,navigations,toasts,runtime,auth,cfg,load,mocks,setAppId:x=>{appId=x},
  page(file){load(file);return {...definition,data:clone(definition.data),setData(p){Object.assign(this.data,p)}}}}
}

test('phone profile accepts only public staging origin/store/AppID and emits cloud-only source',()=>{
 assert.deepEqual(validatePhoneProfile(profile),profile)
 const generated=cloudSource(profile);assert.match(generated,/CLOUD_ONLY:boolean=true/);assert.match(generated,/PREVIEW_APP_ID/)
 assert.doesNotMatch(generated,/APPSECRET|Bearer|postgresql:/)
})
for(const [name,change]of [
 ['missing endpoint',{apiBase:''}],['HTTP',{apiBase:'http://api.staging.unit.test'}],['loopback',{apiBase:'https://127.0.0.1'}],
 ['private hostname',{apiBase:'https://staging.internal'}],['production hostname',{apiBase:'https://api.unit.test'}],
 ['credentials',{apiBase:'https://user:password@api.staging.unit.test'}],['path',{apiBase:profile.apiBase+'/v1'}],
 ['query',{apiBase:profile.apiBase+'?token=x'}],['port',{apiBase:profile.apiBase+':8787'}],['fragment',{apiBase:profile.apiBase+'#x'}],
 ['tourist app',{appId:'touristappid'}],['missing store',{storeSlug:''}],['secret field',{appSecret:'SYNTHETIC_REJECTED'}],['role field',{role:'owner'}]
])test('phone profile rejects '+name,()=>assert.throws(()=>validatePhoneProfile({...profile,...change})))

test('preview bootstrap drops old sessions, preserves carts and is repeatable',()=>{
 const f=fixture(),cart=clone(f.storage.get('stall_cart_v1'));f.runtime.initializePhonePreview()
 assert.equal(f.storage.has('stall_server_session_v1'),false);assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())
 assert.deepEqual(f.storage.get('stall_cart_v1'),cart)
 f.storage.set('stall_server_session_v1','trusted-current-session');f.runtime.initializePhonePreview()
 assert.equal(f.storage.get('stall_server_session_v1'),'trusted-current-session')
})
function profileContext(){return {apiBase:profile.apiBase,storeSlug:profile.storeSlug}}
test('returning from another development origin clears its token even with an old matching preview marker',()=>{
 const f=fixture();f.runtime.initializePhonePreview()
 f.storage.set('stall_cloud_catalog_config_v1',{apiBase:'http://localhost:8787',storeSlug:'stall-demo'})
 f.storage.set('stall_server_session_v1','synthetic-other-origin-token')
 f.runtime.initializePhonePreview()
 assert.equal(f.storage.has('stall_server_session_v1'),false)
 assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())
})
test('cloud-only context never falls back to demo after missing or forged saved config',()=>{
 const f=fixture();f.storage.delete('stall_cloud_catalog_config_v1');assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())
 f.storage.set('stall_cloud_catalog_config_v1',{apiBase:'https://attacker.unit.test',storeSlug:'other'});assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())
 for(const storeSlug of [12,true,null,{},'invalid/slug']){f.storage.set('stall_cloud_catalog_config_v1',{apiBase:profile.apiBase,storeSlug});assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())}
})
test('preview rejects development tokens even in simulator',()=>{
 const f=fixture();assert.equal(f.auth.localDevAllowed('http://localhost:8787'),false)
 assert.throws(()=>f.auth.setLocalDevToken('http://localhost:8787','a'.repeat(64)),/invalid_development_token/)
 assert.equal(f.loginCalls.length,0);assert.equal(f.requests.length,0)
})
test('preview login refuses a different AppID or API before wx.login/network',async()=>{
 const f=fixture();f.setAppId('wx1111111111111111')
 await assert.rejects(f.auth.loginWithWechat(profile.apiBase),/preview_appid_mismatch/)
 await assert.rejects(f.auth.loginWithWechat('https://attacker.unit.test'),/untrusted_preview_endpoint/)
 assert.equal(f.loginCalls.length,0);assert.equal(f.requests.length,0)
})
test('actual login uses wx.login code, trusts only backend session and grants no local role',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();const pending=f.auth.loginWithWechat(profile.apiBase)
 assert.equal(f.loginCalls.length,1);f.loginCalls[0].success({code:'synthetic-wx-code'})
 assert.equal(f.requests[0].url,profile.apiBase+'/v1/auth/wechat');assert.deepEqual(clone(f.requests[0].data),{code:'synthetic-wx-code'})
 f.requests[0].success({statusCode:200,data:{token:'a'.repeat(43),cacheScope:'b'.repeat(64)}});await pending
 assert.equal(f.storage.get('stall_server_session_v1'),'a'.repeat(43));assert.equal(f.storage.has('role'),false);assert.deepEqual(f.navigations,[])
})
test('login failure cannot synthesize a session or merchant identity',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();const pending=assert.rejects(f.auth.loginWithWechat(profile.apiBase),/server_login_failed/)
 f.loginCalls[0].success({code:'synthetic-wx-code'});f.requests[0].success({statusCode:503,data:{error:'auth_not_configured'}});await pending
 assert.equal(f.storage.has('stall_server_session_v1'),false)
})
test('identity/store change while wx login is pending rejects old response',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();const pending=assert.rejects(f.auth.loginWithWechat(profile.apiBase),/session_or_store_changed/)
 f.loginCalls[0].success({code:'synthetic-wx-code'});f.storage.set('stall_cloud_catalog_config_v1',{apiBase:profile.apiBase,storeSlug:'other-store'})
 f.requests[0].success({statusCode:200,data:{token:'a'.repeat(43)}});await pending
 assert.equal(f.storage.has('stall_server_session_v1'),false)
})
test('authorized APIs never send the preview token to another origin',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();f.storage.set('stall_server_session_v1','a'.repeat(43))
 await assert.rejects(f.auth.authorizedGet('https://attacker.unit.test','/v1/auth/me'),/untrusted_preview_endpoint/)
 const mutation=f.load('miniprogram/modules/merchant/api/mutation.ts')
 await assert.rejects(mutation.authorizedMutation('https://attacker.unit.test','/v1/merchant/stores/real-store/products','POST'),/untrusted_preview_endpoint/)
 assert.equal(f.requests.length,0)
})
test('store entry failure stays cloud-only; QR cannot override trusted API',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();const entry=f.load('miniprogram/utils/storeEntry.ts')
 entry.captureStoreEntry({store:'real-store',apiBase:'https://attacker.unit.test'})
 const pending=assert.rejects(entry.resolveStoreEntry(),/店铺不可用/)
 assert(f.requests[0].url.startsWith(profile.apiBase+'/'));f.requests[0].success({statusCode:503,data:{}});await pending
 assert.deepEqual(clone(f.cfg.getCloudContext()),profileContext())
})
for(const connected of [false,true])test(`homepage never reads demo data in preview (entry connected=${connected})`,async()=>{
 const f=fixture();f.runtime.initializePhonePreview();let remoteLoads=0,demoReads=0
 const forbiddenDemo=()=>{demoReads++;assert.fail('Preview must not load local demo business data')}
 f.mocks.set(path.join(root,'miniprogram/modules/integration/singleAppHost.ts'),{CAN_OPEN_MERCHANT:true})
 f.mocks.set(path.join(root,'miniprogram/utils/storePresentation.ts'),{currentPresentation:()=>({placeholderStyle:'premium',customPlaceholderUrl:''}),refreshPagePresentation(){}})
 f.mocks.set(path.join(root,'miniprogram/utils/cloudCart.ts'),{cloudCartConfig:f.cfg.getCloudContext})
 f.mocks.set(path.join(root,'miniprogram/modules/customer/demo/settings.ts'),{businessState:forbiddenDemo})
 f.mocks.set(path.join(root,'miniprogram/modules/customer/demo/catalog.ts'),{loadStore:forbiddenDemo})
 f.mocks.set(path.join(root,'miniprogram/utils/cart.ts'),{getCartDetails:forbiddenDemo})
 f.mocks.set(path.join(root,'miniprogram/utils/remoteApi.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/shared/api/business.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/utils/cloudCheckout.ts'),{})
 const p=f.page('miniprogram/pages/index/index.ts');p.loadCloudHome=()=>{remoteLoads++}
 const pending=p.onShow();f.requests[0].success({statusCode:connected?200:503,data:connected?{storeSlug:profile.storeSlug,storeName:'Server store name'}:{}});await pending
 assert.equal(demoReads,0);assert.equal(remoteLoads,connected?1:0);assert.equal(p.data.products.length,0)
 if(!connected){assert.equal(p.data.cloudMode,true);assert.match(p.data.entryError,/无法连接商店/)}
})
for(const granted of [false,true])test(`workbench actual controller requires server permission (granted=${granted})`,async()=>{
 const f=fixture();f.runtime.initializePhonePreview();f.storage.set('stall_server_session_v1','a'.repeat(43))
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/demo/settings.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/api/business.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/api/orders.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/demo/orders.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/api/support.ts'),{supportIdentity:f.cfg.cloudIdentity})
 const p=f.page('miniprogram/pages/admin/admin.ts');let loads=0
 p.refreshNewOrderNotice=()=>{loads++};p.refreshMinimum=()=>{loads++};p.refreshSupport=()=>{loads++}
 const pending=p.onShow();assert.equal(p.data.workspaceAuthorized,false)
 f.requests[0].success({statusCode:granted?200:403,data:granted?{items:[]}:{error:'forbidden'}});await pending
 assert.equal(p.data.workspaceAuthorized,granted);assert.equal(loads,granted?3:0)
 if(!granted)assert.match(p.data.accessError,/未取得/)
})
test('preview merchant login needs no manual endpoint or slug input',()=>{
 const f=fixture();f.runtime.initializePhonePreview();f.mocks.set(path.join(root,'miniprogram/modules/shared/runtime/sessionLifecycle.ts'),{clearSessionCaches(){}})
 const p=f.page('miniprogram/pages/merchant-login/merchant-login.ts');p.onShow()
 assert.equal(p.data.apiBase,profile.apiBase);assert.equal(p.data.storeSlug,profile.storeSlug);assert.equal(p.data.showLocalDev,false)
 p.data.apiBase='https://attacker.unit.test';assert.equal(p.config(),true);assert.equal(p.data.apiBase,profile.apiBase)
})
test('profile exposes merchant workspace only after actual permission endpoint succeeds',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();f.storage.set('stall_server_session_v1','a'.repeat(43))
 f.mocks.set(path.join(root,'miniprogram/modules/customer/api/support.ts'),{supportIdentity:f.cfg.cloudIdentity})
 const p=f.page('miniprogram/pages/profile/profile.ts');const pending=p.checkMerchant()
 f.requests[0].success({statusCode:403,data:{error:'forbidden'}});await pending
 assert.equal(p.data.merchantAuthorized,false);await p.openMerchant();assert.deepEqual(f.navigations,[])
 const next=p.checkMerchant();f.requests[1].success({statusCode:200,data:{items:[]}});await next
 const open=p.openMerchant();f.requests[2].success({statusCode:200,data:{items:[]}});await open
 assert.deepEqual(f.navigations,['/pages/admin/admin']);await tick()
})
test('profile repeated login taps share one real wx login flow without granting a merchant role',async()=>{
 const f=fixture();f.runtime.initializePhonePreview()
 f.mocks.set(path.join(root,'miniprogram/modules/customer/api/support.ts'),{supportIdentity:f.cfg.cloudIdentity})
 const p=f.page('miniprogram/pages/profile/profile.ts'),first=p.loginWechat(),second=p.loginWechat()
 assert.equal(f.loginCalls.length,1)
 f.loginCalls[0].success({code:'synthetic-wx-code'});f.requests[0].success({statusCode:200,data:{token:'a'.repeat(43),cacheScope:'b'.repeat(64)}})
 await tick();assert.equal(f.requests.length,2)
 f.requests[1].success({statusCode:403,data:{error:'forbidden'}});await Promise.all([first,second])
 assert.equal(p.data.loginBusy,false);assert.equal(p.data.merchantAuthorized,false);assert.deepEqual(f.navigations,[])
})

test('unconfigured template refuses preparation before creating preview output',()=>{
 const output=path.join(root,'dist/phone-preview'),before=existsSync(output)
 const result=spawnSync(process.execPath,[path.join(root,'scripts/phone-preview.mjs'),'--prepare',path.join(root,'apps/phone-preview.example.json')],{encoding:'utf8'})
 assert.equal(result.status,1);assert.match(result.stderr,/staging HTTPS origin/)
 assert.equal(existsSync(output),before)
})
test('malformed public profile never echoes its content in parse errors',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'stall-profile-unit-'))
 try{const file=path.join(dir,'profile.json');writeFileSync(file,'SYNTHETIC_MUST_NOT_ECHO {')
  assert.throws(()=>readPhoneProfile(file),error=>error.message.includes('Cannot read public preview profile')&&!error.message.includes('SYNTHETIC_MUST_NOT_ECHO'))
 }finally{const file=path.join(dir,'profile.json');if(existsSync(file))unlinkSync(file);rmdirSync(dir)}
})
test('late merchant permission after page hide cannot reveal the workspace',async()=>{
 const f=fixture();f.runtime.initializePhonePreview();f.storage.set('stall_server_session_v1','a'.repeat(43))
 for(const module of ['demo/settings','api/business','api/orders','demo/orders'])f.mocks.set(path.join(root,'miniprogram/modules/merchant/'+module+'.ts'),{})
 f.mocks.set(path.join(root,'miniprogram/modules/merchant/api/support.ts'),{supportIdentity:f.cfg.cloudIdentity})
 const p=f.page('miniprogram/pages/admin/admin.ts');const pending=p.onShow();p.onHide()
 f.requests[0].success({statusCode:200,data:{items:[]}});await pending
 assert.equal(p.data.workspaceAuthorized,false)
})
