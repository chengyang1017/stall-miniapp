// Phase 33 batch 4. Exercise the actual checkout route against an isolated SQL fake.
// No PostgreSQL, HTTP server, workers, network, storage, or payment gateway.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/checkout.mjs', import.meta.url), 'utf8')
const stripped = source.replace(/^import .*$/gm, '')
assert.match(source, /export async function checkoutRoute/)
const injections = `
const createHash = (await import('node:crypto')).createHash;
const authenticate = async (_pool, req) => req.subject || null;
const verifyDelivery = async () => ({area:{name:'Local'},snapshot:{id:'slot',date:'2026-12-01'},minimumOrderCents:0});
const publishedSql = () => 'p.active';
const sweepInventory = async () => {};
const recordMovement = async () => {};
const HOLD_MINUTES = 15;
const stockError = message => Object.assign(Error(message),{inventoryError:true});
`
const {checkoutRoute} = await import('data:text/javascript;base64,' + Buffer.from(injections + stripped).toString('base64'))

const STORE = '22222222-2222-4222-8222-222222222222'
const ITEM = '11111111-1111-4111-8111-111111111111'
const ORDER = '33333333-3333-4333-8333-333333333333'
const url = new URL('http://localhost/v1/stores/demo-store/orders')
const payload = (quantity = 2) => ({items:[{productId:ITEM,quantity,priceCents:1}],totalCents:1,
  address:{receiverName:'Alice',phone:'13800138000',areaId:'zone',detail:'Unit 1'},
  slot:{id:'slot',date:'2026-12-01'},note:''})
function request(data,key='TESTKEY_12345678901234567890',subject='customer-a') {
  const raw=JSON.stringify(data)
  return {method:'POST',subject,headers:{'content-length':String(Buffer.byteLength(raw)),'idempotency-key':key},
    async *[Symbol.asyncIterator](){yield Buffer.from(raw)}}
}
function response(){return {code:0,body:null,writeHead(c){this.code=c},end(raw){this.body=JSON.parse(raw)}}}
function dbFixture({active=true,soldOut=false,price=1300,discount=null,discountStart=null,discountEnd=null,stockMode='unlimited',stock=10}={}){
  const product={id:ITEM,store_id:STORE,name:'Rice',price_cents:price,discount_price_cents:discount,
    discount_start:discountStart,discount_end:discountEnd,active,sold_out:soldOut,stock_mode:stockMode,stock_quantity:stock}
  const orders=new Map(),lines=[],sqlLog=[],reservation=[]
  const client={async query(sql,args=[]){
    const s=String(sql);sqlLog.push({sql:s,args})
    if(s.includes('SELECT id FROM stores WHERE slug='))return {rows:[{id:STORE}]}
    if(s.includes('SELECT id,total_cents,checkout_fingerprint,payment_status')){
      const record=orders.get(args[2]);return {rows:record?[record]:[]}
    }
    if(s.includes('FROM products p WHERE p.store_id'))return {rows:[{...product}]}
    if(s.includes('INSERT INTO orders(')){
      const record={id:ORDER,total_cents:args[2],checkout_fingerprint:args[4],payment_status:'unpaid',fulfillment_status:'new',inventory_state:'none',inventory_expires_at:null}
      orders.set(args[3],record);return {rows:[{id:ORDER}]}
    }
    if(s.includes('INSERT INTO order_items(')){lines.push({productId:args[1],priceCents:args[3],quantity:args[4]});return {rows:[]}}
    if(s.includes("UPDATE orders SET inventory_state='held'")){return {rows:[{inventory_expires_at:'2026-12-01T00:15:00.000Z'}]}}
    if(s.includes('UPDATE products SET stock_quantity=stock_quantity-')){
      if(product.stock_quantity<args[2])return {rows:[]}
      product.stock_quantity-=args[2];return {rows:[{id:ITEM}]}
    }
    if(s.includes('INSERT INTO inventory_reservations(')){reservation.push(args);return {rows:[]}}
    return {rows:[]}
  },release(){sqlLog.push({sql:'RELEASE',args:[]})}}
  return {product,orders,lines,sqlLog,reservation,async connect(){return client}}
}
async function checkout(db,data=payload(),key){const res=response();assert.equal(await checkoutRoute(request(data,key),res,url,db),true);return res}

test('checkout recalculates price from merchant-owned product row, ignoring customer totals',async()=>{
  const db=dbFixture({price:1300}),res=await checkout(db)
  assert.equal(res.code,201);assert.equal(res.body.totalCents,2600)
  assert.equal(res.body.paymentStatus,'unpaid');assert.deepEqual(db.lines,[{productId:ITEM,priceCents:1300,quantity:2}])
})
test('merchant price/discount changes are applied to NEW checkouts and stored as line snapshots',async()=>{
  const db=dbFixture({price:1500}),first=await checkout(db,payload(1),'TESTKEY_12345678901234567891')
  assert.equal(first.body.totalCents,1500)
  db.product.price_cents=1800;db.product.discount_price_cents=900
  const second=await checkout(db,payload(1),'TESTKEY_12345678901234567892')
  assert.equal(second.body.totalCents,900)
  assert.deepEqual(db.lines.map(x=>x.priceCents),[1500,900])
})
test('expired discount is ignored and regular price is used',async()=>{
  const db=dbFixture({price:1400,discount:800,discountEnd:'2000-01-01T00:00:00.000Z'})
  const res=await checkout(db,payload(1));assert.equal(res.code,201);assert.equal(res.body.totalCents,1400)
})
for(const [name,options] of [['inactive',{active:false}],['sold-out',{soldOut:true}]]){
  test(`${name} product cannot be ordered even if still in a customer cart`,async()=>{
    const db=dbFixture(options),res=await checkout(db)
    assert.equal(res.code,409);assert.equal(res.body.error,'product_unavailable')
    assert.equal(db.lines.length,0);assert.equal(db.orders.size,0)
  })
}
test('insufficient finite stock rejects checkout before creating any order',async()=>{
  const db=dbFixture({stockMode:'finite',stock:1}),res=await checkout(db)
  assert.equal(res.code,409);assert.equal(res.body.error,'insufficient_stock')
  assert.equal(db.orders.size,0);assert.equal(db.product.stock_quantity,1)
})
test('successful finite-stock checkout reserves inventory and does not mark payment paid',async()=>{
  const db=dbFixture({stockMode:'finite',stock:5}),res=await checkout(db)
  assert.equal(res.code,201);assert.equal(res.body.inventoryState,'held');assert.equal(res.body.paymentStatus,'unpaid')
  assert.equal(db.product.stock_quantity,3);assert.equal(db.reservation.length,1)
})
test('retry reuses original order and never decrements stock twice; conflicting payload is rejected',async()=>{
  const db=dbFixture({stockMode:'finite',stock:5}),key='TESTKEY_12345678901234567893'
  const a=await checkout(db,payload(2),key),b=await checkout(db,payload(2),key)
  assert.equal(a.code,201);assert.equal(b.code,200);assert.equal(b.body.replayed,true)
  assert.equal(a.body.orderId,b.body.orderId);assert.equal(db.product.stock_quantity,3)
  assert.equal(db.reservation.length,1)
  const c=await checkout(db,payload(1),key)
  assert.equal(c.code,409);assert.equal(c.body.error,'idempotency_key_reused')
  assert.equal(db.product.stock_quantity,3)
})
