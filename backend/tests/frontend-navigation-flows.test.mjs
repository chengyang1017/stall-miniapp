// Navigation flow regression tests: source contract + execute actual simple page handlers.
// No network, WeChat runtime, database, or source modifications.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const root=new URL('../../',import.meta.url)
const read=path=>readFileSync(new URL(path,root),'utf8')
const page=path=>read(`miniprogram/pages/${path}.ts`)
const app=JSON.parse(read('miniprogram/app.json'))
const target=JSON.parse(read('apps/build-targets.json'))
const routes={
  product:'/pages/product-detail/product-detail',order:'/pages/order-detail/order-detail',
  checkout:'/pages/checkout/checkout',addresses:'/pages/addresses/addresses',
  orders:'/pages/orders/orders',tracking:'/pages/customer-tracking/customer-tracking',
  proof:'/pages/customer-delivery-proof/customer-delivery-proof',
  reviews:'/pages/customer-reviews/customer-reviews'
}
function assertPage(url,role='customer'){
  const path=url.split('?')[0].replace(/^\//,'')
  assert.ok(app.pages.includes(path),`unregistered page: ${url}`)
  assert.ok(target.targets[role].pages.includes(path),`outside ${role} build: ${url}`)
}
// Evaluates the actual function body, not a copied implementation. Only used
// for simple synchronous handlers; complex async pages are contract-checked.
function runSimpleHandler(source,name,args=[]){
  const marker=new RegExp(name+String.raw`\s*\([^)]*\)\s*\{`)
  const match=marker.exec(source)
  assert.ok(match,`handler absent: ${name}`)
  let pos=match.index+match[0].length, depth=1, end=pos
  for(;end<source.length;end++){
    if(source[end]==='{')depth++
    if(source[end]==='}'){depth--;if(depth===0)break}
  }
  assert.equal(depth,0,'unclosed handler')
  const body=source.slice(pos,end)
  const calls=[]
  const wx={navigateTo:arg=>calls.push(['navigateTo',arg.url]),switchTab:arg=>calls.push(['switchTab',arg.url])}
  vm.runInNewContext(`(function(e){${body}}).call({},input)`,{wx,input:args[0]}, {timeout:200})
  return calls
}

test('customer product and order destinations are registered',()=>{
  for(const route of Object.values(routes))assertPage(route)
})
test('product-card tap encodes reserved characters in product IDs',()=>{
  const result=runSimpleHandler(page('index/index'),'openProduct',[{currentTarget:{dataset:{id:'SKU / ?&中文'}}}])
  assert.equal(result.length,1)
  assert.deepEqual([...result[0]],['navigateTo',routes.product+'?id='+encodeURIComponent('SKU / ?&中文')])
})
test('empty product ID never opens an arbitrary detail',()=>{
  assert.equal(runSimpleHandler(page('index/index'),'openProduct',[{currentTarget:{dataset:{id:''}}}]).length,0)
})
test('order-card tap encodes reserved characters in order IDs',()=>{
  const result=runSimpleHandler(page('orders/orders'),'openOrder',[{currentTarget:{dataset:{id:'order/123?x=1&y=2'}}}])
  assert.deepEqual(result,[['navigateTo',routes.order+'?id='+encodeURIComponent('order/123?x=1&y=2')]])
})
test('empty order ID is rejected before navigation',()=>{
  assert.deepEqual(runSimpleHandler(page('orders/orders'),'openOrder',[{currentTarget:{dataset:{id:null}}}]),[])
})
test('product detail decodes ID on load and checkout is the direct-purchase destination',()=>{
  const source=page('product-detail/product-detail')
  assert.match(source,/decodeURIComponent\(options\.id\s*\|\|\s*''\)/)
  assert.match(source,/wx\.navigateTo\(\{\s*url:\s*['"]\/pages\/checkout\/checkout['"]\s*\}\)/)
  assertPage(routes.checkout)
})
test('cart checkout navigation remains gated by cart/amount validation',()=>{
  const source=page('cart/cart')
  const start=source.indexOf('if (cloudCartConfig())')
  const end=source.indexOf('wx.navigateTo',start)
  assert.ok(start>=0&&end>start,'cloud checkout branch missing')
  const guard=source.slice(start,end)
  assert.match(guard,/minimumReached/)
  assert.match(guard,/cloudError/)
  assert.match(guard,/totalCount\s*===\s*0/)
  assert.match(source,/url:\s*['"]\/pages\/checkout\/checkout['"]/)
})
test('checkout address selector opens registered customer address page',()=>{
  assert.deepEqual(runSimpleHandler(page('checkout/checkout'),'openAddresses'),[['navigateTo',routes.addresses]])
})
test('successful local checkout uses the orders Tab and transfers its creation notice without URL parameters',()=>{
  const source=page('checkout/checkout')
  assert.match(source,/openCreatedDemoOrder\(order\.id\)/)
  assert.doesNotMatch(source,/wx\.redirectTo\(\{\s*url:\s*`\/pages\/orders\/orders/)
  const navigation=read('miniprogram/modules/customer/demo/orders.ts')
  assert.match(navigation,/wx\.switchTab\(\{url:'\/pages\/orders\/orders'/)
  assert.match(navigation,/createdNotice=\{id,context\}/)
  assert.match(navigation,/notice\.context===cloudIdentity\(\)/)
  assert.match(page('orders/orders'),/const createdId=takeCreatedDemoOrder\(\)/)
  assert.match(page('orders/orders'),/createdId:\s*options\.created\s*\|\|\s*''/)
  assertPage(routes.orders)
})
test('order details preserve the supplied order ID for subsequent data retrieval',()=>{
  assert.match(page('order-detail/order-detail'),/order:\s*\{\s*id:\s*options\.id\s*\|\|\s*''\s*\}/)
  assertPage(routes.order)
})
test('role-specific customer tracking, proof and review destinations stay out of merchant build',()=>{
  for(const path of [routes.tracking,routes.proof,routes.reviews]){
    assertPage(path)
    assert.ok(!target.targets.merchant.pages.includes(path.slice(1)),path)
  }
})
