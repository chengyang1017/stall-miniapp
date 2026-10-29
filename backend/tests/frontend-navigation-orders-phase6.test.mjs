// Phase 6: actual orders Page + actual customer orders API, in isolated VMs.
// Requires Node >=22.13 (native TypeScript stripping); no compiler subprocess,
// generated app files, network, database, real storage or WeChat runtime.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const root=new URL('../../',import.meta.url)
function javascript(file,expectedImports){
  const ts=readFileSync(new URL(file,root),'utf8')
  const js=stripTypeScriptTypes(ts,{mode:'strip',sourceUrl:file})
  let imports=0
  const body=js.replace(/^import[^\r\n]*(?:\r?\n|$)/gm,()=>{imports++;return '\n'})
  assert.equal(imports,expectedImports,`${file}: import layout changed; update the harness explicitly`)
  return body
}
const paymentJS=stripTypeScriptTypes(readFileSync(new URL('miniprogram/modules/shared/domain/payment.ts',root),'utf8'),{mode:'strip'}).replace(/^export /gm,'')
const pageJS=javascript('miniprogram/pages/orders/orders.ts',4)
let exports=0
const apiJS=javascript('miniprogram/modules/customer/api/orders.ts',2)
  .replace(/^export (?=(?:const|function)\b)/gm,()=>{exports++;return ''})
assert.equal(exports,3,'API export layout changed; update the harness explicitly')
const clone=v=>JSON.parse(JSON.stringify(v))
const ids=p=>Array.from(p.data.visibleOrders,o=>o.id)
const tab=name=>({currentTarget:{dataset:{tab:name}}})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const cursor='opaque_page_2'
const counts={all:40,unpaid:8,active:21,completed:9,other:2}
const order=(n,extra={})=>({id:id(n),createdAt:'2026-10-25T04:00:00.000Z',
  paymentStatus:'paid',fulfillmentStatus:'preparing',totalCents:1250,
  items:[{name:'商品甲',quantity:2}],...extra})
const page=(orders,hasMore=false,nextCursor=null)=>({orders,hasMore,nextCursor,counts:{...counts}})

function fixture({cloud=true,local=[]}={}){
  let cfg=cloud?{apiBase:'https://orders.invalid',storeSlug:'store-a'}:null
  let token='synthetic-token-A',localReads=0,definition
  const requests=[],writes=[],calls=[],jobs=[]
  const identity=()=>JSON.stringify([cfg?.apiBase??null,cfg?.storeSlug??null,token])
  const wx=new Proxy({
    getStorageSync(key){assert.equal(key,'stall_server_session_v1');return token},
    request(options){
      let settled=false
      requests.push({options,
        resolve(data,statusCode=200){assert.equal(settled,false,'mock request completed twice');settled=true;options.success({statusCode,data})},
        reject(error=Error('synthetic offline')){assert.equal(settled,false,'mock request completed twice');settled=true;options.fail(error)}})
    },
    stopPullDownRefresh(){calls.push('stopPullDownRefresh')},
    navigateTo(options){calls.push(['navigateTo',options.url])}
  },{get(target,key){assert.ok(key in target,`unexpected wx API: ${String(key)}`);return target[key]}})
  const globals={wx,getCloudContext:()=>cfg,supportIdentity:identity,
    fetch(){assert.fail('real network must never be called')}}
  const api=vm.runInNewContext(`${apiJS}\n;({customerOrdersConfig,customerOrdersRequest})`,globals,
    {filename:'customer/api/orders.ts',timeout:1000})
  vm.runInNewContext(paymentJS+'\n'+pageJS,{...globals,...api,
    Page(value){definition=value},
    loadWorkflowOrders(){localReads++;return clone(local)},chinaTime:value=>'北京时间:'+value
  },{filename:'pages/orders/orders.ts',timeout:1000})
  assert.ok(definition?.loadCloudPage,'actual orders Page was not registered')
  const p={...definition,data:clone(definition.data),setData(patch){writes.push(clone(patch));Object.assign(this.data,patch)}}
  const load=p.loadCloudPage
  p.loadCloudPage=function(reset){const job=load.call(this,reset);jobs.push(job);return job}
  return {p,api,requests,writes,calls,jobs,
    latest:()=>jobs.at(-1),localReads:()=>localReads,
    config:()=>cfg,setCloud(value){cfg=value?{...value}:null},
    setIdentity(value){token=value},setStore(slug){cfg={...cfg,storeSlug:slug}}}
}
async function loaded(payload=page([order(1)],true,cursor),options){
  const f=fixture(options);f.p.onLoad({created:id(1)});f.p.onShow()
  assert.equal(f.requests.length,1)
  f.requests[0].resolve(payload);await f.latest();return f
}
function params(request){return new URL(request.options.url).searchParams}

