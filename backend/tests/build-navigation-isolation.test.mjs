// Actual controllers and target-selected navigation adapters; only transport/data
// dependencies are synthetic. The final three cases execute pure compiler builds.
// No API, database, Docker, deployment or real WeChat calls.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import vm from 'node:vm'
import {ROOT,config,graph} from '../../scripts/miniapp-graph.mjs'
import {checkOutput} from '../../scripts/miniapp-output.mjs'

const read=file=>readFileSync(path.join(ROOT,file),'utf8')
const host='miniprogram/modules/integration/singleAppHost.ts'
const home='miniprogram/pages/index/index.ts',profile='miniprogram/pages/profile/profile.ts',admin='miniprogram/pages/admin/admin.ts'
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
function fixture(target){
 let cfg={apiBase:'https://api.staging.unit.test',storeSlug:'authorized-store'},identity='identity-A',definition
 let authorize=async()=>({items:[]})
 const storage=new Map(),navigation=[],requests=[],loads=[]
 const wx={getStorageSync:k=>storage.get(k)||'',setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),
  navigateTo:o=>navigation.push(['navigateTo',o.url]),switchTab:o=>navigation.push(['switchTab',o.url]),
  showToast(){},showShareMenu(){},hideShareMenu(){}}
 const context=vm.createContext({wx,Page:d=>{definition=d},clearTimeout(){},setTimeout(){assert.fail('Unexpected polling')},fetch(){assert.fail('Network forbidden')}})
 const modules={
  '../../config/cloud':{PUBLIC_API_BASE:cfg.apiBase,CLOUD_ONLY:true},
  '../../utils/storeEntry':{resolveStoreEntry:async()=>{},captureStoreEntry(){},shopShare(){}},
  '../../utils/storePresentation':{refreshPagePresentation(){}},
  '../../utils/cloudCart':{cloudCartConfig:()=>cfg},
  '../../modules/shared/runtime/context':{getCloudContext:()=>cfg,cloudIdentity:()=>identity},
  '../../modules/shared/runtime/auth':{hasRecentMerchantPermission:()=>false,authorizedGet:(base,url)=>{requests.push({base,url});return authorize()},loginWithWechat:async()=>{}},
  '../../modules/customer/api/support':{supportIdentity:()=>identity},
  '../../modules/merchant/api/support':{supportIdentity:()=>identity}
 }
 function evaluate(file,require){
  let code=stripTypeScriptTypes(read(file),{mode:'strip',sourceUrl:file})
  code=code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>`const {${names.replace(/\s+as\s+/g,': ')}}=require(${JSON.stringify(spec)});`)
  const exports=[]
  code=code.replace(/^export\s+(?=(?:const|function)\s+(\w+))/gm,(_,name)=>{exports.push(name);return ''})
  assert.doesNotMatch(code,/^\s*(?:import|export)\b/m)
  return vm.runInContext(`(function(require){${code}\n;return {${exports.join(',')}}})`,context,{filename:file,timeout:1000})(require)
 }
 const selected=config.targets[target].aliases[host]||host
 const adapter=evaluate(selected,()=>assert.fail('Adapter must not import another role'))
 function page(file){
  evaluate(file,spec=>spec==='../../modules/integration/singleAppHost'?adapter:modules[spec]||{})
  const p={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(v){Object.assign(this.data,v)}}
  p.loadCloudHome=()=>loads.push('catalog')
  p.refresh=()=>assert.fail('No local fallback')
  p.refreshNewOrderNotice=()=>loads.push('orders');p.refreshMinimum=()=>loads.push('business');p.refreshSupport=()=>loads.push('support')
  return p
 }
 return {adapter,page,storage,navigation,requests,loads,cfg,setIdentity:v=>{identity=v},setConfig:v=>{cfg=v},setAuthorize:fn=>{authorize=fn}}
}

