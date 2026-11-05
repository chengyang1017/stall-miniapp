// Actual page/API bodies with controlled wx I/O; no live phone, HTTP or SQL.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
const root=new URL('../../',import.meta.url),read=f=>readFileSync(new URL(f,root),'utf8'),clone=v=>JSON.parse(JSON.stringify(v))
const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
function evaluate(file,globals={},names=[]){const js=stripTypeScriptTypes(read(file),{mode:'strip'}).replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"].*$/gm,'').replace(/^export /gm,'');return vm.runInNewContext(js+'\n;({'+names.join(',')+'})',globals,{filename:file})}
const labels=evaluate('miniprogram/modules/shared/domain/payment.ts',{},['paymentLabel','fulfillmentPaymentReady'])
const diff=evaluate('miniprogram/modules/shared/runtime/stableRows.ts',{},['stableRowsPatch'])
function page(file,globals){let definition;evaluate(file,{...labels,...diff,...globals,Page:d=>definition=d});return {...definition,data:clone(definition.data),patches:[],setData(patch){this.patches.push(clone(patch));for(const [k,v]of Object.entries(patch)){const parts=k.match(/[^.[\]]+/g);let p=this.data;for(const part of parts.slice(0,-1)){p[part]??={};p=p[part]}p[parts.at(-1)]=v}}}}
const id='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222'
const unpaid={id,createdAt:'2026-10-28T00:00:00Z',paymentStatus:'unpaid',fulfillmentStatus:'new',totalCents:1000,items:[]}
function merchant(){let context='A';const writes=[];const p=page('miniprogram/pages/admin-orders/admin-orders.ts',{merchantOrderConfig:()=>({storeSlug:'alpha'}),merchantOrderContextKey:()=>context,chinaTime:x=>x,wx:{showToast(){},showModal(){}},updateMerchantOrder:(...args)=>writes.push(args)});p.context='A';p.visible=true;p.data.cloudMode=true;p.loaded=[{...unpaid},{...unpaid,id:key,paymentStatus:'paid',paymentSource:'staging_simulated'}];p.render();return {p,writes,identity:()=>context='B'}}
test('merchant retains unpaid order but disables its next action and labels simulated payment separately',async()=>{const {p}=merchant();assert.equal(p.data.dateResults[0].paymentBlocked,true);assert.equal(p.data.dateResults[0].batchEligible,false);assert.equal(p.data.dateResults[1].paymentBlocked,false);assert.match(p.data.dateResults[1].paymentLabel,/测试订单.*模拟支付已确认.*非真实收款/);assert.match(read('miniprogram/pages/admin-orders/admin-orders.wxml'),/disabled="\{\{item.paymentBlocked/);assert.match(read('miniprogram/pages/admin-orders/admin-orders.wxml'),/尚未确认支付，不能接单/)
 const bill=page('miniprogram/pages/admin-billing/admin-billing.ts',{getCloudContext:()=>({apiBase:'https://unit.invalid',storeSlug:'alpha'}),businessContextKey:()=> 'A',authorizedGet:async()=>({summary:{orderCount:1,pendingCount:0,deliveredCount:0,cancelCount:0,orderCents:1000,unpaidCents:0},items:[{...unpaid,paymentStatus:'paid',paymentSource:'staging_simulated'}],hasMore:false})})
 await bill.loadPage(true);assert.match(bill.data.rows[0].payment,/模拟支付已确认/);assert.equal(bill.data.received,'0.00')
})
test('merchant direct next and batch selection cannot include unpaid cloud order',async()=>{const {p,writes}=merchant();await p.next({currentTarget:{dataset:{id,status:'accepted'}}});assert.equal(writes.length,0);p.data.batchMode=true;p.toggleOrder({currentTarget:{dataset:{id}}});assert.deepEqual(Array.from(p.data.selectedIds),[]);p.selectAll();assert.deepEqual(Array.from(p.data.selectedIds),[key])})
test('merchant payment update patches only affected card fields and preserves unsaved notes',()=>{const {p}=merchant();p.data.noteInputs[id]='未提交备注';p.render();const start=p.patches.length;p.loaded[0].paymentStatus='paid';p.loaded[0].paymentSource='staging_simulated';p.render();const changes=p.patches.slice(start);assert.ok(changes.every(x=>!Object.hasOwn(x,'dateResults')));assert.ok(changes.some(x=>Object.hasOwn(x,'dateResults[0].paymentBlocked')));assert.ok(changes.every(x=>Object.keys(x).every(k=>!k.startsWith('dateResults[1]'))));assert.equal(p.data.dateResults[0].noteDraft,'未提交备注')})
test('merchant full-store pending/unpaid counts are not derived from current page',()=>{const {p}=merchant();p.setCounts({all:100,new:3,unpaid:45,accepted:2,preparing:0,delivering:0,delivered:50,cancelled:0,abnormal:0,other:0});assert.equal(p.data.globalPending,3);assert.equal(p.data.orderTabs.find(t=>t.key==='unpaid').count,45)})
function detail(){let identity='A',order={...unpaid};const confirms=[],capabilities=[],modal=[];const p=page('miniprogram/pages/order-detail/order-detail.ts',{customerOrdersConfig:()=>({storeSlug:'alpha'}),supportIdentity:()=>identity,customerOrdersRequest:async()=>({order:clone(order),items:[]}),stagingOrderPayment:(_c,_id,k)=>{const d=gate();(k?confirms:capabilities).push({...d,key:k});return d.promise},supportKey:()=>key,chinaTime:x=>x,wx:{showToast(){},showModal:o=>modal.push(o)}});p.data.order={id};return {p,confirms,capabilities,modal,identity:v=>identity=v,order:v=>order={...order,...v}}}
test('customer test entry hidden until backend capability confirms explicit authorization',async()=>{const f=detail();await f.p.onShow();assert.equal(f.p.data.simulationAuthorized,false);f.capabilities[0].resolve({authorized:true,eligible:true});await tick();assert.equal(f.p.data.simulationAuthorized,true);assert.equal(f.confirms.length,0)})
test('capability denial/revocation removes test entry without fabricating payment',async()=>{const f=detail();await f.p.onShow();f.capabilities[0].reject(Error('http_403'));await tick();assert.equal(f.p.data.simulationAuthorized,false);assert.match(f.p.data.paymentText,/待支付/);await f.p.confirmSimulation();assert.equal(f.confirms.length,0)})
test('customer failed confirmation preserves key and retry never sends amount or paid flag',async()=>{const f=detail();await f.p.onShow();f.capabilities[0].resolve({eligible:true});await tick();const pending=f.p.confirmSimulation();f.modal[0].success({confirm:true});await tick();const duplicate=f.p.confirmSimulation();assert.equal(f.confirms.length,1);await duplicate;assert.equal(f.p.data.simulationBusy,true);f.confirms[0].reject(Error('network unknown'));await pending;assert.ok(f.p.data.simulationError);assert.equal(f.p.simulationKey,key);assert.equal(f.p.data.order.paymentStatus,'unpaid');const again=f.p.confirmSimulation();f.modal[1].success({confirm:true});await tick();assert.equal(f.confirms[1].key,key);f.confirms[1].reject(Error('http_409'));await again})
test('successful simulation only displays server-refreshed order; same card stays found while loading',async()=>{const f=detail();await f.p.onShow();f.capabilities[0].resolve({eligible:true});await tick();const pending=f.p.confirmSimulation();f.modal[0].success({confirm:true});await tick();f.order({paymentStatus:'paid',paymentSource:'staging_simulated'});const start=f.p.patches.length;f.confirms[0].resolve({ok:true,simulated:true,orderId:id});await pending;assert.equal(f.p.data.found,true);assert.ok(f.p.patches.slice(start).every(p=>p.found!==false));assert.match(f.p.data.paymentText,/模拟支付已确认/);assert.equal(f.p.simulationKey,'');assert.equal(f.p.data.simulationBusy,false)})
for(const lifecycle of ['hide','unload','identity'])test('obsolete simulation confirmation does not publish after '+lifecycle,async()=>{const f=detail();await f.p.onShow();f.capabilities[0].resolve({eligible:true});await tick();const pending=f.p.confirmSimulation();f.modal[0].success({confirm:true});await tick();if(lifecycle==='identity')f.identity('B');else f.p[lifecycle==='hide'?'onHide':'onUnload']();const start=f.p.patches.length;f.confirms[0].resolve({ok:true});await pending;assert.ok(f.p.patches.slice(start).every(p=>!p.order&&!p.paymentText));assert.equal(f.p.data.order.paymentStatus,'unpaid')})
test('actual customer API binds response to current identity and refuses unconfirmed POST success',async()=>{let identity='A';const requests=[];const api=evaluate('miniprogram/modules/customer/api/orders.ts',{supportIdentity:()=>identity,getCloudContext:()=>({}),wx:{getStorageSync:()=> 'test-token',request:o=>requests.push(o)}},['stagingOrderPayment']);const cfg={apiBase:'https://unit.invalid',storeSlug:'alpha'};const first=api.stagingOrderPayment(cfg,id,key);assert.deepEqual(clone(requests[0].data),{requestKey:key});identity='B';requests[0].success({statusCode:200,data:{ok:true,simulated:true,orderId:id}});await assert.rejects(first,/identity_changed/);const second=api.stagingOrderPayment(cfg,id,key);requests[1].success({statusCode:200,data:{ok:true,simulated:false,orderId:id}});await assert.rejects(second,/unconfirmed_response/)})

test('Sandbox merchant review stays a read-only GET and never exposes resolution controls',()=>{
 const api=read('miniprogram/modules/shared/api/sandboxPayment.ts')
 const page=read('miniprogram/pages/admin-orders/admin-orders.ts')
 const view=read('miniprogram/pages/admin-orders/admin-orders.wxml')
 assert.match(api,/sandbox-review/)
 assert.match(api,/\['sandbox-payment','sandbox-review','sandbox-review-verify'\]\.includes\(action\)\?'GET':'POST'/)
 assert.match(page,/sandboxPaymentRequest\(cfg,id,true,'sandbox-review'\)/)
 assert.match(page,/merchantOrderContextKey\(\)/)
 assert.match(view,/bindtap="viewSandboxReview"/)
 assert.match(view,/核查模式：只读/)
 assert.doesNotMatch(view,/bindtap="resolveSandboxReview"/)
})

test('merchant review verification uses read-only Stripe evidence and never renders settlement controls',()=>{
 const api=read('miniprogram/modules/shared/api/sandboxPayment.ts')
 const page=read('miniprogram/pages/admin-orders/admin-orders.ts')
 const view=read('miniprogram/pages/admin-orders/admin-orders.wxml')
 assert.match(api,/sandbox-review-verify/)
 assert.match(page,/sandboxPaymentRequest\(cfg,id,true,'sandbox-review-verify'\)/)
 assert.match(view,/bindtap="verifySandboxReview"/)
 assert.match(view,/仅供人工判断，不改变订单/)
})

test('merchant review reloads immutable saved verification rather than relying on a transient Stripe response',async()=>{
 const saved={sandbox:true,readOnly:true,requiresManualReview:true,attempt:{orderId:id,status:'review'},latestVerification:{id:'audit1',reviewedBy:'owner',createdAt:'2026-11-05T00:00:00Z',evidence:{readOnly:true,providerVerified:true,paymentStatus:'paid'}}}
 const calls=[]
 const p=page('miniprogram/pages/admin-orders/admin-orders.ts',{merchantOrderConfig:()=>({apiBase:'https://unit.invalid',storeSlug:'alpha'}),merchantOrderContextKey:()=> 'A',sandboxPaymentRequest:async(_cfg,_id,_merchant,action='sandbox-payment')=>{
  calls.push(action);return action==='sandbox-review-verify'?{sandbox:true,auditId:'audit1'}:saved
 }})
 p.visible=true;p.context='A';p.data.sandboxOrderId=id;p.data.sandbox={attempts:[{status:'review'}]}
 await p.viewSandboxReview()
 assert.equal(p.data.sandboxEvidenceMeta.id,'audit1')
 assert.equal(p.data.sandboxEvidence.paymentStatus,'paid')
 await p.verifySandboxReview()
 assert.deepEqual(calls,['sandbox-review','sandbox-review-verify','sandbox-review'])
 assert.equal(p.data.sandboxEvidenceMeta.reviewedBy,'owner')
 assert.equal(p.data.sandboxReviewError,'')
 const view=read('miniprogram/pages/admin-orders/admin-orders.wxml')
 assert.match(view,/sandboxEvidenceMeta\.reviewedBy/)
 assert.match(view,/审计记录/)
})

test('merchant review release requires saved expired/unpaid evidence and reconfirms server state',async()=>{
 const calls=[],modals=[]
 const review={attempt:{id:'attempt1',orderId:id,status:'review'},latestVerification:{id:'audit1'}}
 const p=page('miniprogram/pages/admin-orders/admin-orders.ts',{merchantOrderConfig:()=>({apiBase:'https://unit.invalid',storeSlug:'alpha'}),
  merchantOrderContextKey:()=> 'A',sandboxPaymentView:x=>x,
  sandboxPaymentRequest:async(_c,_id,_m,action='sandbox-payment')=>{
   calls.push(action)
   if(action==='sandbox-review-release')return {sandbox:true,action:'expired_unpaid_released',paymentConfirmed:false,auditId:'audit2'}
   return {attempts:[{id:'attempt1',status:'expired'}],refunds:[],receipts:[],stale:false}
  },wx:{showModal:x=>modals.push(x)}})
 p.visible=true;p.context='A';p.data.sandboxOrderId=id;p.data.sandboxReview=review
 p.data.sandboxEvidenceMeta={id:'audit1'}
 p.data.sandboxEvidence={providerVerified:true,sessionStatus:'complete',paymentStatus:'paid'}
 await p.releaseSandboxReview();assert.equal(modals.length,0);assert.equal(calls.length,0)
 p.data.sandboxEvidence={providerVerified:true,sessionStatus:'expired',paymentStatus:'unpaid'}
 const pending=p.releaseSandboxReview();assert.equal(modals.length,1)
 modals[0].success({confirm:true});await pending
 assert.deepEqual(calls,['sandbox-review-release','sandbox-payment'])
 assert.equal(p.data.sandboxReview,null)
 assert.equal(p.data.sandbox.attempts[0].status,'expired')
 assert.match(p.data.sandboxReleaseMessage,/仍未付款/)
 assert.equal(p.data.sandboxReleaseBusy,false)
})
test('review release cancellation and invalid status never call the provider',async()=>{
 const calls=[],modals=[]
 const p=page('miniprogram/pages/admin-orders/admin-orders.ts',{merchantOrderConfig:()=>({apiBase:'https://unit.invalid',storeSlug:'alpha'}),
  merchantOrderContextKey:()=> 'A',sandboxPaymentRequest:async()=>{calls.push(1)},wx:{showModal:x=>modals.push(x)}})
 p.visible=true;p.context='A';p.data.sandboxOrderId=id
 p.data.sandboxReview={attempt:{orderId:id}}
 p.data.sandboxEvidenceMeta={id:'audit'}
 p.data.sandboxEvidence={providerVerified:true,sessionStatus:'expired',paymentStatus:'unpaid'}
 const op=p.releaseSandboxReview();modals[0].success({confirm:false});await op
 assert.equal(calls.length,0)
 assert.equal(p.data.sandboxReleaseBusy,false)
 assert.match(read('miniprogram/pages/admin-orders/admin-orders.wxml'),/bindtap="releaseSandboxReview"/)
 assert.match(read('miniprogram/modules/shared/api/sandboxPayment.ts'),/sandbox-review-release/)
})