test('phase6: initial load sends scoped authenticated parameters and normalizes real page state',async()=>{
  const f=await loaded(page([order(1,{totalCents:'1250',fulfillmentStatus:'delivering',estimatedArrival:'18:30',
    merchantNote:'private',merchantNoteVersion:2,items:[{name:'甲',quantity:2},{name:'乙',quantity:1},{name:'丙',quantity:1}]})]))
  const r=f.requests[0]
  assert.equal(new URL(r.options.url).pathname,'/v1/stores/store-a/orders')
  assert.equal(r.options.method,'GET');assert.equal(r.options.timeout,15000)
  assert.equal(r.options.header.Authorization,'Bearer synthetic-token-A')
  assert.deepEqual(Object.fromEntries(params(r)),{tab:'all',limit:'20'})
  assert.equal(f.p.data.createdId,id(1));assert.deepEqual(ids(f.p),[id(1)])
  const row=f.p.data.visibleOrders[0]
  assert.equal(row.totalText,'12.50');assert.equal(row.statusText,'配送中')
  assert.equal(row.showEta,true);assert.equal(row.etaText,'18:30');assert.equal(row.itemSummary,'甲 × 2、乙 × 1 等')
  assert.equal(row.createdText,'北京时间:2026-10-25T04:00:00.000Z')
  assert.equal('merchantNote' in row,false);assert.equal('merchantNoteVersion' in row,false)
  assert.equal(f.p.data.tabs[0].count,40);assert.equal(f.p.data.loading,false);assert.equal(f.localReads(),0)
})

test('phase6: empty successful response clears pagination without inventing orders',async()=>{
  const f=await loaded(page([]));assert.deepEqual(ids(f.p),[])
  assert.equal(f.p.data.error,'');assert.equal(f.p.data.hasMore,false);assert.equal(f.p.data.nextCursor,'')
})

test('phase6: next page appends orders and forwards the opaque cursor unchanged',async()=>{
  const f=await loaded();const pending=f.p.loadMore()
  assert.equal(f.p.data.loading,true);assert.deepEqual(ids(f.p),[id(1)])
  assert.equal(params(f.requests[1]).get('cursor'),cursor)
  f.requests[1].resolve(page([order(2)]));await pending
  assert.deepEqual(ids(f.p),[id(1),id(2)]);assert.equal(f.p.data.allOrders.length,2)
  assert.equal(f.p.data.tabs[0].count,40);assert.equal(f.p.data.hasMore,false)
})

test('phase6: overlapping IDs across pages are not displayed twice',async()=>{
  const f=await loaded();const pending=f.p.loadMore()
  f.requests[1].resolve(page([order(1),order(2)]));await pending
  assert.deepEqual(ids(f.p),[id(1),id(2)])
})

test('phase6: duplicate IDs inside a single returned page are displayed once',async()=>{
  const f=await loaded(page([order(1),order(1),order(2)]))
  assert.deepEqual(ids(f.p),[id(1),id(2)],'one response must not create duplicate WXML keys')
})

test('phase6: repeated reach-bottom events share one in-flight pagination request',async()=>{
  const f=await loaded();f.p.onReachBottom();const pending=f.latest()
  f.p.onReachBottom();f.p.onReachBottom();await f.p.loadMore()
  assert.equal(f.requests.length,2)
  f.requests[1].resolve(page([order(2)]));await pending
  assert.deepEqual(ids(f.p),[id(1),id(2)])
})

test('phase6: unknown filter leaves tab, rows and request count unchanged',async()=>{
  const f=await loaded();const before=clone(f.p.data)
  f.p.switchTab(tab('not-a-tab'));assert.deepEqual(clone(f.p.data),before);assert.equal(f.requests.length,1)
})

