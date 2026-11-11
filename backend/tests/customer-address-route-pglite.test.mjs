import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {sandboxDatabase} from './helpers/sandbox-pglite.mjs'
import {createSession} from '../src/auth.mjs'
import {customerAddressRoute} from '../src/customerAddresses.mjs'

const url=new URL('https://example.invalid/v1/stores/stall-test/addresses')
function response(){
 const out={status:null,body:null}
 return {out,res:{writeHead(status){out.status=status},end(body){out.body=JSON.parse(body)}}}
}
function post(token,payload){
 return {method:'POST',headers:{authorization:'Bearer '+token},
  async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(payload))}}
}

test('a fully authenticated mapped cloud address can be inserted, listed and safely replayed',async()=>{
 const db=await sandboxDatabase()
 try{
  await db.migrate(16)
  const {rows:[merchant]}=await db.pool.query("INSERT INTO merchants(display_name) VALUES('Synthetic merchant') RETURNING id")
  const {rows:[store]}=await db.pool.query("INSERT INTO stores(merchant_id,slug,name,is_active) VALUES($1,'stall-test','Synthetic store',true) RETURNING id",[merchant.id])
  await db.pool.query('INSERT INTO store_delivery_rules(store_id,configuration) VALUES($1,$2::jsonb)',[store.id,JSON.stringify({areas:[{id:'area_test',name:'测试区域',enabled:true}],slots:[],days:[]})])
  const {token}=await createSession(db.pool,'wx:synthetic:verified')
  const key=randomUUID()
  const payload={receiverName:'Synthetic receiver',phone:'13800138000',deliveryAreaId:'area_test',detail:'楼栋单元门牌号',
    latitude:23.13,longitude:113.27,locationName:'Synthetic map place',mapAddress:'测试区域某路',clientKey:key}
  let {out,res}=response()
  await customerAddressRoute(post(token,payload),res,url,db.pool)
  assert.equal(out.status,200,JSON.stringify(out.body))
  assert.equal(out.body.ok,true)
  const check=await db.pool.query('SELECT area_id,latitude,longitude,version FROM customer_addresses WHERE store_id=$1',[store.id])
  assert.equal(check.rows.length,1)
  assert.equal(check.rows[0].area_id,'area_test')
  assert.equal(check.rows[0].latitude,23.13)
  // Reusing identical POST payload should never duplicate an address.
  ;({out,res}=response())
  await customerAddressRoute(post(token,payload),res,url,db.pool)
  assert.equal(out.status,200,JSON.stringify(out.body))
  assert.equal(out.body.reused,true)
  const n=await db.pool.query('SELECT count(*)::int AS count FROM customer_addresses WHERE store_id=$1',[store.id])
  assert.equal(n.rows[0].count,1)
 }finally{await db.pg.close()}
})
