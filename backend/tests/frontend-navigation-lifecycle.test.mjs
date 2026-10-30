// Phase 5: execute actual order-detail asynchronous handlers with isolated WeChat mocks.
// No backend/network, writes, production data or UI automation.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const file = new URL('../../miniprogram/pages/order-detail/order-detail.ts',import.meta.url)
const source = readFileSync(file,'utf8')
function method(name,next,globals){
  const match=new RegExp(`(?:^|\\n)\\s*(?:async\\s+)?${name}\\(`).exec(source)
  assert.ok(match,`Missing actual method: ${name}`)
  const start=match.index+match[0].search(/(?:async\s+)?[a-zA-Z]+\(/)
  const end=source.indexOf(next,start)
  assert.ok(end>start,`Cannot isolate actual method ${name}`)
  // The source is TypeScript, but Node's vm executes JavaScript.
  // Strip only the explicit type assertions used by these extracted handlers.
  // Keep the original control flow and side effects unchanged.
  const body=source.slice(start,end).trim().replace(/,\s*$/,'')
    .replace(/\(i\s*:\s*any\)/g,'(i)')
    .replace(/\s+as\s+Record<string,\s*string>/g,'')
    .replace(/\s+as\s+any\[\]/g,'')
  return vm.runInNewContext(`({${body}}).${name}`,globals,{filename:'order-detail.ts',timeout:1000})
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function fixture({cloud=true}={}){
  let identity='customer-A'
  const requests=[],proofs=[],calls=[]
  const wx={showToast:a=>calls.push(['toast',a.title]),previewImage:a=>calls.push(['preview',a.current])}
  const globals={wx,
    customerOrdersConfig:()=>cloud?{storeSlug:'store-A'}:null,
    customerOrdersRequest:()=>{const gate=deferred();requests.push(gate);return gate.promise},
    supportIdentity:()=>identity,
    proofUrl:()=>{const gate=deferred();proofs.push(gate);return gate.promise},
    paymentLabel:()=> '支付状态待核实',loadWorkflowOrders:()=>[],chinaTime:x=>x,workflowText:x=>x}
  const p={detailSerial:0,detailVisible:false,detailContext:'',simulationOperation:0,loadSimulationCapability(){},
    data:{order:{id:'order-A'},found:false,proofImage:'',proofError:'',proofLoading:false,cloudMode:false,items:[]},
    setData(v){Object.assign(this.data,v)}}
  for(const [name,next] of [
    ['onShow','onHide()'],['onHide','onUnload()'],['onUnload','async loadSimulationCapability('],
    ['renewProof','async previewProof()'],['previewProof','\n})']])p[name]=method(name,next,globals)
  return {p,requests,proofs,calls,setIdentity:x=>{identity=x}}
}
const response=(id,status='preparing')=>({order:{id,fulfillmentStatus:status,paymentStatus:'paid',totalCents:1250},items:[]})

test('order detail: pending response is ignored after page hide',async()=>{
  const f=fixture(),pending=f.p.onShow();assert.equal(f.requests.length,1)
  f.p.onHide();f.requests[0].resolve(response('order-A'));await pending
  assert.equal(f.p.data.found,false);assert.equal(f.calls.length,0)
})
test('order detail: pending response is ignored after unload',async()=>{
  const f=fixture(),pending=f.p.onShow();f.p.onUnload()
  f.requests[0].resolve(response('order-A'));await pending
  assert.equal(f.p.data.found,false)
})
test('order detail: old request cannot overwrite newer onShow',async()=>{
  const f=fixture(),first=f.p.onShow();f.p.data.order={id:'order-B'}
  const second=f.p.onShow();assert.equal(f.requests.length,2)
  f.requests[1].resolve(response('order-B'));await second
  f.requests[0].resolve(response('order-A'));await first
  assert.equal(f.p.data.order.id,'order-B');assert.equal(f.p.data.found,true)
})
test('order detail: identity change discards pending order response',async()=>{
  const f=fixture(),pending=f.p.onShow();f.setIdentity('customer-B')
  f.requests[0].resolve(response('order-A'));await pending
  assert.equal(f.p.data.found,false)
})
test('order detail: obsolete fetch failure does not show toast',async()=>{
  const f=fixture(),pending=f.p.onShow();f.p.onHide()
  f.requests[0].reject(Error('offline'));await pending
  assert.equal(f.calls.length,0)
})
test('order detail: current fetch failure shows error, not fabricated order',async()=>{
  const f=fixture(),pending=f.p.onShow();f.requests[0].reject(Error('offline'));await pending
  assert.equal(f.p.data.found,false)
  assert.deepEqual(f.calls,[['toast','订单详情加载失败']])
})
test('proof: concurrent refreshes make one request and show latest URL',async()=>{
  const f=fixture();f.p.detailVisible=true;f.p.data.found=true
  const a=f.p.renewProof(),b=f.p.renewProof();assert.equal(f.proofs.length,1)
  f.proofs[0].resolve('https://proof.example/image');await Promise.all([a,b])
  assert.equal(f.p.data.proofImage,'https://proof.example/image')
  assert.equal(f.p.data.proofLoading,false)
})
test('proof: hiding page discards a late signed URL',async()=>{
  const f=fixture();f.p.detailVisible=true;f.p.data.found=true
  const pending=f.p.renewProof();f.p.onHide()
  f.proofs[0].resolve('https://proof.example/stale');await pending
  assert.equal(f.p.data.proofImage,'');assert.equal(f.p.data.proofLoading,false)
})
test('proof: identity change discards a late signed URL',async()=>{
  const f=fixture();f.p.detailVisible=true;f.p.data.found=true
  const pending=f.p.renewProof();f.setIdentity('customer-B')
  f.proofs[0].resolve('https://proof.example/stale');await pending
  assert.equal(f.p.data.proofImage,'')
})
test('proof: current URL failure is reported without image',async()=>{
  const f=fixture();f.p.detailVisible=true;f.p.data.found=true
  const pending=f.p.renewProof();f.proofs[0].reject(Error('expired'));await pending
  assert.equal(f.p.data.proofImage,'')
  assert.match(f.p.data.proofError,/凭证暂不可用/)
  assert.equal(f.p.data.proofLoading,false)
})
test('proof: preview with no image does not open image viewer',async()=>{
  const f=fixture({cloud:false});await f.p.previewProof()
  assert.equal(f.calls.length,0)
})