test('phase6: rapid filter requests completing in reverse order retain only the newest result',async()=>{
  const f=fixture();f.p.onShow();const first=f.latest()
  f.p.switchTab(tab('unpaid'));const second=f.latest()
  f.p.switchTab(tab('completed'));const third=f.latest()
  assert.deepEqual(f.requests.map(r=>params(r).get('tab')),['all','unpaid','completed'])
  assert.ok(f.requests.every(r=>!params(r).has('cursor')))
  f.requests[2].resolve(page([order(3,{fulfillmentStatus:'delivered'})]));await third
  f.requests[1].resolve(page([order(2,{paymentStatus:'unpaid'})]));await second
  f.requests[0].resolve(page([order(1)]));await first
  assert.equal(f.p.data.activeTab,'completed');assert.deepEqual(ids(f.p),[id(3)])
})

test('phase6: stale failure cannot clear the newer filter loading indicator or set its error',async()=>{
  const f=fixture();f.p.onShow();const first=f.latest();f.p.switchTab(tab('active'));const second=f.latest()
  f.requests[0].reject();await first
  assert.equal(f.p.data.loading,true);assert.equal(f.p.data.error,'')
  f.requests[1].resolve(page([order(2)]));await second;assert.deepEqual(ids(f.p),[id(2)])
})

test('phase6: pull refresh clears cursor and rejects a late pre-refresh page',async()=>{
  const f=await loaded();const more=f.p.loadMore();f.p.onPullDownRefresh();const refreshed=f.latest()
  assert.deepEqual(ids(f.p),[]);assert.equal(f.p.data.nextCursor,'');assert.equal(params(f.requests[2]).has('cursor'),false)
  f.requests[2].resolve(page([order(3)]));await refreshed;await Promise.resolve()
  f.requests[1].resolve(page([order(2)]));await more
  assert.deepEqual(ids(f.p),[id(3)]);assert.deepEqual(f.calls,['stopPullDownRefresh'])
})

for(const action of ['onHide','onUnload'])for(const outcome of ['resolve','reject']){
  test(`phase6: ${action} invalidates late ${outcome} without additional setData`,async()=>{
    const f=fixture();f.p.onShow();const pending=f.latest();f.p[action]()
    const data=clone(f.p.data),writeCount=f.writes.length
    if(outcome==='resolve')f.requests[0].resolve(page([order(1)]));else f.requests[0].reject()
    await pending;assert.deepEqual(clone(f.p.data),data);assert.equal(f.writes.length,writeCount)
    assert.deepEqual(ids(f.p),[])
  })
}

test('phase6: changed identity rejects a pending response before orders reach the page',async()=>{
  const f=fixture();f.p.onShow();const pending=f.latest();f.setIdentity('synthetic-token-B')
  f.requests[0].resolve(page([order(1)]));await pending
  assert.deepEqual(ids(f.p),[]);assert.equal(f.p.data.error,'');assert.equal(f.p.data.loading,false)
})

test('phase6: identity change before pagination cannot retain or append the previous user orders',async()=>{
  const f=await loaded();f.setIdentity('synthetic-token-B');const pending=f.p.loadMore()
  const during=ids(f.p),sentCursor=params(f.requests[1]).get('cursor')
  // Backend cursors are identity-scoped: a cursor issued to A is rejected for B.
  // This checks frontend cached-data isolation, not a fictitious backend bypass.
  f.requests[1].resolve({error:'invalid_cursor'},400);await pending
  assert.deepEqual({oldRowsDuring:during.includes(id(1)),oldRowsAfter:ids(f.p).includes(id(1)),oldCursorSent:sentCursor===cursor},
    {oldRowsDuring:false,oldRowsAfter:false,oldCursorSent:false})
})

test('phase6: store change before pagination cannot reuse the previous store rows or cursor',async()=>{
  const f=await loaded();f.setStore('store-b');const pending=f.p.loadMore()
  const during=ids(f.p),request=f.requests[1]
  f.requests[1].resolve({error:'invalid_cursor'},400);await pending
  assert.equal(new URL(request.options.url).pathname,'/v1/stores/store-b/orders')
  assert.deepEqual({oldRowsDuring:during.includes(id(1)),oldRowsAfter:ids(f.p).includes(id(1)),oldCursorSent:params(request).get('cursor')===cursor},
    {oldRowsDuring:false,oldRowsAfter:false,oldCursorSent:false})
})

test('phase6: onShow after identity change resets old rows and makes a fresh first-page request',async()=>{
  const f=await loaded();f.setIdentity('synthetic-token-B');f.p.onShow();const pending=f.latest()
  assert.deepEqual(ids(f.p),[]);assert.equal(params(f.requests[1]).has('cursor'),false)
  assert.equal(f.requests[1].options.header.Authorization,'Bearer synthetic-token-B')
  f.requests[1].resolve(page([order(2)]));await pending;assert.deepEqual(ids(f.p),[id(2)])
})

