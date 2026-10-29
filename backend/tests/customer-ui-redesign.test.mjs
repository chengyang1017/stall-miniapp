import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
const root=path.resolve(import.meta.dirname,'../..'),clone=x=>JSON.parse(JSON.stringify(x))
function javascript(file){let code=stripTypeScriptTypes(fs.readFileSync(file,'utf8'),{mode:'strip'});code=code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>`const {${names.replace(/\s+as\s+/g,': ')}}=require(${JSON.stringify(spec)});`).replace(/^export \* from ['"]([^'"]+)['"];?/gm,(_,spec)=>`Object.assign(exports,require(${JSON.stringify(spec)}));`).replace(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>names.split(',').map(n=>{const [original,alias=original]=n.trim().split(/\s+as\s+/);return `exports.${alias}=require(${JSON.stringify(spec)}).${original};`}).join('\n'));const names=[];code=code.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let)\s+(\w+))/gm,(_,n)=>{names.push(n);return ''});return code+'\n'+names.map(n=>`exports.${n}=${n};`).join('\n')}
function fixture(){
 const storage=new Map([['stall_server_session_v1','synthetic-token']]),requests=[],navigation=[]
 let cfg={apiBase:'https://unit.invalid',storeSlug:'store-a'},scope='customer-a',definition
 const wx={getStorageSync:k=>storage.get(k)||'',setStorageSync:(k,v)=>storage.set(k,clone(v)),removeStorageSync:k=>storage.delete(k),getSystemInfoSync:()=>({platform:'devtools'}),setTabBarBadge(){},removeTabBarBadge(){},showToast(){},request:r=>requests.push(r),navigateTo:r=>navigation.push(r.url)}
 const mocks=new Map(),cache=new Map();const mock=(p,v)=>mocks.set(path.resolve(root,p),v)
 mock('miniprogram/modules/shared/runtime/context.ts',{getCloudContext:()=>cfg,getSessionToken:()=>storage.get('stall_server_session_v1'),cloudIdentity:()=>JSON.stringify([cfg,scope])})
 mock('miniprogram/modules/shared/runtime/sessionScope.ts',{sessionScope:()=>scope})
 mock('miniprogram/modules/shared/runtime/uiTrace.ts',{traceRequest:(_,fn)=>fn(),traceUi(){},prepareUiTrace(){},hideUiTrace(){}})
 mock('miniprogram/utils/remoteApi.ts',{})
 mock('miniprogram/modules/customer/demo/catalog.ts',{})
 mock('miniprogram/modules/customer/demo/settings.ts',{})
 mock('miniprogram/utils/storeEntry.ts',{})
 mock('miniprogram/utils/storePresentation.ts',{})
 mock('miniprogram/utils/cart.ts',{})
 const context=vm.createContext({wx,Page:d=>definition=d,console})
 function load(p){p=path.resolve(root,p);if(mocks.has(p))return mocks.get(p);if(cache.has(p))return cache.get(p);const exports={};cache.set(p,exports);const js=javascript(p);vm.runInContext('(function(require,exports){'+js+'\n})',context,{filename:p})(s=>load(path.resolve(path.dirname(p),s+'.ts')),exports);return exports}
 function page(p){load(p);return {...definition,data:clone(definition.data),setData(patch){Object.assign(this.data,patch)}}}
 return {load,page,mock,storage,requests,navigation,identity:v=>scope=v,store:v=>cfg={...cfg,storeSlug:v}}
}
test('cart selection uses exact cents and is isolated by account and store',()=>{
 const f=fixture(),api=f.load('miniprogram/modules/customer/domain/cartSelection.ts'),rows=[{productId:'a',quantity:3,subtotal:.3},{productId:'b',quantity:1,subtotal:15}]
 api.setExcludedCartIds(['b']);assert.deepEqual(clone(api.selectedCartDetails({items:rows})),{items:[rows[0]],totalCount:3,totalText:'0.30'})
 f.identity('customer-b');assert.equal(api.selectedCartRows(rows).length,2);f.identity('customer-a');f.store('store-b');assert.equal(api.selectedCartRows(rows).length,2);f.store('store-a');assert.equal(api.selectedCartRows(rows).length,1)
})
test('cloud order submits selected rows and retains unselected purchases after success',async()=>{
 const f=fixture(),selection=f.load('miniprogram/modules/customer/domain/cartSelection.ts'),cart=f.load('miniprogram/utils/cloudCart.ts'),checkout=f.load('miniprogram/utils/cloudCheckout.ts')
 cart.writeCloudCart('store-a',[{productId:'a',quantity:2},{productId:'b',quantity:3}]);selection.setExcludedCartIds(['b'])
 const pending=checkout.createCloudOrder({address:{receiverName:'synthetic',phone:'synthetic',areaId:'area',detail:'synthetic'},slot:{id:'slot',date:'2026-10-29'},note:'test'})
 assert.deepEqual(clone(f.requests[0].data.items),[{productId:'a',quantity:2}]);f.requests[0].success({statusCode:200,data:{orderId:'synthetic-order'}});await pending
 assert.deepEqual(clone(cart.readCloudCart('store-a')),[{productId:'b',quantity:3}])
})
test('failed order retains selected and unselected purchases',async()=>{
 const f=fixture(),selection=f.load('miniprogram/modules/customer/domain/cartSelection.ts'),cart=f.load('miniprogram/utils/cloudCart.ts'),checkout=f.load('miniprogram/utils/cloudCheckout.ts')
 cart.writeCloudCart('store-a',[{productId:'a',quantity:2},{productId:'b',quantity:3}]);selection.setExcludedCartIds(['b'])
 const pending=checkout.createCloudOrder({address:{},slot:{},note:''});f.requests[0].fail(Error('synthetic timeout'));await assert.rejects(pending);assert.equal(cart.readCloudCart('store-a').length,2)
})
test('category shares dynamic catalog and applies availability, promotion and price filters',()=>{
 const f=fixture(),api=f.load('miniprogram/modules/customer/controllers/catalog.ts'),p=api.createCatalogPage(true);p.setData=patch=>Object.assign(p.data,patch)
 const rows=[{id:'a',current:'10.00',available:true,discounted:false},{id:'b',current:'2.00',available:true,discounted:true},{id:'c',current:'1.00',available:false,discounted:true}]
 p.data.sortMode='asc';assert.deepEqual(clone(p.arrangeProducts(rows)).map(x=>x.id),['c','b','a']);p.data.onlyAvailable=true;p.data.onlyDeals=true;assert.deepEqual(clone(p.arrangeProducts(rows)).map(x=>x.id),['b']);assert.equal(rows[0].id,'a')
})
test('profile status entry is a regular order page and preserves fulfillment filters',()=>{
 const f=fixture(),p=f.page('miniprogram/pages/profile/profile.ts');p.openOrders({currentTarget:{dataset:{tab:'active',fulfillment:'delivering'}}});assert.equal(f.navigation[0],'/pages/orders/orders?tab=active&fulfillment=delivering')
 const orders=f.page('miniprogram/pages/orders/orders.ts');orders.onLoad({tab:'active',fulfillment:'delivering'});assert.equal(orders.data.activeTab,'active');assert.equal(orders.entryMatches({fulfillmentStatus:'delivering'}),true);assert.equal(orders.entryMatches({fulfillmentStatus:'preparing'}),false)
 orders.onLoad({tab:'active',fulfillment:'pending'});assert.equal(orders.entryMatches({paymentStatus:'paid',fulfillmentStatus:'accepted'}),true);assert.equal(orders.entryMatches({paymentStatus:'paid',fulfillmentStatus:'delivering'}),false)
})
test('all manifests use home/category/cart/profile tabs and retain the order page',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json'),'utf8'));assert.deepEqual(app.tabBar.list.map(x=>x.text),['首页','分类','购物车','我的']);assert.ok(app.pages.includes('pages/orders/orders'));for(const x of app.tabBar.list){assert.ok(fs.existsSync(path.join(root,'miniprogram',x.iconPath)));assert.ok(fs.existsSync(path.join(root,'miniprogram',x.selectedIconPath)))}
})

test('selected footer keeps the last selected quote during quantity checks and clears revoked data',()=>{
 const f=fixture(),selection=f.load('miniprogram/modules/customer/domain/cartSelection.ts'),p=f.page('miniprogram/pages/cart/cart.ts')
 p.data.items=[{productId:'a',quantity:2,price:10},{productId:'b',quantity:1,price:5}];p.data.minimumOrderText='15.00';selection.setExcludedCartIds(['b']);p.refreshSelection()
 assert.equal(p.data.selectedCount,2);assert.equal(p.data.selectedConfirmedTotalText,'20.00');assert.equal(p.data.selectedMinimumReached,true)
 p.data.items[0].quantity=3;p.data.quantityPending=true;p.data.amountState='checking';p.refreshSelection();assert.equal(p.data.selectedConfirmedTotalText,'20.00')
 p.data.items=[];p.data.amountState='stale';p.data.quantityPending=false;p.refreshSelection();assert.equal(p.data.selectedConfirmedTotalText,'');assert.equal(p.data.selectedCount,0)
})
