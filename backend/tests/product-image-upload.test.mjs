import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Route-level unit tests: auth and S3 are replaced in memory. No network/DB/R2 access.
const source = await readFile(new URL('../src/catalog.mjs', import.meta.url), 'utf8')
const mocked = source
  .replace("import { authenticate, permittedStore } from './auth.mjs'", 'const { authenticate, permittedStore } = globalThis.__phase54.auth')
  .replace("import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'", 'const { S3Client, PutObjectCommand, HeadObjectCommand } = globalThis.__phase54.s3')
  .replace("import { getSignedUrl } from '@aws-sdk/s3-request-presigner'", 'const { getSignedUrl } = globalThis.__phase54.s3')
assert.notEqual(mocked, source, 'mock seams must match catalog imports')
assert.ok(!mocked.includes("from '@aws-sdk/"), 'AWS imports must be mocked')
const originalEnv = Object.fromEntries(['S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'].map(k => [k, process.env[k]]))
for (const k of Object.keys(originalEnv)) process.env[k] = 'phase54-mock'
const previous = globalThis.__phase54
let subject = 'merchant-A', store = { id: 'a0000000-0000-4000-8000-000000000001', role: 'owner' }, signedCalls = []
globalThis.__phase54 = {
  auth: { authenticate: async () => subject, permittedStore: async (_pool, _subject, slug) => slug === 'shop-a' ? store : null },
  s3: {
    S3Client: class {},
    PutObjectCommand: class { constructor(input) { this.input = input } },
    HeadObjectCommand: class { constructor(input) { this.input = input } },
    getSignedUrl: async (_client, cmd, options) => { signedCalls.push({ cmd, options }); return 'https://r2.example.invalid/upload' }
  }
}
const { catalogRoute } = await import('data:text/javascript;base64,' + Buffer.from(mocked).toString('base64'))
function makeRequest(method, payload, pathname='/v1/merchant/stores/shop-a/image-uploads') {
  const body = JSON.stringify(payload ?? {})
  const req = { method, headers: { authorization: 'Bearer test', 'content-length': String(Buffer.byteLength(body)) }, async *[Symbol.asyncIterator]() { yield Buffer.from(body) } }
  let code = 0, data
  const res = { writeHead(status) { code=status }, end(raw) { data=JSON.parse(raw) } }
  return catalogRoute(req, res, new URL('http://localhost'+pathname), {query: async () => {throw Error('unexpected DB')}}).then(handled => ({handled, code, data}))
}
const good = { contentType: 'image/png', sizeBytes: 1024 }
after(() => {
  for (const [k,v] of Object.entries(originalEnv)) {if(v===undefined) delete process.env[k];else process.env[k]=v}
  globalThis.__phase54=previous
})
test('anonymous users cannot request signed product upload', async () => {
    subject = null
    const r = await makeRequest('POST',good)
    assert.equal(r.code,401)
    subject = 'merchant-A'
  })
  test('merchant cannot issue upload URL for another store', async () => {
    const r = await makeRequest('POST',good,'/v1/merchant/stores/shop-b/image-uploads')
    assert.equal(r.code,403)
  })
  test('read-only merchant roles cannot issue product uploads', async () => {
    store = {...store,role:'viewer'}
    const r = await makeRequest('POST',good)
    assert.equal(r.code,403)
    store = {...store,role:'owner'}
  })
  test('invalid image content type is rejected', async () => {
    const r = await makeRequest('POST',{contentType:'image/svg+xml',sizeBytes:100})
    assert.equal(r.code,400)
    assert.equal(r.data.error,'invalid_image')
  })
  test('zero, fractional and oversized files are rejected', async () => {
    for (const sizeBytes of [0,1.5,5*1024*1024+1]) {
      const r = await makeRequest('POST',{contentType:'image/jpeg',sizeBytes})
      assert.equal(r.code,400)
    }
  })
  test('successful uploads bind key to store and short-lived signature', async () => {
    signedCalls = []
    const r = await makeRequest('POST',good)
    assert.equal(r.code,200)
    assert.match(r.data.key,/^stores\/a0000000-0000-4000-8000-000000000001\/products\/[0-9a-f-]{36}\.png$/)
    assert.equal(r.data.expiresIn,300)
    assert.equal(r.data.maxBytes,5*1024*1024)
    assert.equal(signedCalls.length,1)
    assert.equal(signedCalls[0].cmd.input.Key,r.data.key)
    assert.equal(signedCalls[0].cmd.input.ContentType,'image/png')
    assert.equal(signedCalls[0].options.expiresIn,300)
  })
