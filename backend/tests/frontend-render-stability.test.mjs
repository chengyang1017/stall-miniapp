// Actual controllers, diff helper, trace hook and component lifetimes with a queued
// setData/view model. This is NOT the WeChat renderer or a phone acceptance test.
import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import path from 'node:path'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {stripTypeScriptTypes} from 'node:module'
const ROOT=fileURLToPath(new URL('../../',import.meta.url)),read=file=>readFileSync(path.join(ROOT,file),'utf8'),clone=v=>JSON.parse(JSON.stringify(v))
const A='bb492b5b-991e-4206-8b8c-8fac59ad07a5',B='11111111-1111-4111-8111-111111111111'
const products=[{id:A,name:'Cloud A',priceCents:1500,effectivePriceCents:1500,active:true,soldOut:false,stockMode:'unlimited',imageUrl:'https://images.invalid/a.png'},{id:B,name:'Cloud B',priceCents:500,effectivePriceCents:500,active:true,soldOut:false,stockMode:'unlimited',imageUrl:'https://images.invalid/b.png'}]
const business={open:true,notice:'',label:'Open',storeName:'Cloud',minimumOrderCents:0,placeholderStyle:'premium',customPlaceholderUrl:''}
const rules={accepting:true,areas:[],slots:[],days:[],business}
const tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()}
function js(file){let code=stripTypeScriptTypes(read(file),{mode:'strip'});code=code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>`const {${names.replace(/\s+as\s+/g,': ')}}=require(${JSON.stringify(spec)});`).replace(/^export \* from ['"]([^'"]+)['"];?/gm,(_,spec)=>`Object.assign(exports,require(${JSON.stringify(spec)}));`).replace(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>names.split(',').map(n=>{const [original,alias=original]=n.trim().split(/\s+as\s+/);return `exports.${alias}=require(${JSON.stringify(spec)}).${original};`}).join('\n'));const names=[];code=code.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let)\s+(\w+))/gm,(_,n)=>{names.push(n);return ''});return code+'\n'+names.map(n=>`exports.${n}=${n};`).join('\n')}
function apply(data,patch){for(const [key,value]of Object.entries(patch)){const parts=key.match(/[^.[\]]+/g);let parent=data;parts.slice(0,-1).forEach((part,i)=>{if(parent[part]===undefined)parent[part]=/^\d+$/.test(parts[i+1])?[]:{};parent=parent[part]});parent[parts.at(-1)]=clone(value)}}
function fixture(kind='cart',{enabled=true,platform='devtools',cloudOnly=true,loaded=true,footer=false}={}){
 const storage=new Map([['stall_ui_trace_v1',enabled],['stall_cloud_catalog_config_v1',{apiBase:'https://api.staging.invalid',storeSlug:'store-a'}],['stall_server_session_v1','SYNTHETIC_PRIVATE_TOKEN'],['stall_server_cache_scope_v1','a'.repeat(64)],['stall_phone_preview_binding_v1','https://api.staging.invalid|wx0123456789abcdef']])
 const requests=[],patches=[],flushes=[],frames=[],logs=[],queries=[],navigation=[],nodes=new Map(),footerNodes=new Map(),footerFrames=[];let definition,probeDefinition,nodeSerial=0,p
 const app={globalData:{}}
 const wx={getSystemInfoSync:()=>({platform}),getStorageSync:key=>clone(storage.get(key)??''),setStorageSync:(key,value)=>storage.set(key,clone(value)),removeStorageSync:key=>storage.delete(key),getAccountInfoSync:()=>({miniProgram:{appId:'wx0123456789abcdef'}}),setTabBarBadge(){},removeTabBarBadge(){},showShareMenu(){},hideShareMenu(){},showToast(){},navigateTo:o=>navigation.push(o.url),switchTab:o=>navigation.push(o.url),request:o=>requests.push(o),createSelectorQuery:()=>({in(){return this},selectAll(){return this},fields(){return this},exec(callback){queries.push(true);callback([Array.from(nodes.values()).map(n=>({dataset:{traceKey:n.key,traceList:n.field},top:100+n.order*100,height:n.visible?100:0,width:n.visible?300:0})).concat(Array.from(footerNodes.keys()).map(key=>({dataset:{traceKey:'cart-'+key,traceList:key},top:600,height:100,width:300})))])}})}
 const cache=new Map(),mocks=new Map(),context=vm.createContext({wx,getApp:()=>app,Page:d=>definition=d,Component:d=>probeDefinition=d,console:{info:(...args)=>logs.push(args)},fetch(){assert.fail('Network forbidden')}})
 const mock=(file,value)=>mocks.set(path.join(ROOT,file),value)
 mock('miniprogram/config/cloud.ts',{CLOUD_ONLY:cloudOnly,PUBLIC_API_BASE:'https://api.staging.invalid',DEFAULT_STORE_SLUG:'store-a',PREVIEW_APP_ID:'wx0123456789abcdef'})
 function load(file){file=path.resolve(ROOT,file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInContext(`(function(require,exports){${js(path.relative(ROOT,file))}})`,context,{filename:file})(spec=>load(path.resolve(path.dirname(file),spec+'.ts')),exports);return exports}
 const stock=load('miniprogram/modules/shared/domain/catalog.ts')
 mock('miniprogram/modules/customer/demo/catalog.ts',{...stock,loadStore(){assert.fail('Demo forbidden')}})
 mock('miniprogram/modules/customer/demo/settings.ts',{})
 mock('miniprogram/utils/cart.ts',{})
 mock('miniprogram/utils/addresses.ts',{getSelectedAddress:()=>undefined})
 mock('miniprogram/utils/directPurchase.ts',{})
 const trace=load('miniprogram/modules/shared/runtime/uiTrace.ts'),cart=load('miniprogram/utils/cloudCart.ts'),scope=load('miniprogram/modules/shared/runtime/context.ts')
 load('miniprogram/modules/shared/components/render-probe/render-probe.ts')
 cart.writeCloudCart('store-a',[{productId:A,quantity:2},{productId:B,quantity:1}])
 load(`miniprogram/pages/${kind}/${kind}.ts`)
 const viewData=clone(definition.data)
 const markup=read(`miniprogram/pages/${kind}/${kind}.wxml`)
 const wrapper=kind==='index'?/<view[^>]*class="home-catalog"[^>]*>/.exec(markup)?.[0]:null
 const hiddenExpression=wrapper&&/hidden="\{\{(.*?)\}\}"/.exec(wrapper)?.[1]
 const ifExpression=wrapper&&/wx:if="\{\{(.*?)\}\}"/.exec(wrapper)?.[1]
 function render(){
  if(footer){
   // Lifecycle model only: CSS dimensions are checked separately, never inferred as native pixels.
   for(const key of ['footer','checkout']){
    if(!footerNodes.has(key))footerNodes.set(key,{instance:++nodeSerial,attached:false,probe:{data:{pageName:'cart',listName:key,rowKey:'cart-'+key}}})
    const node=footerNodes.get(key)
    if(key==='footer'&&viewData.uiTraceEnabled&&!node.attached){probeDefinition.lifetimes.attached.call(node.probe);node.attached=true}
   }
   footerFrames.push({amount:viewData.confirmedTotalText||viewData.totalText,count:viewData.totalCount,pending:viewData.quantityPending,instances:Array.from(footerNodes.values()).map(n=>n.instance)})
  }
  const allowed=!ifExpression||vm.runInNewContext(ifExpression,viewData),hidden=!!hiddenExpression&&vm.runInNewContext(hiddenExpression,viewData)
  const fields=kind==='cart'?['items']:['products','discountedProducts'],wanted=new Set();let order=0
  if(allowed)for(const field of fields)for(const row of viewData[field]){
   const key=row.productId||row.id,mapKey=field+':'+key;wanted.add(mapKey)
   let node=nodes.get(mapKey)
   if(!node){node={key,field,instance:++nodeSerial,localInput:'preserved',probe:null};nodes.set(mapKey,node)}
   node.visible=!hidden;node.order=order++
   if(viewData.uiTraceEnabled&&!node.probe){node.probe={data:{pageName:kind==='index'?'home':'cart',listName:field,rowKey:key}};probeDefinition.lifetimes.attached.call(node.probe)}
  }
  for(const [key,node]of nodes)if(!wanted.has(key)){if(node.probe)probeDefinition.lifetimes.detached.call(node.probe);nodes.delete(key)}
  frames.push({items:viewData.items?.length,products:viewData.products?.length,visible:Array.from(nodes.values()).filter(n=>n.visible).length,instances:Array.from(nodes.values()).map(n=>n.instance)})
 }
 p={...definition,data:clone(definition.data),setData(patch,callback){patches.push(clone(patch));apply(this.data,patch);flushes.push(()=>{apply(viewData,patch);render();callback?.()})}}
 function flush(){let count=0;while(flushes.length){assert.ok(++count<1000);flushes.shift()()}}
 const items=products.map((r,i)=>({productId:r.id,name:r.name,imageUrl:r.imageUrl,quantity:i?1:2,price:r.priceCents/100,subtotal:r.priceCents*(i?1:2)/100,priceText:(r.priceCents/100).toFixed(2),subtotalText:(r.priceCents*(i?1:2)/100).toFixed(2),stockLimit:null,stockInsufficient:false,inventoryText:'不限库存'}))
 if(loaded&&kind==='cart'){p.cloudContext=JSON.stringify(['https://api.staging.invalid','store-a',scope.cloudIdentity()]);Object.assign(p.data,{items,cloudMode:true,totalText:'35.00',totalCount:3,amountState:'confirmed',placeholderStyle:'premium'})}
 else if(loaded){p.cloudContext=p.homeConfirmed=scope.cloudIdentity();Object.assign(p.data,{cloudMode:true,entryBlocking:false,remoteRows:clone(products),dealRows:[],placeholderStyle:'premium',products:products.map(r=>({id:r.id,name:r.name,imageUrl:r.imageUrl,categoryId:null,original:(r.priceCents/100).toFixed(2),current:(r.priceCents/100).toFixed(2),discounted:false,available:true,inventoryText:'不限库存'})),categories:[],discountedProducts:[]})}
 Object.assign(viewData,clone(p.data));render()
 const answer=(req,body,statusCode=200)=>req.success({statusCode,data:body})
 function finishProduct(req,rows=products){answer(req,{products:rows,categories:[],hasMore:false,nextCursor:null})}
 async function settle(){for(let i=0;i<6;i++){for(const req of requests.filter(r=>!r.done)){req.done=true;if(req.url.includes('/products?'))finishProduct(req);else if(req.url.includes('/business-settings'))answer(req,business);else if(req.url.includes('/delivery-rules'))answer(req,{configured:true,rules});else if(req.url.includes('/store-entry/'))answer(req,{storeSlug:'store-a',storeName:'Cloud'});else assert.fail('Unexpected transport '+req.url)}await tick();flush()}}
 return {p,cart,scope,trace,storage,requests,patches,frames,nodes,footerNodes,footerFrames,viewData,app,logs,queries,navigation,load,flush,answer,finishProduct,settle,event:{currentTarget:{dataset:{id:A}}}}
}
test('cart queued view frames never lose keyed product nodes during slow onShow and confirmation',async()=>{
 const f=fixture();f.p.onShow();f.flush();const before=Array.from(f.nodes.values()).map(n=>n.instance);assert.equal(f.viewData.items.length,2);assert.equal(f.nodes.size,2);await f.settle();assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),before)
 const start=f.patches.length,network=f.requests.length,pending=f.p.increase(f.event);f.flush();assert.equal(f.viewData.items[0].quantity,3);assert.equal(f.requests.length,network+1);assert.equal(f.nodes.size,2);await f.settle();await pending
 assert.equal(f.requests.length,network+1,'one fresh quote, not a validation GET followed by a duplicate pricing GET');assert.equal(f.viewData.items[0].quantity,3);assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),before);assert.ok(f.patches.slice(start).every(p=>!Object.hasOwn(p,'items')));assert.ok(f.patches.slice(start).every(p=>!Object.hasOwn(p,'items[1].imageUrl')));assert.ok(f.frames.every(frame=>frame.visible===2));assert.equal(f.trace.readUiTrace().filter(e=>e.type==='probe:detached').length,0)
})
test('same-context cart onHide/onShow cycles preserve native model instances and trace each lifecycle',async()=>{const f=fixture();f.p.onShow();await f.settle();const instances=Array.from(f.nodes.values()).map(n=>n.instance);for(let i=0;i<3;i++){f.p.onHide();f.p.onShow();f.flush();await f.settle()}assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),instances);const events=f.trace.readUiTrace();assert.equal(events.filter(e=>e.type==='onShow').length,4);assert.equal(events.filter(e=>e.type==='onHide').length,3);assert.equal(events.filter(e=>e.type==='probe:detached').length,0)})
test('ten cart taps apply only quantity paths then a single server quote; no intermediate zero-row frame',async()=>{const f=fixture();f.p.onShow();await f.settle();const start=f.requests.length,pending=f.p.increase(f.event);for(let i=0;i<9;i++)f.p.increase(f.event);f.flush();assert.equal(f.viewData.items[0].quantity,12);assert.equal(f.requests.length,start+1);await f.settle();await pending;assert.equal(f.viewData.items[0].quantity,12);assert.equal(f.requests.length,start+1);assert.ok(f.frames.every(frame=>frame.visible===2))})
test('home pending same-store scene hides without unmounting, then resumes existing keyed nodes',async()=>{const f=fixture('index');f.p.onShow();await f.settle();const instances=Array.from(f.nodes.values()).map(n=>n.instance);f.load('miniprogram/utils/storeEntry.ts').captureStoreEntry({scene:'a'.repeat(32)});const pending=f.p.onShow();f.flush();assert.equal(f.viewData.products.length,2);assert.equal(f.nodes.size,2);assert.equal(f.p.data.entryBlocking,true);assert.ok(Array.from(f.nodes.values()).every(n=>!n.visible));await f.settle();await pending;await f.settle();assert.equal(f.p.data.entryBlocking,false);assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),instances);assert.equal(f.trace.readUiTrace().filter(e=>e.type==='probe:detached').length,0)})
test('home same-session refresh and failed requests keep products mounted with no full-array patch',async()=>{const f=fixture('index');f.p.onShow();await f.settle();const before=f.patches.length,instances=Array.from(f.nodes.values()).map(n=>n.instance);f.p.onHide();f.p.onShow();await tick();f.flush();for(const req of f.requests.filter(r=>!r.done)){req.done=true;req.fail(Error('synthetic timeout'))}await tick();f.flush();assert.equal(f.nodes.size,2);assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),instances);assert.equal(f.p.data.entryBlocking,false);assert.ok(f.patches.slice(before).every(p=>!Object.hasOwn(p,'products')));assert.ok(f.frames.every(frame=>frame.visible===2));assert.deepEqual(f.navigation,[])})
test('real login bootstrap with unchanged binding preserves token/context and does not call login on show',async()=>{const f=fixture('index');const initial=f.scope.cloudIdentity();const preview=f.load('miniprogram/modules/shared/runtime/phonePreview.ts');for(let i=0;i<3;i++){preview.initializePhonePreview();f.p.onShow();await f.settle();f.p.onHide()}assert.equal(f.scope.cloudIdentity(),initial);assert.equal(f.requests.filter(r=>r.url.includes('/auth/wechat')).length,0);assert.equal(f.nodes.size,2)})
for(const field of ['token','store','api'])test(`real ${field} replacement clears old nodes and records a scoped reset`,()=>{const f=fixture('cart',{cloudOnly:field!=='api'});f.p.onShow();f.flush();if(field==='token')f.storage.set('stall_server_session_v1','SYNTHETIC_OTHER_TOKEN');else f.storage.set('stall_cloud_catalog_config_v1',{apiBase:field==='api'?'https://other.invalid':'https://api.staging.invalid',storeSlug:field==='store'?'store-b':'store-a'});f.p.onShow();f.flush();assert.equal(f.nodes.size,0);assert.ok(f.trace.readUiTrace().some(e=>e.type==='cart.context.reset'));assert.ok(f.trace.readUiTrace().some(e=>e.type==='probe:detached'))})
for(const status of [401,403])test(`latest HTTP ${status} removes cart nodes, while preserving scoped stored quantities`,async()=>{const f=fixture();f.p.onShow();await f.settle();const rows=clone(f.cart.readCloudCart('store-a'));f.p.refreshCloud();const req=f.requests.filter(r=>!r.done&&r.url.includes('/products?')).at(-1);req.done=true;f.answer(req,{error:'unauthorized'},status);await tick();f.flush();assert.equal(f.nodes.size,0);assert.deepEqual(clone(f.cart.readCloudCart('store-a')),rows)})
test('trace captures patch/flush, requests and component identities without leaking identity, URLs or products',async()=>{const f=fixture();f.p.onShow();await f.settle();const records=f.app.globalData.uiTrace.read(),json=JSON.stringify(records);for(const type of ['setData:before','setData:flushed','request:start','request:end','render:rects','probe:attached'])assert.ok(records.some(e=>e.type===type),type);for(const value of ['SYNTHETIC_PRIVATE_TOKEN','https://api.staging.invalid',A,'Cloud A'])assert.equal(json.includes(value),false);assert.ok(records.some(e=>e.type==='setData:before'&&e.origin.length));assert.equal(records.filter(e=>e.type==='probe:attached').length,2)})
for(const options of [{enabled:false,platform:'devtools'},{enabled:true,platform:'ios'},{enabled:true,platform:'android'}])test(`tracing is off by default/outside devtools: ${JSON.stringify(options)}`,async()=>{const f=fixture('cart',options);f.p.onShow();await f.settle();assert.equal(f.p.data.uiTraceEnabled,false);assert.equal(f.trace.readUiTrace().length,0);assert.equal(f.logs.length,0);assert.equal(f.queries.length,0);assert.equal(f.app.globalData.uiTrace,undefined)})
test('trace ring buffer is bounded and disable immediately stops recording',()=>{const f=fixture();f.p.onShow();f.flush();for(let i=0;i<650;i++)f.p.setData({minimumReached:!!(i%2)});f.flush();assert.ok(f.trace.readUiTrace().length<=600);const n=f.logs.length;f.storage.delete('stall_ui_trace_v1');f.p.setData({minimumReached:false});f.flush();assert.equal(f.logs.length,n);assert.equal(f.trace.readUiTrace().length,0)})
test('presentation timeout retains confirmed placeholder subtree instead of clearing it to none',async()=>{const f=fixture();f.p.onShow();await f.settle();const presentation=f.load('miniprogram/utils/storePresentation.ts');const pending=presentation.refreshPagePresentation(f.p);const req=f.requests.at(-1);req.done=true;req.fail(Error('timeout'));await pending;f.flush();assert.equal(f.p.data.placeholderStyle,'premium');assert.ok(f.p.data.presentationError);assert.equal(f.nodes.size,2)})
test('row diff preserves client selection and changes no image/row root for a quantity-only confirmation',()=>{const f=fixture(),{stableRowsPatch}=f.load('miniprogram/modules/shared/runtime/stableRows.ts');const row={productId:A,quantity:2,imageUrl:'same',selected:true},next={productId:A,quantity:3,imageUrl:'same'};const patch=stableRowsPatch('items',[row],[next],'productId');assert.deepEqual(clone(patch),{'items[0].quantity':3});const state={items:[row]};apply(state,patch);assert.equal(state.items[0].selected,true)})

