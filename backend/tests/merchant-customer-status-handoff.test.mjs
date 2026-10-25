import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Execute the real route with isolated auth and database dependencies.
// Never import server.mjs: its listener starts background workers.
const source = readFileSync(new URL('../src/orderWorkflow.mjs', import.meta.url), 'utf8')
assert.match(source, /export async function orderWorkflowRoute/)
const imports = source.replace(/^import .*$/gm, '')
const injected = `
const authenticate = async (_pool, req) => req.testSubject || null;
const permittedStore = async (_pool, subject, slug) => subject === 'merchant' && slug === 'demo-store' ? {id:'store-one',role:'owner'} : null;
const resolveOrderInventory = async () => { throw Error('unexpected inventory mutation') };
const pageScope = () => {throw Error('pagination not expected')};
const pageQuery = () => {throw Error('pagination not expected')};
const pageResult = () => {throw Error('pagination not expected')};
const cursorTime = () => {throw Error('pagination not expected')};
const registerImage = () => {throw Error('storage not expected')};
const privateProofBucket = () => {throw Error('storage not expected')};
const headImage = () => {throw Error('storage not expected')};
const merchantOrderCounts = () => {throw Error('merchant list not expected')};
const merchantOrderQuery = () => {throw Error('merchant list not expected')};
const randomUUID = () => {throw Error('uuid not expected')};
const S3Client = class {}; const PutObjectCommand = class {};
const HeadObjectCommand = class {}; const GetObjectCommand = class {};
const getSignedUrl = () => {throw Error('storage not expected')};
`
const {orderWorkflowRoute} = await import('data:text/javascript;base64,' + Buffer.from(injected + imports).toString('base64'))
const ORDER_ID='11111111-1111-4111-8111-111111111111'
const LINE_ID='33333333-3333-4333-8333-333333333333'
const BASE='http://localhost/v1'

function fixture({payment='paid',status='new',inventoryState='none'}={}) {
  const order={id:ORDER_ID,store_id:'store-one',customer_subject:'customer-a',payment_status:payment,
    fulfillment_status:status,inventory_state:inventoryState,inventory_expired:false,delivery_proof_key:null,
    updated_at:'2026-10-25T00:00:00.000Z',total_cents:2400}
  const events=[], logs=[]
  const query=async (sql,params=[])=>{
    const s=String(sql);logs.push({sql:s,params})
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/.test(s)) return {rows:[]}
    if (s.includes('FROM orders WHERE store_id=$1 AND id=$2 FOR UPDATE'))
      return {rows:params[0]===order.store_id&&params[1]===order.id?[{...order}]:[]}
    if (s.includes('UPDATE orders SET fulfillment_status=$3')) {
      assert.equal(params[0],order.store_id);assert.equal(params[1],order.id)
      order.fulfillment_status=params[2]
      if (params[4]) order.issue_reason=params[4]
      return {rows:[],rowCount:1}
    }
    if (s.includes('INSERT INTO order_status_events')) {
      events.push({from:params[3],to:params[4],actor:params[2],note:params[5]});return {rows:[],rowCount:1}
    }
    if (s.includes('FROM orders o JOIN stores s ON s.id=o.store_id WHERE s.slug=$1 AND o.id=$2 AND o.customer_subject=$3')) {
      return {rows:params[0]==='demo-store'&&params[1]===order.id&&params[2]===order.customer_subject
        ? [{id:order.id,fulfillmentStatus:order.fulfillment_status,paymentStatus:order.payment_status,issueReason:order.issue_reason||null,totalCents:order.total_cents}]:[]}
    }
    if (s.includes('FROM order_items oi WHERE oi.order_id=$1')) {
      return {rows:params[0]===order.id?[{orderItemId:LINE_ID,name:'Rice',quantity:2,lineTotalCents:2400}]:[]}
    }
    throw Error('Unexpected SQL: '+s.slice(0,160))
  }
  const db={query,async connect(){return {query,release(){logs.push({sql:'RELEASE',params:[]})}}}}
  async function call(method,path,subject,body){
    const payload=body===undefined?'':JSON.stringify(body)
    const req={method,headers:{'content-length':String(Buffer.byteLength(payload))},testSubject:subject,
      async *[Symbol.asyncIterator](){if(payload)yield Buffer.from(payload)}}
    const res={status:null,body:null,writeHead(code){this.status=code},end(v){this.body=JSON.parse(v)}}
    assert.equal(await orderWorkflowRoute(req,res,new URL(BASE+path),db),true)
    return res
  }
  const write=(subject,next,reason)=>call('POST',`/merchant/stores/demo-store/orders/${ORDER_ID}/status`,subject,{status:next,...reason?{reason}:{}})
  const read=(subject)=>call('GET',`/stores/demo-store/orders/${ORDER_ID}`,subject)
  return {order,events,logs,write,read,call}
}

test('merchant accepts, prepares and dispatches; the customer sees each committed state',async()=>{
  const f=fixture()
  for (const next of ['accepted','preparing','delivering']) {
    const action=await f.write('merchant',next)
    assert.equal(action.status,200)
    assert.equal(action.body.status,next)
    const customer=await f.read('customer-a')
    assert.equal(customer.status,200)
    assert.equal(customer.body.order.fulfillmentStatus,next)
  }
  assert.deepEqual(f.events.map(e=>[e.from,e.to]),[['new','accepted'],['accepted','preparing'],['preparing','delivering']])
  assert.equal(f.logs.filter(x=>x.sql==='COMMIT').length,3)
})

test('invalid jump cannot modify customer-visible status or write an event',async()=>{
  const f=fixture()
  const r=await f.write('merchant','delivering')
  assert.equal(r.status,409);assert.equal(r.body.error,'invalid_transition')
  assert.equal((await f.read('customer-a')).body.order.fulfillmentStatus,'new')
  assert.equal(f.events.length,0)
  assert.ok(f.logs.some(x=>x.sql==='ROLLBACK'))
})

test('duplicate merchant acceptance cannot repeat an order status event',async()=>{
  const f=fixture()
  assert.equal((await f.write('merchant','accepted')).status,200)
  assert.equal((await f.write('merchant','accepted')).status,409)
  assert.equal(f.events.length,1)
  assert.equal((await f.read('customer-a')).body.order.fulfillmentStatus,'accepted')
})

test('cancellation reason is preserved for owning customer and not for another customer',async()=>{
  const f=fixture({status:'preparing'})
  assert.equal((await f.write('merchant','cancelled')).status,400)
  const r=await f.write('merchant','cancelled','Out of stock')
  assert.equal(r.status,200)
  const own=await f.read('customer-a')
  assert.equal(own.body.order.fulfillmentStatus,'cancelled')
  assert.equal(own.body.order.issueReason,'Out of stock')
  assert.equal((await f.read('customer-b')).status,404)
  assert.deepEqual(f.events.map(e=>e.to),['cancelled'])
})

test('merchant cannot mark an order delivered without verified-proof completion endpoint',async()=>{
  const f=fixture({status:'delivering'})
  const r=await f.write('merchant','delivered')
  assert.equal(r.status,409)
  assert.equal(r.body.error,'use_verified_proof_completion_endpoint')
  assert.equal((await f.read('customer-a')).body.order.fulfillmentStatus,'delivering')
  assert.equal(f.events.length,0)
})

test('customer cannot call merchant status writes',async()=>{
  const f=fixture()
  const r=await f.write('customer-a','accepted')
  assert.equal(r.status,403)
  assert.equal(f.order.fulfillment_status,'new')
  assert.equal(f.events.length,0)
})
