// Temporary synthetic sessions for development-only authorization tests.
// No production identities or WeChat credentials are used.
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import pg from 'pg'

const db = process.env.DATABASE_URL || ''
const url = new URL(db)
const target = process.env.API_BASE_URL || 'http://127.0.0.1:8787'
if (process.env.CONFIRM_DEV_PERMISSIONS_TEST !== 'YES' ||
    !['127.0.0.1','localhost'].includes(url.hostname) || url.pathname !== '/stall_dev' ||
    !['127.0.0.1','localhost'].includes(new URL(target).hostname)) {
  throw new Error('Development only: require local stall_dev DATABASE_URL, local API_BASE_URL, and CONFIRM_DEV_PERMISSIONS_TEST=YES')
}
const pool = new pg.Pool({ connectionString: db, ssl: false })
const marker = randomUUID()
const productId = '44444444-4444-4444-8444-444444444444'
const storeId = '22222222-2222-4222-8222-222222222222'
const merchantId = '11111111-1111-4111-8111-111111111111'
const createdSubjects = []
const tokenHashes = []
let original = null
let modified = false
function hash(t) { return createHash('sha256').update(t).digest('hex') }
async function syntheticSession(role) {
  const subject = `test:permissions:${marker}:${role}`
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hash(token)
  await pool.query('INSERT INTO auth_sessions(token_hash,external_subject,expires_at) VALUES($1,$2,now()+interval \'10 minutes\')',[tokenHash,subject])
  tokenHashes.push(tokenHash)
  if (role !== 'outsider') {
    await pool.query('INSERT INTO merchant_members(merchant_id,external_subject,role) VALUES($1,$2,$3)',[merchantId,subject,role])
    createdSubjects.push(subject)
  }
  return token
}
async function request(token, method, data) {
  const r = await fetch(`${target}/v1/merchant/stores/stall-demo/products/${productId}`,{
    method, headers:{ ...(token?{authorization:`Bearer ${token}`}:{ }), 'content-type':'application/json' },
    ...(data ? {body:JSON.stringify(data)} : {}),
    signal: AbortSignal.timeout(6000)
  })
  return { status:r.status, body:await r.json() }
}
async function publicPrice() {
  const r = await fetch(`${target}/v1/stores/stall-demo/products`, {signal:AbortSignal.timeout(6000)})
  if (!r.ok) throw new Error(`Public catalog returned ${r.status}`)
  const data=await r.json()
  const item=data.products.find(x=>x.id===productId)
  if(!item)throw new Error('Test product absent from public API')
  return item.priceCents
}
function requireStatus(label,res,status) {
  if(res.status!==status)throw new Error(`${label}: expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`)
  console.log(`PASS ${label}: HTTP ${status}`)
}
try {
  const q = await pool.query('SELECT id,store_id,category_id,name,price_cents,active,sold_out,image_object_key FROM products WHERE id=$1',[productId])
  original=q.rows[0]
  if(!original || original.store_id!==storeId || !original.active) throw new Error('Expected active stall-demo test product missing')
  const owner=await syntheticSession('owner')
  const staff=await syntheticSession('staff')
  const outsider=await syntheticSession('outsider')
  const newPrice=original.price_cents===1800?1900:1800
  const body={categoryId:original.category_id,name:original.name,priceCents:newPrice,active:original.active,soldOut:original.sold_out,imageObjectKey:original.image_object_key}
  requireStatus('No credentials rejected',await request(null,'PATCH',body),401)
  requireStatus('Outsider rejected',await request(outsider,'PATCH',body),403)
  requireStatus('Staff write rejected',await request(staff,'PATCH',body),403)
  requireStatus('Owner permitted',await request(owner,'PATCH',body),200)
  modified=true
  if(await publicPrice()!==newPrice)throw new Error('Public API did not return updated owner price')
  console.log(`PASS Owner updated API catalog to ${newPrice} cents`)
  // Restore through authorized API before cleaning up sessions.
  requireStatus('Owner restored original price',await request(owner,'PATCH',{...body,priceCents:original.price_cents}),200)
  modified=false
  if(await publicPrice()!==original.price_cents)throw new Error('Public API restoration mismatch')
  console.log(`PASS Public API restored to ${original.price_cents} cents`)
} finally {
  if(modified && original) {
    await pool.query('UPDATE products SET price_cents=$1 WHERE id=$2 AND store_id=$3',[original.price_cents,productId,storeId])
    console.log('Restored original price in cleanup')
  }
  for(const h of tokenHashes)await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[h])
  for(const s of createdSubjects)await pool.query('DELETE FROM merchant_members WHERE merchant_id=$1 AND external_subject=$2',[merchantId,s])
  await pool.end()
}
