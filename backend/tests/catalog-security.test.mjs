import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { catalogRoute } from '../src/catalog.mjs'

const storeId = '11111111-1111-4111-8111-111111111111'
const productId = '22222222-2222-4222-8222-222222222222'
const slug = 'store-one'
const token = 't'.repeat(43)
const tokenHash = createHash('sha256').update(token).digest('hex')
function setup({ loggedIn = true, allowed = true, role = 'owner', products = [] } = {}) {
  const queries = []
  const pool = { async query(sql, params = []) {
    queries.push({ sql, params })
    if (sql.includes('FROM auth_sessions')) {
      assert.equal(params[0], tokenHash)
      return { rows: loggedIn ? [{ external_subject: 'merchant-a' }] : [] }
    }
    if (sql.includes('FROM merchant_members') && sql.includes('s.slug = $2')) {
      assert.deepEqual(params, ['merchant-a', slug])
      return { rows: allowed ? [{ id: storeId, slug, role }] : [] }
    }
    if (sql.includes('FROM products WHERE store_id=$1') && sql.includes('LIMIT 500')) {
      assert.equal(params[0], storeId)
      return { rows: products }
    }
    if (sql.startsWith('UPDATE products SET active=false')) {
      assert.deepEqual(params, [storeId, productId])
      return { rowCount: 1 }
    }
    throw Error('Unexpected SQL: ' + sql)
  } }
  return {pool, queries}
}
async function invoke({method = 'GET', path = `/v1/merchant/stores/${slug}/products`, body, ...config} = {}) {
  const {pool, queries} = setup(config)
  const req = { method, headers: { authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)) } }
  let status, response
  const res = {writeHead(code){status = code},end(raw){response=JSON.parse(raw)}}
  const handled = await catalogRoute(req,res,new URL(path, 'http://localhost'),pool)
  return {handled,status,response,queries}
}

test('Unauthenticated merchant cannot list products', async () => {
  const r = await invoke({loggedIn:false})
  assert.equal(r.status,401)
  assert.equal(r.response.error,'unauthorized')
  assert.equal(r.queries.filter(x=>x.sql.includes('FROM products')).length,0)
})
test('Merchant cannot read a store without membership', async () => {
  const r = await invoke({allowed:false})
  assert.equal(r.status,403)
  assert.equal(r.response.error,'forbidden')
})
test('Read-only store member cannot access merchant product management', async () => {
  const r=await invoke({role:'viewer'})
  assert.equal(r.status,403)
  assert.equal(r.response.error,'insufficient_role')
})
test('Merchant product query always scopes by permitted store id', async () => {
  const r=await invoke({products:[{id:productId,name:'Test product'}]})
  assert.equal(r.status,200)
  assert.equal(r.response.items[0].id,productId)
  assert.ok(r.queries.some(x=>x.sql.includes('FROM products WHERE store_id=$1') && x.params[0]===storeId))
})
test('Soft delete targets product within permitted store only', async () => {
  const r=await invoke({method:'DELETE',path:`/v1/merchant/stores/${slug}/products/${productId}`})
  assert.equal(r.status,200)
  assert.ok(r.queries.some(x=>x.sql.startsWith('UPDATE products SET active=false') && x.params[0]===storeId && x.params[1]===productId))
})
test('Invalid product price is rejected without writing product data',async()=>{
  const r=await invoke({method:'POST',body:{name:'Test',priceCents:-1,active:true,soldOut:false,categoryId:null,imageObjectKey:null}})
  assert.equal(r.status,400)
  assert.equal(r.response.error,'invalid_product')
  assert.equal(r.queries.filter(x=>/^INSERT INTO products/.test(x.sql)).length,0)
})
test('Discount may not equal or exceed regular price',async()=>{
  const r=await invoke({method:'POST',body:{name:'Test',priceCents:100,active:true,soldOut:false,categoryId:null,imageObjectKey:null,discountPriceCents:100}})
  assert.equal(r.status,400)
  assert.equal(r.response.error,'invalid_discount_price')
})
test('Reject product image key belonging to another store',async()=>{
  const r=await invoke({method:'POST',body:{name:'Test',priceCents:100,active:true,soldOut:false,categoryId:null,imageObjectKey:'stores/other-store/products/a.jpg'}})
  assert.equal(r.status,400)
  assert.equal(r.response.error,'invalid_product')
})
