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
const subjectA='wx:wx0123456789abcdef:identity_ci_a'
const subjectB='wx:wx0123456789abcdef:identity_ci_b'
const phone='+8613812345678'
try{
 await pool.query(readFileSync(new URL('../sql/023_customer_identity_groundwork.sql',import.meta.url),'utf8'))
 test('verified WeChat accounts persist across repeated login and remain distinct',async()=>{
  const a=await resolveVerifiedWechatAccount(pool,subjectA)
  const again=await resolveVerifiedWechatAccount(pool,subjectA)
  const b=await resolveVerifiedWechatAccount(pool,subjectB)
  assert.equal(again,a)
  assert.notEqual(b,a)
 })
 test('first phone authorization binds only the matching account',async()=>{
  assert.equal(await saveVerifiedWechatPhone(pool,subjectA,phone),'bound')
  assert.equal(await saveVerifiedWechatPhone(pool,subjectA,phone),'bound')
  const rows=await pool.query('SELECT phone_e164 FROM customer_verified_phones WHERE account_id=(SELECT account_id FROM customer_login_identities WHERE provider_subject=$1)',[subjectA])
  assert.deepEqual(rows.rows.map(r=>r.phone_e164),[phone])
 })
 test('phone uniqueness blocks another WeChat account even with verified same number',async()=>{
  assert.equal(await saveVerifiedWechatPhone(pool,subjectB,phone),'phone_already_bound')
  const rows=await pool.query('SELECT COUNT(*)::int AS n FROM customer_verified_phones WHERE phone_e164=$1',[phone])
  assert.equal(rows.rows[0].n,1)
 })
 test('existing account cannot overwrite its phone through onboarding',async()=>{
  assert.equal(await saveVerifiedWechatPhone(pool,subjectA,'+8613912345678'),'phone_change_requires_reverification')
 })
}finally{
 // The database itself is thrown away with the GitHub Actions service container.
 process.on('exit',()=>{})
}
test.after(async()=>{await pool.end()})
