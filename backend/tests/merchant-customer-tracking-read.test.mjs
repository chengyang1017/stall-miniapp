import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source=readFileSync(new URL('../src/deliveryTracking.mjs',import.meta.url),'utf8')
const authImport=/^import \{ authenticate,permittedStore \} from '\.\/auth\.mjs'\s*$/m
assert.match(source,authImport)
const code=source.replace(authImport,`
const authenticate = async (_pool,req) => req.testSubject || null
const permittedStore = async (_pool,subject,slug) => subject === 'merchant' && slug === 'demo-store' ? {id:'store-one',role:'owner'} : null
`)
const {deliveryTrackingRoute}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))
const ORDER='11111111-1111-4111-8111-111111111111'
const SESSION='22222222-2222-4222-8222-222222222222'
const now=Date.parse('2026-10-25T10:00:00Z')
function fixture({age=7000,status='delivering',sessionState='active'}={}){
 const queries=[]
 const db={queries,async query(sql,args=[]){
  const s=String(sql);queries.push({sql:s,args})
  if(s.includes('FROM orders o JOIN stores s')){
   const customerClause=s.includes('o.customer_subject=$3')
   const allow=args[0]==='demo-store'&&args[1]===ORDER&&(!customerClause||args[2]==='alice')
   return {rows:allow?[{id:ORDER,store_id:'store-one',fulfillment_status:status,estimated_arrival:'10:30',contact_snapshot:{latitude:1.85,longitude:102.93},server_ms:now}]:[]}
  }
  if(s.includes('FROM delivery_tracking_tasks WHERE'))return {rows:[{courier_subject:'courier',version:1}]}
  if(s.includes('FROM delivery_tracking_sessions WHERE'))return {rows:[{id:SESSION,order_id:ORDER,courier_subject:'courier',state:sessionState,started_at:new Date(now-3600000).toISOString(),last_location_at:new Date(now-age).toISOString(),sampled_at:new Date(now-age).toISOString(),latitude:1.86,longitude:102.94,accuracy:12,seq:9}]}
  if(s.includes('FROM stores s JOIN merchant_members mm'))return {rows:[{one:1}]}
  if(/^(BEGIN|COMMIT|ROLLBACK)/.test(s))return {rows:[]}
  throw Error('Unexpected mock query: '+s.slice(0,140))
 },async connect(){return {query:(...args)=>db.query(...args),release(){}}}}
 return db
}
async function invoke(db,subject,method='GET',path=`/v1/stores/demo-store/orders/${ORDER}/tracking`){
 const req={testSubject:subject,method,headers:{}}
 const res={status:null,body:null,writeHead(n){this.status=n},end(s){this.body=JSON.parse(s)}}
 assert.equal(await deliveryTrackingRoute(req,res,new URL('http://localhost'+path),db),true)
 return res
}

test('only owning customer receives a fresh courier position and this order destination',async()=>{
 const db=fixture()
 const own=await invoke(db,'alice')
 assert.equal(own.status,200)
 assert.equal(own.body.state,'active')
 assert.deepEqual([own.body.location.latitude,own.body.location.longitude],[1.86,102.94])
 assert.deepEqual([own.body.destination.latitude,own.body.destination.longitude],[1.85,102.93])
 assert.equal(own.body.estimatedArrival,'10:30')
 const stranger=await invoke(db,'bob')
 assert.equal(stranger.status,404)
 assert.equal(stranger.body.location,undefined)
})

test('expired, paused and completed deliveries never expose courier coordinates',async()=>{
 for(const scenario of [{age:120001,expected:'stale'},{sessionState:'paused',expected:'paused'},{status:'delivered',expected:'ended'}]){
  const r=await invoke(fixture(scenario),'alice')
  assert.equal(r.status,200)
  assert.equal(r.body.state,scenario.expected)
  assert.equal(r.body.location,null)
 }
})

test('customer tracking API refuses location writes',async()=>{
 const db=fixture()
 const r=await invoke(db,'alice','POST',`/v1/stores/demo-store/orders/${ORDER}/tracking/location`)
 assert.equal(r.status,405)
 assert.equal(db.queries.length,0)
})
