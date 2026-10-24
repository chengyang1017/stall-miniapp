import test from 'node:test'
import assert from 'node:assert/strict'
import { orderWorkflowRoute } from '../src/orderWorkflow.mjs'

const slug = 'demo-store'
const id = '11111111-1111-4111-8111-111111111111'
const token = 'A'.repeat(48)
const endpoint = `/v1/merchant/stores/${slug}/orders/${id}/status`
function request(body, authorized=true) {
  const raw=JSON.stringify(body)
  return {method:'POST',headers:{...(authorized?{authorization:`Bearer ${token}`}:{})},async *[Symbol.asyncIterator](){yield Buffer.from(raw)}}
}
function response(){return {statusCode:0,body:null,writeHead(code){this.statusCode=code},end(body){this.body=JSON.parse(body)}}}
function database({allowed=true, status='new', payment='unpaid'}={}) {
  const statements=[]
  const client={async query(sql, params){
    const s=String(sql);statements.push({sql:s,params})
    if (/SELECT fulfillment_status,payment_status FROM orders/.test(s)) return {rows:[{fulfillment_status:status,payment_status:payment}]}
    if (/^SELECT .*FROM orders/.test(s) && /FOR UPDATE/.test(s)) return {rows:[{fulfillment_status:status,payment_status:payment}]}
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)||/^UPDATE orders/.test(s)||/^INSERT INTO order_status_events/.test(s))return {rows:[]}
    throw new Error('Unexpected transaction SQL: '+s)
  },release(){}}
  return {statements,async query(sql,params){
    const s=String(sql);statements.push({sql:s,params})
    if (/FROM auth_sessions/.test(s))return {rows:[{external_subject:'merchant:1'}]}
    if (/FROM merchant_members/.test(s))return {rows:allowed?[{id:'store-id',slug,role:'owner'}]:[]}
    throw new Error('Unexpected authorization SQL: '+s)
  },async connect(){return client}}
}
async function perform(body,opts){const db=database(opts),res=response();await orderWorkflowRoute(request(body),res,new URL(endpoint,'http://localhost'),db);return {db,res}}
const mutated=db=>db.statements.some(x=>/^UPDATE orders|^INSERT INTO order_status_events/.test(x.sql))

test('unassigned merchant cannot update order',async()=>{
 const {db,res}=await perform({status:'accepted'},{allowed:false});assert.equal(res.statusCode,403);assert.equal(mutated(db),false)
})
test('invalid status is rejected without order update',async()=>{
 const {db,res}=await perform({status:'refunded'});assert.equal(res.statusCode,400);assert.equal(mutated(db),false)
})
test('delivery exception requires a reason',async()=>{
 const {db,res}=await perform({status:'abnormal',reason:''});assert.equal(res.statusCode,400);assert.equal(mutated(db),false)
})
test('cancellation reason must not exceed 200 characters',async()=>{
 const {db,res}=await perform({status:'cancelled',reason:'x'.repeat(201)});assert.equal(res.statusCode,400);assert.equal(mutated(db),false)
})
test('delivered transition requires proof key',async()=>{
 const {db,res}=await perform({status:'delivered'});assert.equal(res.statusCode,400);assert.equal(mutated(db),false)
})
test('cannot skip from new directly to preparing',async()=>{
 const {db,res}=await perform({status:'preparing'},{status:'new'});assert.equal(res.statusCode,409);assert.equal(mutated(db),false);assert.ok(db.statements.some(x=>x.sql==='ROLLBACK'))
})
test('cannot cancel a delivered order',async()=>{
 const {db,res}=await perform({status:'cancelled',reason:'Customer request'},{status:'delivered',payment:'paid'});assert.equal(res.statusCode,409);assert.equal(mutated(db),false)
})
test('unpaid order remains undelivered even with plausible proof key',async()=>{
 const {db,res}=await perform({status:'delivered',proofKey:'delivery-proofs/verifiedphoto123'},{status:'delivering',payment:'unpaid'});assert.equal(res.statusCode,409);assert.equal(res.body.error,'payment_not_confirmed');assert.equal(mutated(db),false)
})
