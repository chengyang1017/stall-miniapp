import test from 'node:test'
import assert from 'node:assert/strict'
import {checkTencentProductionEnvironment} from '../scripts/check-tencent-production-env.mjs'
const good=()=>({
 APP_ENV:'production',HOST:'127.0.0.1',PORT:'8787',PG_SSL:'true',
 DATABASE_URL:'postgresql://newrole:fixture-pass-not-a-real-secret@db.production.internal:5432/stall',
 WX_APPID:'wx1234567890abcdef',WX_APPSECRET:'fixture-private-appsecret-123',
 S3_ENDPOINT:'https://cos.ap-beijing.myqcloud.com',S3_REGION:'ap-beijing',
 S3_BUCKET:'public-products',S3_ACCESS_KEY_ID:'fixture-id',S3_SECRET_ACCESS_KEY:'fixture-secret',
 IMAGE_PUBLIC_BASE_URL:'https://images.merchant-shop.cn',
 WECHAT_PAY_LIVE_ENABLED:'false',WECHAT_PAY_LIVE_REFUNDS_ENABLED:'false',
 WECHAT_PAY_REFUND_RECONCILE_ENABLED:'false'
})
test('safe isolated production configuration passes offline syntax gate',()=>{
 const result=checkTencentProductionEnvironment(good())
 assert.equal(result.safeToStart,true)
 assert.deepEqual(result.issues,[])
})
test('Neon connection and public binding are refused without leaking password',()=>{
 const x=good();x.DATABASE_URL='postgresql://neondb_owner:REAL_PASSWORD@ep-old.aws.neon.tech/neondb';x.HOST='0.0.0.0'
 const result=checkTencentProductionEnvironment(x)
 assert.equal(result.safeToStart,false)
 assert(result.issues.includes('DATABASE_URL_not_new_cloud_database'))
 assert(result.issues.includes('HOST_must_be_loopback'))
 assert.doesNotMatch(JSON.stringify(result),/REAL_PASSWORD/)
})
test('live payment, cleanup and Stripe test contamination are blocked',()=>{
 const x=good();x.WECHAT_PAY_LIVE_ENABLED='true';x.IMAGE_CLEANUP_EXECUTION_ENABLED='true';x.STRIPE_TEST_PAYMENTS_ENABLED='true'
 const result=checkTencentProductionEnvironment(x)
 assert.equal(result.safeToStart,false)
 assert(result.issues.some(x=>x.startsWith('WECHAT_PAY_LIVE_ENABLED')))
 assert(result.issues.some(x=>x.startsWith('IMAGE_CLEANUP_EXECUTION_ENABLED')))
 assert(result.issues.includes('test_only_environment_variable_present'))
})
test('missing private bucket confirmation is blocked',()=>{
 const x=good();x.PROOF_STORAGE_PRIVATE_CONFIRMED='true'
 const result=checkTencentProductionEnvironment(x)
 assert(result.issues.includes('proof_private_bucket_missing'))
})

test('bundled template placeholders never pass production preflight',()=>{
 const x=good()
 x.DATABASE_URL='postgresql://APP_ROLE:SET_WITH_SECRET_MANAGER@PRIVATE_POSTGRES_HOST:5432/stall'
 x.WX_APPSECRET='CHANGE_ME_NOT_LIVE'
 x.S3_ENDPOINT='https://cos.internal.example'
 x.S3_ACCESS_KEY_ID='SET_WITH_SECRET_MANAGER'
 x.IMAGE_PUBLIC_BASE_URL='https://images.example.cn'
 const out=checkTencentProductionEnvironment(x)
 assert.equal(out.safeToStart,false)
 for(const kind of ['DATABASE_URL_invalid','DATABASE_URL_not_new_cloud_database',
  'WX_APPSECRET_not_configured','object_storage_not_configured','public_image_domain_not_configured']){
  assert(out.issues.includes(kind),kind)
 }
 assert.doesNotMatch(JSON.stringify(out),/SET_WITH_SECRET_MANAGER|CHANGE_ME/)
})
test('legacy R2 or AWS S3 endpoints cannot be reused as Tencent COS',()=>{
 for(const endpoint of ['https://demo.r2.cloudflarestorage.com','https://s3.us-east-1.amazonaws.com']){
  const x=good();x.S3_ENDPOINT=endpoint
  const result=checkTencentProductionEnvironment(x)
  assert.equal(result.safeToStart,false)
  assert(result.issues.includes('object_storage_not_tencent_cos'))
 }
})
