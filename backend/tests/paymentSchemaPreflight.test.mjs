import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectPaymentSchema} from '../scripts/payment-schema-preflight.mjs'
const expected={
 orders:['id','store_id','total_cents','currency','payment_status','fulfillment_status','inventory_state','inventory_expires_at','created_at'],
 payment_events:['order_id','provider','provider_event_id','event_type','amount_cents'],
 inventory_reservations:['store_id','order_id','product_id','quantity','state'],
 products:['id','store_id','stock_mode','stock_quantity'],
 inventory_movements:['store_id','product_id','order_id','source','operation_key']
}
const rows=Object.entries(expected).flatMap(([table_name,cols])=>cols.map(column_name=>({table_name,column_name})))
test('existing payment schema is accepted with unique provider event identity',async()=>{
 const db={query:async sql=>({rows:sql.includes('information_schema')?rows:[{protected:true}]})}
 assert.deepEqual(await inspectPaymentSchema(db),{ok:true,missing:[],providerEventUnique:true})
})
test('missing column prevents payment readiness',async()=>{
 const db={query:async sql=>({rows:sql.includes('information_schema')?rows.slice(1):[{protected:true}]})}
 const r=await inspectPaymentSchema(db);assert.equal(r.ok,false);assert.deepEqual(r.missing,['orders.id'])
})
test('missing unique transaction constraint prevents payment readiness',async()=>{
 const db={query:async sql=>({rows:sql.includes('information_schema')?rows:[{protected:false}]})}
 const r=await inspectPaymentSchema(db);assert.equal(r.ok,false);assert.equal(r.providerEventUnique,false)
})
