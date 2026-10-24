import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Unit-level route tests; no network, R2, or database access.
const source = await readFile(new URL('../src/catalog.mjs', import.meta.url), 'utf8')
const authImport = "import { authenticate, permittedStore } from './auth.mjs'"
const s3Import = "import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'"
const signImport = "import { getSignedUrl } from '@aws-sdk/s3-request-presigner'"
for (const marker of [authImport, s3Import, signImport]) assert.ok(source.includes(marker), 'expected dependency seam missing')
const mocked = source.replace(authImport, 'const { authenticate, permittedStore } = globalThis.__phase55.auth')
 .replace(s3Import, 'const { S3Client, PutObjectCommand, HeadObjectCommand } = globalThis.__phase55.s3')
 .replace(signImport, 'const { getSignedUrl } = globalThis.__phase55.sign')
const previous = globalThis.__phase55
const state = { subject: 'merchant-1', role: 'owner', calls: [] }
globalThis.__phase55 = {
 auth: { authenticate: async () => state.subject, permittedStore: async (_p, _s, slug) => slug === 'shop-a' ? { id:'00000000-0000-4000-8000-000000000001', role:state.role } : null },
 s3: { S3Client:class {}, PutObjectCommand:class {}, HeadObjectCommand:class {} },
 sign: { getSignedUrl:async () => 'https://example.invalid/signed' }
}
const { catalogRoute } = await import('data:text/javascript;base64,' + Buffer.from(mocked).toString('base64'))
function request(payload,method='POST') {
 const raw = JSON.stringify(payload)
 const req={ method, headers: { 'content-length':String(Buffer.byteLength(raw)) }, async *[Symbol.asyncIterator]() { yield Buffer.from(raw) } }
 let status=0, data
 const res={writeHead(s){status=s},end(body){data=JSON.parse(body)}}
 const pool={async query(sql,args){ state.calls.push({sql,args}); return {rows:[{id:'product-1'}],rowCount:1} }}
 return catalogRoute(req,res,new URL('https://example.invalid/v1/merchant/stores/shop-a/products'),pool).then(()=>({status,data}))
}
const base={name:'Product',priceCents:1000,categoryId:null,active:true,soldOut:false,imageObjectKey:null}
test.after(()=>{globalThis.__phase55=previous})
test('discount equal to original price rejected',async()=>{
 state.calls=[];const r=await request({...base,discountPriceCents:1000});assert.equal(r.status,400);assert.equal(r.data.error,'invalid_discount_price');assert.equal(state.calls.length,0)
})
test('discount above original price rejected',async()=>{
 state.calls=[];const r=await request({...base,discountPriceCents:1100});assert.equal(r.status,400);assert.equal(state.calls.length,0)
})
test('negative or fractional discounts rejected',async()=>{
 for(const price of [-1,5.5]){state.calls=[];const r=await request({...base,discountPriceCents:price});assert.equal(r.status,400);assert.equal(state.calls.length,0)}
})
test('start date after end date rejected',async()=>{
 state.calls=[];const r=await request({...base,discountPriceCents:500,discountStart:'2026-11-02T00:00:00Z',discountEnd:'2026-11-01T00:00:00Z'});assert.equal(r.status,400);assert.equal(state.calls.length,0)
})
test('valid lower price and time window passed to database',async()=>{
 state.calls=[];const r=await request({...base,discountPriceCents:550,discountStart:'2026-11-01T00:00:00Z',discountEnd:'2026-11-02T00:00:00Z'});assert.equal(r.status,201);assert.equal(state.calls.length,1);assert.match(state.calls[0].sql,/INSERT INTO products/);assert.ok(state.calls[0].args.includes(550))
})
test('no client-side price can override original product price',async()=>{
 state.calls=[];const r=await request({...base,priceCents:1000,discountPriceCents:500, effectivePriceCents:1});assert.equal(r.status,201);assert.equal(state.calls.length,1);assert.equal(state.calls[0].args[3],1000);assert.ok(!state.calls[0].args.includes(1))
})