test('structural removal preserves remaining row selection and detaches only removed product',()=>{const f=fixture();const {stableRowsPatch}=f.load('miniprogram/modules/shared/runtime/stableRows.ts');const before=[{productId:A,quantity:1},{productId:B,quantity:1,selected:true}],patch=stableRowsPatch('items',before,[{productId:B,quantity:1}],'productId');assert.equal(patch.items.length,1);assert.equal(patch.items[0].selected,true)})
test('status markup never gates cart rows and home uses a persistent hidden container instead of wx:if',()=>{const cart=read('miniprogram/pages/cart/cart.wxml'),home=read('miniprogram/pages/index/index.wxml');assert.match(cart,/<view class="cart-sync-status"/);assert.doesNotMatch(cart,/<view wx:if="\{\{cloudMode && cloudLoading\}\}" class="empty"/);assert.match(home,/<view class="home-catalog" hidden=/);assert.doesNotMatch(home,/<view wx:if="\{\{!cloudConnectionError && !entryError\}\}">/);assert.match(read('miniprogram/pages/cart/cart.wxss'),/\.cart-sync-status \{ height:44rpx/);assert.match(read('miniprogram/styles/customer-catalog.wxss'),/\.home-sync-status \{ height:44rpx/)})
test('CLOUD_ONLY rejects a forged saved API without moving its real context or losing current nodes',async()=>{const f=fixture();f.p.onShow();await f.settle();const key=f.scope.cloudIdentity();f.storage.set('stall_cloud_catalog_config_v1',{apiBase:'https://other.invalid',storeSlug:'store-a'});f.p.onShow();f.flush();assert.equal(f.scope.cloudIdentity(),key);assert.equal(f.nodes.size,2)})

test('cold home legitimately mounts once; subsequent successful refresh patches no products or image fields',async()=>{const f=fixture('index',{loaded:false});const show=f.p.onShow();await f.settle();await show;await f.settle();assert.equal(f.nodes.size,2);const instances=Array.from(f.nodes.values()).map(n=>n.instance),start=f.patches.length;f.p.onHide();f.p.onShow();await f.settle();assert.deepEqual(Array.from(f.nodes.values()).map(n=>n.instance),instances);assert.ok(f.patches.slice(start).every(p=>!Object.hasOwn(p,'products')));assert.ok(f.patches.slice(start).every(p=>Object.keys(p).every(key=>!key.endsWith('.imageUrl'))));assert.equal(f.trace.readUiTrace().filter(e=>e.type==='probe:detached').length,0)})
test('scope trace distinguishes session replacement from API/store changes without exposing values',async()=>{const f=fixture();f.p.onShow();await f.settle();const first=f.trace.readUiTrace().find(e=>e.type==='onShow').context;f.storage.set('stall_server_session_v1','OTHER_SYNTHETIC_PRIVATE_TOKEN');f.p.onShow();f.flush();const next=f.trace.readUiTrace().filter(e=>e.type==='onShow').at(-1).context;assert.equal(next.api,first.api);assert.equal(next.store,first.store);assert.notEqual(next.session,first.session);assert.equal(JSON.stringify(f.trace.readUiTrace()).includes('OTHER_SYNTHETIC_PRIVATE_TOKEN'),false)})
test('one quote confirms promotion and inventory together; invalid prices cannot be confirmed or persisted',async()=>{const f=fixture();f.p.onShow();await f.settle();const pending=f.p.increase(f.event),request=f.requests.at(-1);request.done=true;f.finishProduct(request,[{...products[0],effectivePriceCents:1000},products[1]]);await pending;f.flush();assert.equal(f.viewData.items[0].priceText,'10.00');assert.equal(f.viewData.totalText,'35.00');const second=f.p.increase(f.event),invalid=f.requests.at(-1);invalid.done=true;f.finishProduct(invalid,[{...products[0],effectivePriceCents:'invalid'},products[1]]);await second;f.flush();assert.equal(f.cart.readCloudCart('store-a')[0].quantity,3);assert.equal(f.p.data.amountState,'stale');assert.equal(f.p.data.totalText,'--');assert.equal(f.nodes.size,2)})

test('read-only setData reports unavailable hook without blocking ordinary page behavior',async()=>{const f=fixture();Object.defineProperty(f.p,'setData',{value:f.p.setData,writable:false});f.p.onShow();await f.settle();assert.equal(f.p.data.items.length,2);assert.ok(f.trace.readUiTrace().some(e=>e.type==='setData:hook-unavailable'));assert.equal(f.p.__uiTraceInstalled,undefined)})

test('footer retains last confirmed amount through slow quantity quote and cannot approve checkout',async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const ids=Array.from(f.footerNodes.values()).map(n=>n.instance),start=f.patches.length
 const pending=f.p.increase(f.event);f.flush()
 assert.equal(f.viewData.confirmedTotalText,'35.00');assert.equal(f.viewData.totalText,'--');assert.equal(f.viewData.amountState,'checking')
 f.p.checkout();assert.deepEqual(f.navigation,[])
 assert.ok(f.patches.slice(start).every(p=>!Object.hasOwn(p,'confirmedTotalText')&&!Object.hasOwn(p,'items')))
 await f.settle();await pending
 assert.equal(f.viewData.confirmedTotalText,'50.00');assert.equal(f.viewData.amountState,'confirmed')
 assert.deepEqual(Array.from(f.footerNodes.values()).map(n=>n.instance),ids)
 assert.equal(f.trace.readUiTrace().filter(e=>e.list==='footer'&&e.type==='probe:attached').length,1)
 assert.equal(f.trace.readUiTrace().filter(e=>e.list==='footer'&&e.type==='probe:detached').length,0)
})

test('rapid alternating plus/minus keeps footer amount unchanged until one current quote confirms',async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const start=f.patches.length,requests=f.requests.length
 const pending=f.p.increase(f.event);for(let i=0;i<10;i++){f.p.increase(f.event);f.p.decrease(f.event);f.flush();assert.equal(f.viewData.confirmedTotalText,'35.00')}
 assert.equal(f.requests.length,requests+1);assert.ok(f.patches.slice(start).every(p=>!Object.hasOwn(p,'confirmedTotalText')))
 const confirmation=f.patches.length;await f.settle();await pending
 assert.equal(f.p.data.items[0].quantity,3);assert.equal(f.p.data.confirmedTotalText,'50.00')
 const patch=f.patches.slice(confirmation).find(p=>p.amountState==='confirmed');assert.ok(patch)
 assert.equal(Object.hasOwn(patch,'totalCount'),false,'unchanged quantity summary not resent at confirmation')
 assert.equal(Object.hasOwn(patch,'minimumOrderText'),false,'unchanged delivery threshold not resent')
 assert.ok(f.footerFrames.every(frame=>frame.amount!=='--'))
})