test('Combined adapter keeps the original merchant page and customer home tab',()=>{
 const f=fixture('combined');f.adapter.openMerchantWorkspace();f.adapter.openCustomerShop()
 assert.equal(f.adapter.CAN_OPEN_MERCHANT,true);assert.equal(f.adapter.CAN_OPEN_CUSTOMER,true)
 assert.deepEqual(f.navigation,[['navigateTo','/pages/admin/admin'],['switchTab','/pages/index/index']])
})
test('Customer adapter cannot navigate to a merchant page',()=>{
 const f=fixture('customer');assert.equal(f.adapter.CAN_OPEN_MERCHANT,false);f.adapter.openMerchantWorkspace();assert.deepEqual(f.navigation,[])
})
test('Merchant workbench hides and refuses the unavailable customer switch without writing a preference',()=>{
 const f=fixture('merchant'),p=f.page(admin);assert.equal(p.data.canOpenCustomer,false)
 p.openCustomerShop();f.adapter.openCustomerShop()
 assert.deepEqual(f.navigation,[]);assert.equal(f.storage.size,0)
 assert.match(read('miniprogram/pages/admin/admin.wxml'),/wx:if="\{\{canOpenCustomer\}\}"[^>]*bindtap="openCustomerShop"/)
})
test('Combined workbench still switches to the customer tab and records the explicit mode choice',()=>{
 const f=fixture('combined'),p=f.page(admin);assert.equal(p.data.canOpenCustomer,true);p.openCustomerShop()
 assert.deepEqual(f.navigation,[['switchTab','/pages/index/index']])
 assert.equal(f.storage.get('stall_merchant_home_preference_v1'),'customer|'+f.cfg.apiBase+'|'+f.cfg.storeSlug)
})
test('Customer homepage ignores a retained Combined merchant preference and loads its catalog',async()=>{
 const f=fixture('customer');f.storage.set('stall_merchant_home_preference_v1',f.cfg.apiBase+'|'+f.cfg.storeSlug)
 const p=f.page(home);await p.onShow();p.goAdmin()
 assert.equal(p.data.canOpenMerchant,false);assert.deepEqual(f.requests,[]);assert.deepEqual(f.navigation,[]);assert.deepEqual(f.loads,['catalog'])
})
test('Customer profile neither queries merchant permissions nor opens merchant pages even with forged UI authorization',async()=>{
 const f=fixture('customer'),p=f.page(profile);await p.checkMerchant();assert.equal(p.data.merchantAuthorized,false)
 p.data.merchantAuthorized=true;await p.openMerchant()
 assert.deepEqual(f.requests,[]);assert.deepEqual(f.navigation,[]);assert.equal(f.storage.size,0)
})
// Updated product contract: a saved merchant preference is never an implicit navigation action.
for(const preference of ['merchant','customer','empty','other-store','old-identity','malformed','expired'])test(`Combined homepage stays customer with ${preference} history`,async()=>{
 const f=fixture('combined');f.storage.set('stall_merchant_home_preference_v1',preference==='merchant'?f.cfg.apiBase+'|'+f.cfg.storeSlug:preference)
 const p=f.page(home);await p.onShow()
 assert.equal(f.requests.length,0);assert.deepEqual(f.navigation,[]);assert.deepEqual(f.loads,['catalog'])
})
test('Combined profile checks permission and rechecks on explicit entry before recording preference',async()=>{
 const f=fixture('combined'),p=f.page(profile);await p.checkMerchant()
 assert.equal(p.data.merchantAuthorized,true);assert.deepEqual(f.navigation,[])
 const gate=deferred();f.setAuthorize(()=>gate.promise);const pending=p.openMerchant()
 assert.equal(f.requests.length,2);assert.equal(f.storage.size,0);assert.deepEqual(f.navigation,[])
 gate.resolve({items:[]});await pending
 assert.deepEqual(f.navigation,[['navigateTo','/pages/admin/admin']])
 assert.equal(f.storage.get('stall_merchant_home_preference_v1'),f.cfg.apiBase+'|'+f.cfg.storeSlug)
})
for(const target of ['combined','merchant'])for(const granted of [false,true])test(`${target} workbench keeps server authorization (granted=${granted})`,async()=>{
 const f=fixture(target);f.setAuthorize(async()=>{if(!granted)throw Error('http_403');return {items:[]}})
 const p=f.page(admin);await p.onShow()
 assert.equal(p.data.workspaceAuthorized,granted);assert.equal(f.requests.length,1)
 assert.equal(f.requests[0].url,'/v1/merchant/stores/authorized-store/categories')
 assert.deepEqual(f.loads,granted?['orders','business','support']:[])
 if(!granted)assert.match(p.data.accessError,/未取得/)
})
for(const target of ['combined','customer','merchant'])test(`${target} compiles with complete target-owned artifacts and navigation`,{timeout:120000},()=>{
 const env={...process.env};delete env.STALL_PHONE_PREVIEW_PROFILE
 const result=spawnSync(process.execPath,['scripts/build-miniapp.mjs',target],{cwd:ROOT,env,encoding:'utf8',timeout:110000})
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr)
 checkOutput(target)
 const manifest=JSON.parse(read(`dist/${target}/build-manifest.json`))
 assert.deepEqual(manifest.pages,config.targets[target].pages)
 assert.equal(manifest.pages[0],target==='merchant'?'pages/admin/admin':'pages/index/index')
 if(target!=='combined'){
  assert(!manifest.sources.some(s=>s.startsWith('miniprogram/modules/integration/')))
  const forbidden=target==='customer'?'merchant':'customer'
  assert(!manifest.sources.some(s=>s.startsWith('miniprogram/modules/'+forbidden+'/')))
  for(const page of manifest.pages)assert.equal(config.pages[page],target)
  assert(!manifest.artifacts.some(s=>s.startsWith('modules/'+forbidden+'/')))
 }
 const {files}=graph(target)
 for(const file of files.keys())for(const m of readFileSync(file,'utf8').matchAll(/\/pages\/[a-z0-9-]+\/[a-z0-9-]+/g))assert(manifest.pages.includes(m[0].slice(1)),`${target}: ${file}: ${m[0]}`)
})

test('Combined homepage never auto-resumes merchant, including initial display and ten redisplays',async()=>{
 const f=fixture('combined');f.storage.set('stall_merchant_home_preference_v1',f.cfg.apiBase+'|'+f.cfg.storeSlug)
 const p=f.page(home);await p.onShow();assert.equal(f.navigation.length,0)
 for(let i=0;i<10;i++){p.onHide();await p.onShow()}
 assert.equal(f.navigation.length,0);assert.equal(f.requests.length,0)
})
