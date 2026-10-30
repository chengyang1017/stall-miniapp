// Ephemeral CI PostgreSQL integration test. NEVER point at a shared or live DB.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import pg from 'pg'
import {resolveVerifiedWechatAccount} from '../src/customerIdentity.mjs'
import {saveVerifiedWechatPhone} from '../src/customerWechatPhone.mjs'
const host=process.env.IDENTITY_CI_DB_HOST
const db=process.env.IDENTITY_CI_DB_NAME
if(process.env.CI!=='true'||host!=='127.0.0.1'||db!=='identity_ci'||process.env.IDENTITY_CI_DB_USER!=='postgres')
 throw Error('ephemeral_ci_postgres_only')
const pool=new pg.Pool({host,port:5432,database:db,user:'postgres',password:process.env.IDENTITY_CI_DB_PASSWORD,max:4})
const limitedPassword='ci_limited_role_only_password'
const runtime=new pg.Pool({host,port:5432,database:db,user:'stall_payment_app_limited',password:limitedPassword,max:4})
const subjectA='wx:wx0123456789abcdef:identity_ci_a'
const subjectB='wx:wx0123456789abcdef:identity_ci_b'
const phone='+8613812345678'
try{
 await pool.query(readFileSync(new URL('../sql/023_customer_identity_groundwork.sql',import.meta.url),'utf8'))
 // Create dedicated ephemeral application role after base schema is installed.
 await pool.query(`CREATE ROLE stall_payment_app_limited LOGIN PASSWORD '${limitedPassword}'`)
 await pool.query(readFileSync(new URL('../sql/024_customer_cloud_profile.sql',import.meta.url),'utf8'))
 await pool.query(readFileSync(new URL('../sql/025_customer_avatar_style.sql',import.meta.url),'utf8'))
 await pool.query(readFileSync(new URL('../migrations/proposals/wechat-verified-phone-binding.sql',import.meta.url),'utf8'))
 test('verified WeChat accounts persist across repeated login and remain distinct',async()=>{
  const a=await resolveVerifiedWechatAccount(runtime,subjectA)
  const again=await resolveVerifiedWechatAccount(runtime,subjectA)
  const b=await resolveVerifiedWechatAccount(runtime,subjectB)
  assert.equal(again,a)
  assert.notEqual(b,a)
 })
 test('first phone authorization binds only the matching account',async()=>{
  assert.equal(await saveVerifiedWechatPhone(runtime,subjectA,phone),'bound')
  assert.equal(await saveVerifiedWechatPhone(runtime,subjectA,phone),'bound')
  const rows=await pool.query('SELECT phone_e164 FROM customer_verified_phones WHERE account_id=(SELECT account_id FROM customer_login_identities WHERE provider_subject=$1)',[subjectA])
  assert.deepEqual(rows.rows.map(r=>r.phone_e164),[phone])
 })
 test('phone uniqueness blocks another WeChat account even with verified same number',async()=>{
  assert.equal(await saveVerifiedWechatPhone(runtime,subjectB,phone),'phone_already_bound')
  const rows=await pool.query('SELECT COUNT(*)::int AS n FROM customer_verified_phones WHERE phone_e164=$1',[phone])
  assert.equal(rows.rows[0].n,1)
 })
 test('existing account cannot overwrite its phone through onboarding',async()=>{
  assert.equal(await saveVerifiedWechatPhone(runtime,subjectA,'+8613912345678'),'phone_change_requires_reverification')
 })
}finally{
 // The database itself is thrown away with the GitHub Actions service container.
 process.on('exit',()=>{})
}
test('parallel first-login requests converge on exactly one permanent account',async()=>{
 const subject='wx:wx0123456789abcdef:parallel_login'
 const accounts=await Promise.all(Array.from({length:8},()=>resolveVerifiedWechatAccount(runtime,subject)))
 assert.equal(new Set(accounts).size,1)
 const stored=await pool.query("SELECT COUNT(*)::int AS n FROM customer_login_identities WHERE provider='wechat' AND provider_subject=$1",[subject])
 assert.equal(stored.rows[0].n,1)
})
test('concurrent binding of one phone to different accounts never merges identities',async()=>{
 const a='wx:wx0123456789abcdef:concurrent_a'
 const b='wx:wx0123456789abcdef:concurrent_b'
 const [aid,bid]=await Promise.all([resolveVerifiedWechatAccount(runtime,a),resolveVerifiedWechatAccount(runtime,b)])
 const candidate='+8613712345678'
 const results=await Promise.all([saveVerifiedWechatPhone(runtime,a,candidate),saveVerifiedWechatPhone(runtime,b,candidate)])
 assert.deepEqual(results.sort(),['bound','phone_already_bound'])
 const actual=await pool.query('SELECT account_id FROM customer_verified_phones WHERE phone_e164=$1',[candidate])
 assert.equal(actual.rows.length,1)
 assert.ok([aid,bid].includes(actual.rows[0].account_id))
 const identityCount=await pool.query("SELECT COUNT(*)::int AS n FROM customer_login_identities WHERE provider='wechat' AND provider_subject IN ($1,$2)",[a,b])
 assert.equal(identityCount.rows[0].n,2)
})
test('limited role can read and update its own cloud profile with scoped SQL',async()=>{
 const owner=await runtime.query("SELECT account_id FROM customer_login_identities WHERE provider='wechat' AND provider_subject=$1",[subjectA])
 const accountId=owner.rows[0].account_id
 const changed=await runtime.query("UPDATE customer_accounts a SET nickname=$1,updated_at=now() FROM customer_login_identities i WHERE i.account_id=a.id AND i.provider='wechat' AND i.provider_subject=$2 RETURNING a.id,a.nickname",['Test shopper',subjectA])
 assert.equal(changed.rows[0].id,accountId)
 assert.equal(changed.rows[0].nickname,'Test shopper')
 const avatar=await runtime.query("UPDATE customer_accounts a SET avatar_style=$1,updated_at=now() FROM customer_login_identities i WHERE i.account_id=a.id AND i.provider='wechat' AND i.provider_subject=$2 RETURNING a.avatar_style",['blue',subjectA])
 assert.equal(avatar.rows[0].avatar_style,'blue')
 const read=await runtime.query("SELECT a.id,a.nickname,a.avatar_style FROM customer_accounts a JOIN customer_login_identities i ON i.account_id=a.id WHERE i.provider='wechat' AND i.provider_subject=$1",[subjectA])
 assert.deepEqual(read.rows[0],{id:accountId,nickname:'Test shopper',avatar_style:'blue'})
 const blocked=await runtime.query("UPDATE customer_accounts a SET nickname=$1 FROM customer_login_identities i WHERE i.account_id=a.id AND i.provider='wechat' AND i.provider_subject=$2 RETURNING a.id",['Blocked','wx:wx0123456789abcdef:unknown'])
 assert.equal(blocked.rowCount,0)
})
test('limited role cannot access merchant membership or grant itself privileges',async()=>{
 await assert.rejects(runtime.query('SELECT * FROM merchant_members'),e=>e.code==='42P01'||e.code==='42501')
 await assert.rejects(runtime.query('SELECT token_hash FROM customer_account_sessions'),e=>e.code==='42P01'||e.code==='42501')
})
test('limited role has required registration rights and lacks delete rights',async()=>{
 const p=await runtime.query(`SELECT
 has_table_privilege(current_user,'public.customer_accounts','INSERT') AS can_create,
 has_table_privilege(current_user,'public.customer_accounts','DELETE') AS can_delete,
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','INSERT') AS can_bind`)
 assert.equal(p.rows[0].can_create,true)
 assert.equal(p.rows[0].can_delete,false)
 assert.equal(p.rows[0].can_bind,true)
})
test.after(async()=>{await runtime.end();await pool.end()})