test('failed quote retains explicitly stale footer amount and refresh replaces it only on confirmation',async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const pending=f.p.increase(f.event),req=f.requests.at(-1);req.done=true;req.fail(Error('synthetic timeout'));await pending;f.flush()
 assert.equal(f.p.data.confirmedTotalText,'35.00');assert.equal(f.p.data.amountState,'stale');assert.ok(f.p.data.cloudError)
 f.p.checkout();assert.deepEqual(f.navigation,[])
 f.p.refresh();f.flush();assert.equal(f.viewData.confirmedTotalText,'35.00');await f.settle();assert.equal(f.p.data.amountState,'confirmed')
})

for(const status of [401,403])test(`footer clears last amount on explicit ${status} rather than retaining unauthorized data`,async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const pending=f.p.increase(f.event),req=f.requests.at(-1);req.done=true;f.answer(req,{},status);await pending;f.flush()
 assert.equal(f.viewData.confirmedTotalText,'');assert.equal(f.footerFrames.at(-1).amount,'--');assert.equal(f.viewData.items.length,0)
 assert.equal(f.cart.readCloudCart('store-a')[0].quantity,2)
})

test('footer identity switch clears cached amount and an old quote cannot restore it',async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const pending=f.p.increase(f.event),old=f.requests.at(-1)
 f.storage.set('stall_server_session_v1','NEW_SYNTHETIC_PRIVATE_TOKEN');f.cart.writeCloudCart('store-a',[{productId:B,quantity:1}]);f.p.onShow();f.flush();assert.equal(f.viewData.confirmedTotalText,'')
 old.done=true;f.finishProduct(old);await pending;f.flush();assert.equal(f.viewData.confirmedTotalText,'')
})

