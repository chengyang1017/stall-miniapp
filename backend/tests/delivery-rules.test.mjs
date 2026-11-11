import test from 'node:test'
import assert from 'node:assert/strict'
import { validRules, verifyDelivery, businessView } from '../src/deliveryRules.mjs'

const serverNow=new Date('2026-10-28T04:00:00.000Z')
const buildRules = () => ({
  accepting: true,
  days: Array.from({length: 7}, () => ({enabled:true,start:'00:00',end:'23:59'})),
  areas: [{id:'zone1',name:'Local',enabled:true,latitude:null,longitude:null,radiusMeters:null}],
  slots: [{id:'slot1',label:'Daytime',enabled:true,start:'00:00',end:'23:59'}]
})
function tomorrow() {
  const shifted = new Date(serverNow.getTime() + 8 * 3600000 + 86400000)
  return shifted.toISOString().slice(0,10)
}
const address = () => ({areaId:'zone1'})
const slot = () => ({id:'slot1',date:tomorrow()})
function mock(rules, exists=true) {
  const queries=[]
  return {queries, client:{ async query(sql,params){queries.push({sql,params});if(sql==='SELECT clock_timestamp() AS now')return {rows:[{now:new Date(serverNow)}]};assert.equal(sql,'SELECT configuration FROM store_delivery_rules WHERE store_id=$1 FOR SHARE');return {rows: exists ? [{configuration:rules}] : []} } }}
}

const imageKey=i=>'stores/00000000-0000-0000-0000-000000000001/products/'+String(i).padStart(8,'0')+'-0000-0000-0000-000000000001.jpg'

test('banner settings accept ten ordered verified-key shapes and reject invalid lists',()=>{
 const a=buildRules()
 a.promoBannerImageKeys=Array.from({length:10},(_,i)=>imageKey(i))
 assert.equal(validRules(a),true)
 a.promoBannerImageKeys.push(imageKey(10))
 assert.equal(validRules(a),false)
 a.promoBannerImageKeys=[imageKey(1),imageKey(1)]
 assert.equal(validRules(a),false)
 a.promoBannerImageKeys=['https://example.com/foreign.jpg']
 assert.equal(validRules(a),false)
 a.promoBannerImageKeys=[]
 assert.equal(validRules(a),true)
})
test('legacy single banner is still shown until an explicit list replaces it',()=>{
 const a=buildRules();a.promoBannerImageKey=imageKey(1)
 const old=businessView(a,serverNow)
 assert.deepEqual(old.promoBannerImages.map(b=>b.key),[imageKey(1)])
 a.promoBannerImageKeys=[imageKey(2),imageKey(1)]
 const current=businessView(a,serverNow)
 assert.deepEqual(current.promoBannerImages.map(b=>b.key),[imageKey(2),imageKey(1)])
 assert.equal(current.promoBannerImageKey,imageKey(2))
 a.promoBannerImageKeys=[]
 assert.deepEqual(businessView(a,serverNow).promoBannerImages,[])
})

test('valid delivery configuration is accepted',()=>{
  assert.equal(validRules(buildRules()),true)
})
test('duplicate delivery area and slot IDs are rejected',()=>{
  const a=buildRules();a.areas.push({...a.areas[0]});assert.equal(validRules(a),false)
  const b=buildRules();b.slots.push({...b.slots[0]});assert.equal(validRules(b),false)
})
test('invalid day ranges and location radii are rejected',()=>{
  const a=buildRules();a.days[0].start='22:00';a.days[0].end='09:00';assert.equal(validRules(a),false)
  const b=buildRules();b.areas[0]={...b.areas[0],latitude:2,longitude:103,radiusMeters:1};assert.equal(validRules(b),false)
})
test('missing delivery rules prevent checkout',async()=>{
  const {client}=mock(null,false)
  assert.deepEqual(await verifyDelivery(client,'store1',address(),slot()),{error:'delivery_not_configured'})
})
test('paused stores reject deliveries',async()=>{
  const r=buildRules();r.accepting=false
  assert.deepEqual(await verifyDelivery(mock(r).client,'store1',address(),slot()),{error:'orders_paused'})
})
test('disabled delivery areas cannot be selected',async()=>{
  const r=buildRules();r.areas[0].enabled=false
  assert.deepEqual(await verifyDelivery(mock(r).client,'store1',address(),slot()),{error:'outside_delivery_area'})
})
test('invalid delivery date is rejected',async()=>{
  const r=buildRules()
  assert.deepEqual(await verifyDelivery(mock(r).client,'store1',address(),{id:'slot1',date:'2026-02-30'}),{error:'invalid_delivery_date'})
})
test('nonexistent or disabled delivery slots cannot be selected',async()=>{
  const r=buildRules()
  assert.deepEqual(await verifyDelivery(mock(r).client,'store1',address(),{id:'missing',date:tomorrow()}),{error:'delivery_slot_unavailable'})
  r.slots[0].enabled=false
  assert.deepEqual(await verifyDelivery(mock(r).client,'store1',address(),slot()),{error:'delivery_slot_unavailable'})
})
test('eligible delivery returns a server-owned slot snapshot',async()=>{
  const r=buildRules();const db=mock(r)
  const result=await verifyDelivery(db.client,'store1',address(),slot())
  assert.equal(result.error,undefined)
  assert.equal(result.snapshot.id,'slot1')
  assert.equal(result.snapshot.date,tomorrow())
  assert.equal(result.area.id,'zone1')
  assert.deepEqual(db.queries[0].params,['store1'])
  assert.ok(db.queries.some(q=>q.sql==='SELECT clock_timestamp() AS now'))
})

test('delivery fees are opt-in, bounded and returned from trusted rules',async()=>{
 const r=buildRules();r.deliveryFeeCents=350;r.deliveryFeeEnabled=false
 assert.equal(validRules(r),true)
 assert.equal((await verifyDelivery(mock(r).client,'store1',address(),slot())).deliveryFeeCents,0)
 r.deliveryFeeEnabled=true
 assert.equal((await verifyDelivery(mock(r).client,'store1',address(),slot())).deliveryFeeCents,350)
 r.deliveryFeeCents=100001
 assert.equal(validRules(r),false)
})