for(const [name,payload] of [
  ['null page',null],['non-array orders',{orders:{},hasMore:false}],
  ['non-boolean hasMore',{orders:[],hasMore:'yes'}],['non-string next cursor',page([],true,42)],
  ['empty next cursor',page([order(1)],true,'')],
  ['order with no stable ID',page([order(1,{id:''})])],
  ['order with non-numeric total',page([order(1,{totalCents:'not-money'})])]
])test(`phase6: malformed ${name} is rejected without exposing invalid rows`,async()=>{
  const f=await loaded(payload)
  assert.deepEqual({hasError:!!f.p.data.error,rows:ids(f.p),totals:Array.from(f.p.data.visibleOrders,o=>o.totalText),hasMore:f.p.data.hasMore},
    {hasError:true,rows:[],totals:[],hasMore:false},`${name} must be rejected before rendering`)
  assert.equal(f.p.data.loading,false);assert.equal(f.localReads(),0)
})

test('phase6: first-page network failure never falls back to local demo orders',async()=>{
  const f=fixture({local:[order(99)]});f.p.onShow();const pending=f.latest();f.requests[0].reject();await pending
  assert.notEqual(f.p.data.error,'');assert.equal(f.p.data.loading,false);assert.deepEqual(ids(f.p),[])
  assert.equal(f.localReads(),0);assert.equal(f.p.data.cloudMode,true)
})

test('phase6: failed next page retains loaded rows and cursor and can be retried successfully',async()=>{
  const f=await loaded();const more=f.p.loadMore();f.requests[1].reject();await more
  assert.deepEqual(ids(f.p),[id(1)]);assert.equal(f.p.data.nextCursor,cursor)
  assert.notEqual(f.p.data.error,'');assert.equal(f.p.data.loading,false)
  const retry=f.p.loadMore();assert.equal(params(f.requests[2]).get('cursor'),cursor)
  f.requests[2].resolve(page([order(2)]));await retry
  assert.deepEqual(ids(f.p),[id(1),id(2)]);assert.equal(f.p.data.error,'')
})

test('phase6: exhausted pagination never makes another request on button or reach-bottom',async()=>{
  const f=await loaded(page([order(1)]));f.p.onReachBottom();await f.p.loadMore();f.p.onReachBottom()
  assert.equal(f.requests.length,1);assert.equal(f.p.data.loading,false)
})

test('phase6: local mode sorts, filters and counts local orders without any cloud requests',async()=>{
  const f=fixture({cloud:false,local:[order(1,{paymentStatus:'unpaid'}),order(2,{fulfillmentStatus:'delivered',createdAt:'2026-10-26T00:00:00Z'}),order(3,{fulfillmentStatus:'abnormal'})]})
  await f.p.refresh();assert.deepEqual(ids(f.p),[id(2),id(1),id(3)])
  f.p.switchTab(tab('unpaid'));assert.deepEqual(ids(f.p),[id(1)])
  f.p.switchTab(tab('completed'));assert.deepEqual(ids(f.p),[id(2)])
  f.p.switchTab(tab('other'));assert.deepEqual(ids(f.p),[id(3)])
  assert.deepEqual(Array.from(f.p.data.tabs,t=>t.count),[3,1,0,1,1]);assert.equal(f.requests.length,0)
})

test('phase6: switching cloud to local invalidates an outstanding cloud result',async()=>{
  const f=fixture({local:[order(99)]});f.p.onShow();const pending=f.latest()
  f.setCloud(null);await f.p.refresh();f.requests[0].resolve(page([order(1)]));await pending
  assert.deepEqual(ids(f.p),[id(99)]);assert.equal(f.p.data.cloudMode,false)
  assert.equal(f.p.data.nextCursor,'');assert.equal(f.p.data.hasMore,false);assert.equal(f.p.data.error,'')
})

test('phase6: switching local to cloud clears demo rows and stale errors before awaiting cloud',async()=>{
  const f=fixture({cloud:false,local:[order(99)]});await f.p.refresh();f.p.visible=true;f.p.data.error='old local error'
  f.setCloud({apiBase:'https://orders.invalid',storeSlug:'store-a'});const pending=f.p.refresh()
  assert.deepEqual(ids(f.p),[]);assert.equal(f.p.data.error,'');assert.equal(f.p.data.cloudMode,true)
  f.requests[0].resolve(page([order(1)]));await pending
  assert.deepEqual(ids(f.p),[id(1)]);assert.equal(f.localReads(),1)
})

