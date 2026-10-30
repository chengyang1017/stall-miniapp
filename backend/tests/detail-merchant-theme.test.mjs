import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
const root=path.resolve(import.meta.dirname,'../..'),read=p=>fs.readFileSync(path.resolve(root,p),'utf8'),clone=x=>JSON.parse(JSON.stringify(x))
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
const sample={id:'11111111-1111-4111-8111-111111111111',name:'Dynamic product',priceCents:2200,effectivePriceCents:1650,soldOut:false,active:true,categoryId:'category-a',imageUrl:'https://images.invalid/dynamic.png',description:'Merchant supplied description',stockMode:'finite',stockQuantity:5}
function javascript(file){let code=stripTypeScriptTypes(read(file),{mode:'strip'});code=code.replace(/^import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>`const {${names.replace(/\s+as\s+/g,': ')}}=require(${JSON.stringify(spec)});`).replace(/^export \* from ['"]([^'"]+)['"];?/gm,(_,spec)=>`Object.assign(exports,require(${JSON.stringify(spec)}));`).replace(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(_,names,spec)=>names.split(',').map(n=>{const [original,alias=original]=n.trim().split(/\s+as\s+/);return `exports.${alias}=require(${JSON.stringify(spec)}).${original};`}).join('\n'));const names=[];code=code.replace(/^export\s+(?=(?:async\s+)?(?:function|const|let)\s+(\w+))/gm,(_,n)=>{names.push(n);return ''});return code+'\n'+names.map(n=>`exports.${n}=${n};`).join('\n')}
function fixture({cloud=true}={}){
 let cfg=cloud?{apiBase:'https://unit.invalid',storeSlug:'store-a'}:null,identity='customer-a',definition,componentDefinition,excluded=[sample.id]
 const details=[],recommendations=[],mutations=[],navigation=[],toasts=[],previews=[],patches=[],direct=[],reviews=[],summaries=[],localAdds=[]
 let cartRows=[]
 const wx={setNavigationBarTitle(){},getMenuButtonBoundingClientRect:()=>({top:36}),showToast:o=>toasts.push(o.title),navigateTo:o=>navigation.push(o.url),switchTab:o=>navigation.push(o.url),navigateBack:()=>navigation.push('back'),previewImage:o=>previews.push(o)}
 const mocks=new Map(),cache=new Map(),mock=(p,v)=>mocks.set(path.resolve(root,p),v)
 const context=vm.createContext({wx,Page:d=>definition=d,Component:d=>componentDefinition=d,getCurrentPages:()=>[{}]})
 function load(file){file=path.resolve(root,file);if(mocks.has(file))return mocks.get(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);vm.runInContext('(function(require,exports){'+javascript(file)+'\n})',context,{filename:file})(s=>load(path.resolve(path.dirname(file),s+'.ts')),exports);return exports}
 mock('miniprogram/modules/shared/runtime/context.ts',{cloudIdentity:()=>JSON.stringify([cfg,identity])})
 mock('miniprogram/utils/cloudCart.ts',{cloudCartConfig:()=>cfg,readCloudCart:()=>cartRows,changeCloudCart:(slug,id,quantity)=>{const gate=deferred();mutations.push({...gate,slug,id,quantity});return gate.promise.then(ok=>{if(ok)cartRows=[{productId:id,quantity}];return ok})}})
 mock('miniprogram/utils/remoteApi.ts',{getRemoteProducts:(api,slug,ids)=>{const gate=deferred();details.push({...gate,api,slug,ids});return gate.promise},getRemoteProductPage:(api,slug,query)=>{const gate=deferred();recommendations.push({...gate,api,slug,query});return gate.promise}})
 const stock=load('miniprogram/modules/shared/domain/catalog.ts')
 const localProduct={...sample,price:22,discountPrice:16.5}
 mock('miniprogram/modules/customer/demo/catalog.ts',{...stock,loadStore:()=>({products:[localProduct],categories:[]}),productIsPublished:p=>p.active,effectivePrice:p=>p.discountPrice??p.price,money:x=>x.toFixed(2)})
 mock('miniprogram/utils/cart.ts',{loadCart:()=>cartRows,addToCart:(id,quantity)=>{localAdds.push({id,quantity});return true}})
 mock('miniprogram/utils/directPurchase.ts',{setDirectPurchase:(id,quantity)=>direct.push({id,quantity})})
 mock('miniprogram/modules/customer/domain/cartSelection.ts',{excludedCartIds:()=>excluded,setExcludedCartIds:ids=>excluded=ids})
 mock('miniprogram/utils/storePresentation.ts',{currentPresentation:()=>({placeholderStyle:'premium',customPlaceholderUrl:''}),refreshPagePresentation(){},invalidatePagePresentation(){}})
 mock('miniprogram/modules/customer/api/reviews.ts',{publicReviews:()=>{const gate=deferred();reviews.push(gate);return gate.promise},publicReviewSummary:()=>{const gate=deferred();summaries.push(gate);return gate.promise},reviewCustomerRequest(){assert.fail('No review writes authorized by these tests')},reviewLogin(){}})
 load('miniprogram/pages/product-detail/product-detail.ts')
 const p={...definition,data:clone(definition.data),setData(patch){patches.push(clone(patch));Object.assign(this.data,clone(patch))}}
 p.onLoad({id:sample.id})
 async function confirm(product=sample){const pending=p.refresh();details.at(-1).resolve(product?[product]:[]);await pending;return p}
 function reviewComponent(){load('miniprogram/modules/customer/components/product-reviews/product-reviews.ts');return {...componentDefinition.methods,data:{...clone(componentDefinition.data),productId:sample.id,enabled:true,compact:true},serial:0,visible:true,cursor:'',identity:'',queryKey:'',setData(patch){Object.assign(this.data,clone(patch))}}}
 return {p,details,recommendations,mutations,navigation,toasts,previews,patches,direct,localAdds,reviews,summaries,confirm,reviewComponent,excluded:()=>excluded,identity:v=>identity=v,store:v=>cfg={...cfg,storeSlug:v}}
}
test('detail uses merchant description, valid prices, real discount and image preview',async()=>{
 const f=fixture();await f.confirm();assert.equal(f.p.data.current,'16.50');assert.equal(f.p.data.discountPercent,25);assert.equal(f.p.data.description,sample.description);assert.equal(f.p.data.navigationTop,36);f.p.previewImages();assert.deepEqual(clone(f.previews[0].urls),[sample.imageUrl]);assert.equal(f.p.data.quantity,1)
})
test('rapid detail quantity edits update only quantity and subtotal, without catalog requests',async()=>{
 const f=fixture();await f.confirm();const before=f.patches.length;for(let i=0;i<15;i++)f.p.increase();assert.equal(f.p.data.quantity,5);assert.equal(f.p.data.totalText,'82.50');for(let i=0;i<15;i++)f.p.decrease();assert.equal(f.p.data.quantity,1);assert.equal(f.details.length,1);assert.ok(f.patches.slice(before).every(p=>Object.keys(p).every(k=>['quantity','totalText'].includes(k))))
})
for(const [label,patch]of [['zero stock',{stockQuantity:0}],['manual sold-out',{soldOut:true}],['unpublished',{active:false}]])test('detail disables purchase for '+label,async()=>{
 const f=fixture();await f.confirm({...sample,...patch});assert.equal(f.p.data.available,false);f.p.increase();await f.p.addCart();await f.p.buyNow();assert.equal(f.mutations.length,0);assert.deepEqual(f.navigation,[])
})
test('detail omits fake discount and tolerates absent image/description',async()=>{
 const f=fixture();await f.confirm({...sample,effectivePriceCents:2200,imageUrl:'',description:''});assert.equal(f.p.data.discounted,false);assert.deepEqual(f.p.data.imageUrls,[]);f.p.previewImages();assert.equal(f.previews.length,0);assert.equal(f.p.data.description,'')
})
test('double add taps use one purchase intent and server rejection cannot navigate',async()=>{
 const f=fixture();await f.confirm();const pending=f.p.addCart();f.p.addCart();f.p.buyNow();assert.equal(f.mutations.length,1);assert.equal(f.p.data.purchaseBusy,true);f.mutations[0].resolve(false);await pending;assert.equal(f.p.data.purchaseBusy,false);assert.equal(f.toasts.length,0);assert.equal(f.navigation.length,0)
})
test('cloud buy reuses checkout only after validated add, includes the product in selection',async()=>{
 const f=fixture();await f.confirm();const pending=f.p.buyNow();assert.equal(f.navigation.length,0);f.mutations[0].resolve(true);await pending;assert.equal(f.navigation[0],'/pages/checkout/checkout');assert.deepEqual(f.excluded(),[]);assert.equal(f.p.data.cartCount,1)
})
test('local immediate purchase retains the existing direct purchase flow',async()=>{
 const f=fixture({cloud:false});await f.p.refresh();await f.p.buyNow();assert.deepEqual(clone(f.direct),[{id:sample.id,quantity:1}]);assert.equal(f.localAdds.length,0);assert.equal(f.navigation[0],'/pages/checkout/checkout')
})
for(const change of ['identity','store','hide'])test('detail discards delayed purchase navigation after '+change,async()=>{
 const f=fixture();await f.confirm();const pending=f.p.buyNow();if(change==='identity')f.identity('customer-b');else if(change==='store')f.store('store-b');else f.p.onHide();f.mutations[0].resolve(true);await pending;assert.equal(f.navigation.length,0)
})
test('recommendations exclude self, sold-out, invalid-price and unavailable rows in current store',async()=>{
 const f=fixture();await f.confirm();assert.equal(f.recommendations[0].slug,'store-a');assert.equal(f.recommendations[0].query.category,'category-a');f.recommendations[0].resolve({products:[sample,{...sample,id:'valid'},{...sample,id:'empty',stockQuantity:0},{...sample,id:'invalid',effectivePriceCents:NaN},{...sample,id:'sold',soldOut:true}]});await Promise.resolve();await Promise.resolve();assert.deepEqual(f.p.data.recommendations.map(p=>p.id),['valid'])
})
test('late product response cannot publish an old account or store product',async()=>{
 const f=fixture(),pending=f.p.refresh();f.identity('customer-b');f.details[0].resolve([sample]);await pending;assert.equal(f.p.data.name,'');assert.equal(f.p.data.available,false)
})
test('same-context refresh retains the image on timeout but prevents purchasing stale prices',async()=>{
 const f=fixture();await f.confirm();const pending=f.p.refresh();assert.equal(f.p.data.imageUrl,sample.imageUrl);assert.equal(f.p.data.available,false);f.details[1].reject(Error('timeout'));await pending;assert.equal(f.p.data.imageUrl,sample.imageUrl);assert.equal(f.p.data.available,false);assert.ok(f.p.data.cloudError)
})
test('compact reviews display two real rows and expand within a single review module',async()=>{
 const f=fixture(),c=f.reviewComponent(),pending=c.load(true),rows=Array.from({length:3},(_,i)=>({id:String(i),rating:5,createdAt:'2026-10-28T01:00:00Z',content:'supplied '+i,imageIds:[]}));f.reviews[0].resolve({items:rows,hasMore:false});f.summaries[0].resolve({count:3,average:5,distribution:[]});await pending;assert.equal(c.data.previewRows.length,2);assert.equal(c.data.rows.length,3);c.expand();assert.equal(c.data.expanded,true);assert.equal((read('miniprogram/pages/product-detail/product-detail.wxml').match(/<product-reviews /g)||[]).length,1)
})
test('review refresh retains confirmed rows during slow reads and failed requests',async()=>{
 const f=fixture(),c=f.reviewComponent();let pending=c.load(true);f.reviews[0].resolve({items:[{id:'a',rating:4,imageIds:[],createdAt:'2026-10-28T01:00:00Z'}],hasMore:false});f.summaries[0].resolve({count:1,average:4});await pending;pending=c.load(true);assert.equal(c.data.rows.length,1);f.reviews[1].reject(Error('timeout'));f.summaries[1].resolve({count:1,average:4});await pending;assert.equal(c.data.rows.length,1);assert.ok(c.data.error)
})
test('all actual merchant pages import appearance-only theme and purple native navigation',()=>{
 const manifest=JSON.parse(read('apps/build-targets.json')),theme=read('miniprogram/styles/merchant-theme.wxss');assert.equal(manifest.targets.merchant.pages.length,19)
 for(const p of manifest.targets.merchant.pages){assert.match(read('miniprogram/'+p+'.wxss'),/merchant-theme\.wxss/);assert.equal(JSON.parse(read('miniprogram/'+p+'.json')).navigationBarBackgroundColor,'#5935cf')}
 assert.doesNotMatch(theme,/(?:^|[;{])\s*(?:display|position|top|bottom|left|right|height|width|margin|padding|gap|flex|grid|font-size)\s*:/m)
})
test('compact cart footer has no duplicate safe-area padding and only a fixed external error slot',()=>{
 const css=read('miniprogram/pages/cart/cart.wxss'),footer=css.match(/\.footer\.cart-footer-compact \{([^}]+)\}/)[1];assert.match(footer,/height:104rpx/);assert.doesNotMatch(footer,/safe-area-inset-bottom/);assert.match(css,/\.cart-footer-error \{[^}]*position:absolute;[^}]*bottom:100%;[^}]*height:32rpx/)
})
