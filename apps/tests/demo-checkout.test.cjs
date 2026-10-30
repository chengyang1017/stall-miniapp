const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const clone = value => value === undefined ? undefined : structuredClone(value)
const STORE = 'stall_demo_v1', CART = 'stall_cart_v1', CONFIG = 'stall_cloud_catalog_config_v1'
class DemoDate extends Date {
  constructor(...args) { if(args.length)super(...args);else super('2026-10-27T04:00:00.000Z') }
  static now() { return Date.parse('2026-10-27T04:00:00.000Z') }
}
// Actual compiled checkout, order persistence, cart and orders page. All wx APIs
// are local memory mocks. Route validation follows the checked-in wx typings.
function fixture(target, {direct = false, routeFails = false} = {}) {
  const root = path.resolve(__dirname, '../../dist', target, 'miniprogram')
  const tabs = JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8')).tabBar.list.map(t=>'/'+t.pagePath)
  const storage = new Map([
    [STORE,{categories:[{id:'c1',name:'演示分类'}],products:[
      {id:'p1',name:'演示商品',categoryId:'c1',price:10,discountPrice:null,discountStart:'',discountEnd:'',available:true,stockMode:'finite',stockQuantity:10}
    ]}],
    [CART,[{productId:'p1',quantity:1}]],
    ['stall_store_hours_v1',{accepting:true,notice:'',days:Array.from({length:7},()=>({enabled:true,start:'00:00',end:'23:59'}))}],
    ['stall_delivery_v1',{areas:[{id:'area1',name:'演示区域',enabled:true}],slots:[{id:'slot1',label:'演示时段',start:'11:00',end:'13:00',enabled:true}]}],
    ['stall_addresses_v1',[{id:'addr1',receiverName:'合成顾客',phone:'13800000000',area:'演示区域',detail:'仅测试用合成地址',isDefault:true}]]
  ])
  if(direct)storage.set('stall_direct_purchase_v1',{productId:'p1',quantity:2})
  const modals=[],routes=[],toasts=[],cache=new Map(),definitions=new Map()
  let registered
  const wx={
    getStorageSync:key=>clone(storage.get(key)),setStorageSync:(key,value)=>storage.set(key,clone(value)),removeStorageSync:key=>storage.delete(key),
    getSystemInfoSync:()=>({platform:'devtools'}),setTabBarBadge:()=>{},removeTabBarBadge:()=>{},
    showToast:args=>toasts.push(args.title),showModal:args=>modals.push(args),
    request:()=>assert.fail('real API calls are forbidden in DEMO tests'),
    switchTab:args=>{assert.ok(tabs.includes(args.url),'switchTab needs an exact tab path without query');routes.push(['switchTab',args.url]);if(routeFails)args.fail?.({errMsg:'synthetic route failure'});else args.success?.({})},
    redirectTo:args=>{routes.push(['redirectTo',args.url]);assert.ok(!tabs.includes(args.url.split('?')[0]),'redirectTo cannot open a tabBar page')}
  }
  function load(file) {
    if(cache.has(file))return cache.get(file).exports
    const module={exports:{}};cache.set(file,module)
    const wrapper=vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(file,'utf8')+'\n})',{
      wx,Page:value=>{registered=value},Date:DemoDate,setTimeout,clearTimeout
    },{filename:file})
    wrapper(spec=>load(path.resolve(path.dirname(file),spec+'.js')),module,module.exports)
    return module.exports
  }
  function page(name) {
    if(definitions.has(name))return definitions.get(name)
    load(path.join(root,'pages',name,name+'.js'))
    const p=registered;p.data=clone(p.data);p.setData=values=>Object.assign(p.data,clone(values))
    definitions.set(name,p);p.onLoad?.({});return p
  }
  const p=page('checkout');p.onShow();p.chooseSlot({detail:{value:0}})
  const orders=()=>storage.get(STORE).inventoryOrders||[]
  return {p,page,storage,modals,routes,toasts,orders,wx,
    orderModule:()=>load(path.join(root,'modules/customer/demo/orders.js')),
    change:(key,fn)=>{const value=clone(storage.get(key));fn(value);storage.set(key,value)}}
}
for(const target of ['combined','customer']) {
  test(`${target} DEMO checkout saves one unpaid order and opens the orders Tab`,()=>{
    const f=fixture(target);f.p.confirmOrder();f.modals[0].success({confirm:true})
    assert.equal(f.orders().length,1);assert.equal(f.orders()[0].paymentStatus,'unpaid')
    assert.equal(f.orders()[0].inventoryState,'held');assert.equal(f.storage.get(STORE).products[0].stockQuantity,9)
    assert.deepEqual(f.storage.get(CART),[]);assert.deepEqual(f.routes,[['switchTab','/pages/orders/orders']])
    const orders=f.page('orders');orders.onShow()
    assert.equal(orders.data.createdId,f.orders()[0].id);assert.equal(orders.data.visibleOrders.length,1)
    assert.equal(orders.data.visibleOrders[0].paymentText,'待支付')
  })
  test(`${target} DEMO checkout allows only one pending confirmation`,()=>{
    const f=fixture(target);f.p.confirmOrder();f.p.confirmOrder();assert.equal(f.modals.length,1)
    f.modals[0].success({confirm:false});assert.equal(f.orders().length,0)
    f.p.confirmOrder();assert.equal(f.modals.length,2)
  })
  test(`${target} cancelled or failed confirmation preserves cart and allows retry`,()=>{
    for(const outcome of ['cancel','fail']) {
      const f=fixture(target);f.p.confirmOrder()
      if(outcome==='cancel')f.modals[0].success({confirm:false});else f.modals[0].fail?.({errMsg:'synthetic modal failure'})
      assert.equal(f.orders().length,0);assert.equal(f.storage.get(CART)[0].quantity,1)
      assert.equal(f.p.data.demoConfirmBusy,false)
    }
  })
  for(const event of ['onHide','onUnload'])test(`${target} confirmation after ${event} cannot create an order`,()=>{
    const f=fixture(target);f.p.confirmOrder();f.p[event]();f.modals[0].success({confirm:true})
    assert.equal(f.orders().length,0);assert.equal(f.routes.length,0)
    assert.equal(f.storage.get(CART)[0].quantity,1)
  })
  test(`${target} switching to CLOUD while DEMO confirmation is pending does not create local data`,()=>{
    const f=fixture(target);f.p.confirmOrder()
    f.storage.set(CONFIG,{apiBase:'https://staging.invalid',storeSlug:'sample'})
    f.modals[0].success({confirm:true});assert.equal(f.orders().length,0);assert.equal(f.routes.length,0)
  })
  for(const paused of ['business','delivery'])test(`${target} ${paused} pause during confirmation is revalidated`,()=>{
    const f=fixture(target);f.p.confirmOrder()
    if(paused==='business')f.change('stall_store_hours_v1',value=>{value.accepting=false})
    else f.change('stall_delivery_v1',value=>{value.deliveryPaused=true})
    f.modals[0].success({confirm:true});assert.equal(f.orders().length,0);assert.equal(f.routes.length,0)
  })
  test(`${target} changed price is shown again instead of silently accepting a new total`,()=>{
    const f=fixture(target);f.p.confirmOrder();f.change(STORE,value=>{value.products[0].price=15})
    f.modals[0].success({confirm:true});assert.equal(f.orders().length,0)
    assert.equal(f.p.data.totalText,'15.00');assert.ok(f.toasts.some(text=>text.includes('重新确认')))
  })
  test(`${target} route failure is reported as saved unpaid order and does not resubmit`,()=>{
    const f=fixture(target,{routeFails:true});f.p.confirmOrder();f.modals[0].success({confirm:true})
    assert.equal(f.orders().length,1);assert.ok(f.modals.some(m=>m.title==='演示订单已保存'))
    f.p.confirmOrder();assert.equal(f.orders().length,1)
  })
  test(`${target} direct purchase only clears its own selection`,()=>{
    const f=fixture(target,{direct:true});f.p.confirmOrder();f.modals[0].success({confirm:true})
    assert.equal(f.orders()[0].items[0].quantity,2);assert.equal(f.storage.has('stall_direct_purchase_v1'),false)
    assert.equal(f.storage.get(CART)[0].quantity,1)
  })
  test(`${target} existing orders Tab selects all once and does not replay creation notice`,()=>{
    const f=fixture(target),orders=f.page('orders');orders.onShow()
    orders.switchTab({currentTarget:{dataset:{tab:'completed'}}});orders.onHide()
    f.p.confirmOrder();f.modals[0].success({confirm:true});orders.onShow()
    assert.equal(orders.data.activeTab,'all');assert.equal(orders.data.createdId,f.orders()[0].id)
    orders.onHide();orders.onShow();assert.equal(orders.data.createdId,'')
  })
  test(`${target} a DEMO order notice cannot cross an identity or cloud context`,()=>{
    const f=fixture(target);f.p.confirmOrder();f.modals[0].success({confirm:true})
    f.storage.set(CONFIG,{apiBase:'https://staging.invalid',storeSlug:'sample'})
    assert.equal(f.orderModule().takeCreatedDemoOrder(),'')
    f.storage.delete(CONFIG);assert.equal(f.orderModule().takeCreatedDemoOrder(),'')
  })
}
