// Phase49: isolated behavior tests for existing R2 delivery-proof endpoint.
// Mocked PostgreSQL and R2: no network, credentials, or production changes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/orderWorkflow.mjs', import.meta.url), 'utf8')
const begin = source.indexOf('  // PHASE37B_PROOF: authorized order-scoped photo upload and completion.')
const end = source.indexOf('  if (!list && !item && !action', begin)
assert.ok(begin !== -1 && end > begin, 'Phase37b route block not found')
const block = source.slice(begin, end)
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
const compiled = new AsyncFunction('req','res','url','pool','authenticate','permittedStore','readJson','S3Client','PutObjectCommand','HeadObjectCommand','getSignedUrl','randomUUID','slugRe','uuidRe','reply','process',block+'\nreturn false')
const ORDER='11111111-1111-4111-8111-111111111111'
const STORE='22222222-2222-4222-8222-222222222222'
const ID='33333333-3333-4333-8333-333333333333'
const KEY=`delivery-proofs/${STORE}/${ORDER}/${ID}.jpg`
function setup({subject='merchant',store={id:STORE,role:'owner'},status='delivering',payment='paid',head={ContentLength:400,ContentType:'image/jpeg'},mutationRows=[{id:ORDER}]}={}){
  const logs=[];let actualResult
  const pool={
    async query(sql){logs.push('query:'+sql.slice(0,35));return {rows:[{id:ORDER,fulfillment_status:status,payment_status:payment}]}},
    async connect(){logs.push('connect');return {async query(sql){logs.push(sql);return /^UPDATE orders/.test(sql)?{rows:mutationRows}:{rows:[]}},release(){logs.push('release')}}}
  }
  const res={writeHead(code){this.status=code},end(body){actualResult=JSON.parse(body)}}
  const services={
    authenticate:async()=>subject, permittedStore:async()=>store, readJson:async req=>req.payload,
    S3Client:class {async send(){logs.push('head'); if(head instanceof Error)throw head;return head}},
    PutObjectCommand:class {}, HeadObjectCommand:class {},getSignedUrl:async()=> 'https://example.invalid/signed',
    randomUUID:()=>ID,slugRe:'[a-z0-9][a-z0-9-]{1,62}',uuidRe:'[0-9a-f-]{36}',
    reply:(r,code,body)=>{r.writeHead(code);r.end(JSON.stringify(body))}
  }
  async function call(operation,payload={proofKey:KEY}){
    const req={method:'POST',payload};const url=new URL(`https://example.invalid/v1/merchant/stores/sample-shop/orders/${ORDER}/${operation}`)
    await compiled(req,res,url,pool,...Object.values(services),{env:{S3_BUCKET:'test',S3_ENDPOINT:'https://example.invalid',S3_ACCESS_KEY_ID:'dummy',S3_SECRET_ACCESS_KEY:'dummy'}})
    return {code:res.status,body:actualResult,logs}
  }
  return {call,logs}
}
test('anonymous upload is denied before R2 or order lookup',async()=>{
  const r=await setup({subject:null}).call('proof-upload',{contentType:'image/jpeg',sizeBytes:400})
  assert.equal(r.code,401);assert.deepEqual(r.logs,[])
})
test('merchant without store membership cannot upload',async()=>{
  const r=await setup({store:null}).call('proof-upload',{contentType:'image/jpeg',sizeBytes:400})
  assert.equal(r.code,403);assert.deepEqual(r.logs,[])
})
test('only delivering orders may request signed upload',async()=>{
  const r=await setup({status:'preparing'}).call('proof-upload',{contentType:'image/jpeg',sizeBytes:400})
  assert.equal(r.code,409);assert.equal(r.body.error,'not_delivering');assert.ok(!r.logs.includes('head'))
})
test('unpaid order cannot complete even with a proof key',async()=>{
  const r=await setup({payment:'unpaid'}).call('complete')
  assert.equal(r.code,409);assert.equal(r.body.error,'payment_not_confirmed');assert.ok(!r.logs.includes('connect'))
})
test('proof key from another store is rejected',async()=>{
  const r=await setup().call('complete',{proofKey:'delivery-proofs/other/'+ORDER+'/'+ID+'.jpg'})
  assert.equal(r.code,400);assert.equal(r.body.error,'invalid_proof_key');assert.ok(!r.logs.includes('connect'))
})
test('missing R2 object must not update order',async()=>{
  const err=new Error('not found');err.name='NotFound'
  const r=await setup({head:err}).call('complete')
  assert.equal(r.code,400);assert.equal(r.body.error,'proof_not_uploaded');assert.ok(!r.logs.includes('connect'))
})
test('valid R2 proof completes inside a transaction',async()=>{
  const r=await setup().call('complete')
  assert.equal(r.code,200);assert.equal(r.body.status,'delivered')
  assert.ok(r.logs.includes('BEGIN'));assert.ok(r.logs.includes('COMMIT'))
  assert.ok(r.logs.some(x=>x.startsWith('INSERT INTO order_status_events')))
})
test('concurrent order state change rolls back',async()=>{
  const r=await setup({mutationRows:[]}).call('complete')
  assert.equal(r.code,409);assert.equal(r.body.error,'order_state_changed')
  assert.ok(r.logs.includes('ROLLBACK'));assert.ok(!r.logs.includes('COMMIT'))
})
