// Development-only permission integration test. Uses synthetic, expiring sessions.
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import pg from 'pg'

const raw = process.env.DATABASE_URL || ''
const api = process.env.API_BASE_URL || 'http://127.0.0.1:8787'
const dbUrl = new URL(raw)
const apiUrl = new URL(api)
if (process.env.CONFIRM_DEV_TENANT_TEST !== 'YES' ||
  !['localhost','127.0.0.1'].includes(dbUrl.hostname) || dbUrl.pathname !== '/stall_dev' ||
  !['localhost','127.0.0.1'].includes(apiUrl.hostname) || apiUrl.protocol !== 'http:') {
  throw Error('Requires local stall_dev database, local HTTP API, CONFIRM_DEV_TENANT_TEST=YES')
}
const pool = new pg.Pool({ connectionString: raw, ssl:false })
const marker = randomUUID()
const storeA = 'stall-demo'
const merchantA = '11111111-1111-4111-8111-111111111111'
const merchantB = randomUUID(), storeB = randomUUID(), slugB = 'tenant-test-' + marker.slice(0,8)
const productA = '44444444-4444-4444-8444-444444444444'
const subjects = [], tokens = [], categories = []
let madeB = false
async function identity(merchant, role) {
  const subject = `test:tenant:${marker}:${role}`
  const token = randomBytes(32).toString('base64url')
  const digest = createHash('sha256').update(token).digest('hex')
  await pool.query('INSERT INTO auth_sessions(token_hash,external_subject,expires_at) VALUES($1,$2,now()+interval \'10 minutes\')',[digest,subject])
  tokens.push(digest)
  await pool.query('INSERT INTO merchant_members(merchant_id,external_subject,role) VALUES($1,$2,$3)',[merchant,subject,role])
  subjects.push({merchant,subject})
  return token
}
async function request(token, method, slug, kind, id, body) {
  const u = `${api}/v1/merchant/stores/${slug}/${kind}${id?'/'+id:''}`
  const r=await fetch(u,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(8000)})
  let value
  try { value=await r.json() } catch { value={} }
  return { status:r.status, body:value }
}
function expect(label,result,status) {
  if (result.status!==status)throw Error(`${label}: expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`)
  console.log(`PASS ${label}: HTTP ${status}`)
}
try {
  const existing=await pool.query('SELECT id FROM stores WHERE slug=$1 AND merchant_id=$2',[storeA,merchantA])
  if (!existing.rowCount) throw Error('Required stall-demo store absent')
  await pool.query('INSERT INTO merchants(id,display_name) VALUES($1,$2)',[merchantB,'Temporary Tenant B'])
  madeB=true
  await pool.query('INSERT INTO stores(id,merchant_id,slug,name,is_active) VALUES($1,$2,$3,$4,true)',[storeB,merchantB,slugB,'Temporary Store B'])
  const manager=await identity(merchantA,'manager')
  const staff=await identity(merchantA,'staff')
  const ownerB=await identity(merchantB,'owner')
  const newName='Temporary permission category '+marker.slice(0,8)
  const created=await request(manager,'POST',storeA,'categories',null,{name:newName,sortOrder:50})
  expect('Manager creates own-store category',created,201)
  const id=created.body.category?.id
  if (!id)throw Error('Create response missing category id')
  categories.push(id)
  expect('Staff cannot create category',await request(staff,'POST',storeA,'categories',null,{name:newName+' staff'}),403)
  expect('Other merchant cannot create in Store A',await request(ownerB,'POST',storeA,'categories',null,{name:newName+' B'}),403)
  expect('Other merchant cannot edit Store A category',await request(ownerB,'PATCH',storeA,'categories',id,{name:'Unauthorized'}),403)
  expect('Other merchant cannot delete Store A category',await request(ownerB,'DELETE',storeA,'categories',id),403)
  expect('Store B owner cannot edit Store A product',await request(ownerB,'PATCH',storeA,'products',productA,{name:'Unauthorized',priceCents:1,active:true,soldOut:false,categoryId:null,imageObjectKey:null}),403)
  expect('Store A manager cannot modify Store B category list',await request(manager,'POST',slugB,'categories',null,{name:'Unauthorized'}),403)
  expect('Manager edits own-store category',await request(manager,'PATCH',storeA,'categories',id,{name:newName+' updated'}),200)
  expect('Manager deletes own-store category',await request(manager,'DELETE',storeA,'categories',id),200)
  categories.splice(categories.indexOf(id),1)
  const count=await pool.query('SELECT count(*)::int AS n FROM categories WHERE id=$1',[id])
  if (count.rows[0].n!==0)throw Error('Deleted category still exists')
  console.log('PASS Temporary category was removed')
} finally {
  try {
    for (const id of categories) await pool.query('DELETE FROM categories WHERE id=$1',[id])
    for (const digest of tokens) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[digest])
    for (const {merchant,subject} of subjects) await pool.query('DELETE FROM merchant_members WHERE merchant_id=$1 AND external_subject=$2',[merchant,subject])
    if (madeB) {
      await pool.query('DELETE FROM stores WHERE id=$1',[storeB])
      await pool.query('DELETE FROM merchants WHERE id=$1',[merchantB])
    }
    console.log('Cleanup attempted; original stall-demo data unchanged')
  } finally { await pool.end() }
}