test('footer probe and selector report footer/button identity during delayed delivery and long errors',async()=>{
 const f=fixture('cart',{footer:true});f.p.onShow();await f.settle();const instances=Array.from(f.footerNodes.values()).map(n=>n.instance)
 f.p.setData({deliveryInfo:'很长的配送说明'.repeat(50),deliveryError:'规则异常'.repeat(50),minimumOrderText:'999999.00',minimumReached:false});f.flush()
 const records=f.trace.readUiTrace();assert.ok(records.some(e=>e.type==='render:rects'&&e.nodes.some(n=>n.list==='footer')))
 assert.ok(records.some(e=>e.type==='render:rects'&&e.nodes.some(n=>n.list==='checkout')))
 assert.deepEqual(Array.from(f.footerNodes.values()).map(n=>n.instance),instances)
 // The selector's mocked rectangles prove telemetry wiring only, not native CSS sizing.
})

test('compact footer remains mounted with fixed geometry and the native tabBar owning its safe area',()=>{
 const markup=read('miniprogram/pages/cart/cart.wxml').split('<view class="footer cart-footer-compact"')[1],css=read('miniprogram/pages/cart/cart.wxss')
 assert.ok(markup);assert.equal((markup.match(/wx:if=/g)||[]).length,1,'only the optional diagnostic probe is conditional')
 for(const cls of ['cart-footer-main','cart-footer-summary','cart-footer-count','cart-footer-error','cart-checkout'])assert.ok(markup.includes(cls))
 assert.match(markup,/confirmedTotalText \|\| totalText/);assert.match(markup,/待更新/);assert.match(markup,/disabled="[^"]*amountState !== 'confirmed'/)
 assert.doesNotMatch(markup,/商品合计 · 以结算及下单校验为准|请在结算时选择配送地址|已达起送金额|cart-footer-status/)
 const footer=css.match(/\.footer\.cart-footer-compact \{([^}]+)\}/)[1]
 assert.match(footer,/height:104rpx/);assert.match(footer,/bottom:0/);assert.doesNotMatch(footer,/safe-area-inset-bottom/)
 assert.match(css,/\.cart-footer-error \{[^}]*position:absolute;[^}]*bottom:100%;[^}]*height:32rpx/)
 assert.match(css,/\.cart-footer-main \{ height:80rpx/)
 assert.match(css,/\.cart-footer-main \.cart-checkout \{[^}]*width:220rpx; height:72rpx/)
 assert.doesNotMatch(css,/264rpx|292rpx|310rpx/)
})
