// Phase48 offline code-contract regression checks. No network or database access.
// These guard known Phase37b/38 implementation invariants; they are NOT live R2 tests.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const code = readFileSync(new URL('../src/orderWorkflow.mjs', import.meta.url), 'utf8')
const extract = (start, end) => {
  const a = code.indexOf(start)
  const b = code.indexOf(end, a + start.length)
  assert.ok(a >= 0 && b > a, 'expected implementation block was not found')
  return code.slice(a, b)
}
const upload = extract('// PHASE37B_PROOF:', '// PHASE38_PROOF_READ:')
const reading = extract('// PHASE38_PROOF_READ:', 'if (!list && !item && !action')

test('upload and complete endpoints require authenticated merchant membership', () => {
  assert.match(upload, /authenticate\(pool,req\)/)
  assert.match(upload, /permittedStore\(pool,subject,m\[1\]\)/)
  assert.match(upload, /\['owner','manager'\]\.includes\(store\.role\)/)
  assert.match(upload, /WHERE store_id=\$1 AND id=\$2/)
})
test('upload request requires delivering state and allowed image size/type', () => {
  assert.match(upload, /fulfillment_status!=='delivering'/)
  assert.match(upload, /'image\/jpeg':'jpg'/)
  assert.match(upload, /'image\/png':'png'/)
  assert.match(upload, /'image\/webp':'webp'/)
  assert.match(upload, /sizeBytes>5\*1024\*1024/)
})
test('R2 upload key is scoped to store/order with randomized name', () => {
  assert.match(upload, /'delivery-proofs\/'\+store\.id\+'\/'\+m\[2\]\+'\/'\+randomUUID\(\)/)
  assert.match(upload, /PutObjectCommand\(/)
  assert.match(upload, /expiresIn:300/)
})
test('delivery completion requires payment, scoped key, actual R2 object and trusted metadata', () => {
  assert.match(upload, /payment_status!=='paid'/)
  assert.match(upload, /new RegExp\('\^delivery-proofs\/'\+store\.id\+'\/'\+m\[2\]/)
  assert.match(upload, /HeadObjectCommand\(/)
  assert.match(upload, /ContentLength/)
  assert.match(upload, /ContentType/)
  assert.match(upload, /proof_not_uploaded/)
  assert.match(upload, /payment_status='paid' RETURNING id/)
  assert.match(upload, /ROLLBACK/)
})
test('proof read requires auth and binds the customer or merchant to the order', () => {
  assert.match(reading, /authenticate\(pool,req\)/)
  assert.match(reading, /permittedStore\(pool,who,m\[1\]\)/)
  assert.match(reading, /customer_subject=\$3/)
  assert.match(reading, /fulfillment_status=\$4/)
})
test('proof read uses a short-lived GET presigned URL rather than a public object URL', () => {
  assert.match(reading, /GetObjectCommand\(/)
  assert.match(reading, /getSignedUrl\(/)
  assert.match(reading, /expiresIn:180/)
  assert.match(reading, /proof_not_found/)
})