test('phase6: pull refresh always stops its spinner after a current request failure',async()=>{
  const f=await loaded();f.p.onPullDownRefresh();const pending=f.latest()
  f.requests[1].reject();await pending;await Promise.resolve()
  assert.deepEqual(f.calls,['stopPullDownRefresh']);assert.equal(f.p.data.loading,false);assert.notEqual(f.p.data.error,'')
})

test('phase6 API: no session token rejects without invoking wx.request',async()=>{
  const f=fixture();f.setIdentity(null)
  await assert.rejects(f.api.customerOrdersRequest(f.config()),/not_logged_in/)
  assert.equal(f.requests.length,0)
})

test('phase6 API: non-200 response rejects instead of returning its payload',async()=>{
  const f=fixture(),pending=f.api.customerOrdersRequest(f.config())
  f.requests[0].resolve({orders:[order(1)]},403)
  await assert.rejects(pending,/http_403/)
})

test('phase6 API: invalid detail ID is rejected without network activity',async()=>{
  const f=fixture();await assert.rejects(f.api.customerOrdersRequest(f.config(),'not/an/order'),/invalid_order_id/)
  assert.equal(f.requests.length,0)
})

for(const context of ['identity','store'])for(const outcome of ['resolve','reject']){
  test(`phase6: ${context} switch keeps new loading and list isolated when old pagination ${outcome} runs finally`,async()=>{
    const f=await loaded()
    const oldPending=f.p.loadMore()
    assert.equal(f.requests.length,2)
    assert.equal(params(f.requests[1]).get('cursor'),cursor)
    assert.equal(f.p.data.loading,true)

    if(context==='identity')f.setIdentity('synthetic-token-B')
    else f.setStore('store-b')
    // Exercise the real page entry: scope change must restart page one even
    // though the old pagination request still owns a pending Promise.
    const newPending=f.p.loadMore()
    assert.equal(f.requests.length,3)
    const newRequest=f.requests[2]
    assert.equal(params(newRequest).has('cursor'),false)
    assert.equal(newRequest.options.header.Authorization,context==='identity'?'Bearer synthetic-token-B':'Bearer synthetic-token-A')
    assert.equal(new URL(newRequest.options.url).pathname,context==='store'?'/v1/stores/store-b/orders':'/v1/stores/store-a/orders')
    assert.equal(f.p.data.loading,true)
    assert.deepEqual(ids(f.p),[])
    assert.deepEqual(Array.from(f.p.data.allOrders),[])
    const waitingState=clone(f.p.data),writeCount=f.writes.length,newSerial=f.p.serial

    // Deliberately complete the OLD request while the NEW request is unresolved.
    // Real API success callbacks also enforce identity; both outcomes must drain
    // the old page request's catch/return and finally without touching new state.
    if(outcome==='resolve')f.requests[1].resolve(page([order(2)]))
    else f.requests[1].reject(Error('obsolete pagination failed'))
    await oldPending
    assert.equal(f.p.data.loading,true,'old finally must not stop the new loading indicator')
    assert.equal(f.p.serial,newSerial,'obsolete completion must not invalidate the new generation')
    assert.equal(f.writes.length,writeCount,'obsolete completion must not call setData')
    assert.deepEqual(clone(f.p.data),waitingState,'rows, cursor, counts and error must stay in the new context')

    const newCounts={all:2,unpaid:0,active:2,completed:0,other:0}
    newRequest.resolve({...page([order(3)],true,'new_context_page_2'),counts:newCounts})
    await newPending
    assert.equal(f.p.data.loading,false,'only the current request may finish loading')
    assert.equal(f.p.data.error,'')
    assert.deepEqual(ids(f.p),[id(3)])
    assert.deepEqual(Array.from(f.p.data.allOrders,o=>o.id),[id(3)])
    assert.equal(f.p.data.hasMore,true)
    assert.equal(f.p.data.nextCursor,'new_context_page_2')
    assert.deepEqual(Object.fromEntries(Array.from(f.p.data.tabs,t=>[t.key,t.count])),newCounts)
    assert.equal(f.requests.length,3)
    assert.equal(f.localReads(),0)
  })
}
