// Offline Tencent production environment safety gate. Never opens network or DB.
// Do not print secrets or the raw DATABASE_URL; errors contain only variable names.
import {fileURLToPath} from 'node:url'
import path from 'node:path'
export function checkTencentProductionEnvironment(env){
 const issues=[]
 const fail=code=>issues.push(code)
 if(env.APP_ENV!=='production')fail('APP_ENV_must_be_production')
 if(env.HOST!=='127.0.0.1')fail('HOST_must_be_loopback')
 if(env.PORT!=='8787')fail('PORT_must_be_8787')
 if(env.PG_SSL!=='true')fail('PG_SSL_must_be_true')
 const url=env.DATABASE_URL
 if(!url)fail('DATABASE_URL_missing')
 else{
  try{
   const u=new URL(url)
   if(!['postgres:','postgresql:'].includes(u.protocol)||!u.username||!u.password||
      !u.hostname||!u.pathname||u.pathname==='/')fail('DATABASE_URL_invalid')
   if(u.hostname.endsWith('neon.tech')||u.hostname.includes('onrender.com')||
      u.hostname==='localhost'||u.hostname==='127.0.0.1')
      fail('DATABASE_URL_not_new_cloud_database')
  }catch{fail('DATABASE_URL_invalid')}
 }
 if(!/^wx[a-z0-9]{16}$/i.test(env.WX_APPID||''))fail('WX_APPID_not_configured')
 if(!env.WX_APPSECRET||env.WX_APPSECRET.length<12)fail('WX_APPSECRET_not_configured')
 for(const key of ['WECHAT_PAY_LIVE_ENABLED','WECHAT_PAY_LIVE_REFUNDS_ENABLED',
  'WECHAT_PAY_REFUND_RECONCILE_ENABLED','IMAGE_CLEANUP_EXECUTION_ENABLED',
  'IMAGE_CONDITIONAL_DELETE_VERIFIED','IMAGE_BACKUP_INVENTORY_CONFIRMED']){
  if(env[key]!==undefined&&env[key]!=='false')fail(key+'_must_start_disabled')
 }
 for(const key of Object.keys(env)){
  if(/^(?:STRIPE_TEST_|SANDBOX_PAYMENT_|STAGING_)/.test(key)&&env[key]&&
     !['false','DISABLED'].includes(env[key]))fail('test_only_environment_variable_present')
 }
 if(env.PAYMENT_DB_ENV==='isolated-test')fail('test_database_environment_forbidden')
 if(!env.S3_ENDPOINT||!env.S3_BUCKET||!env.S3_REGION||
    !env.S3_ACCESS_KEY_ID||!env.S3_SECRET_ACCESS_KEY)
    fail('object_storage_not_configured')
 if(!env.IMAGE_PUBLIC_BASE_URL||!/^https:\/\//.test(env.IMAGE_PUBLIC_BASE_URL))
  fail('public_image_domain_not_configured')
 if(env.PROOF_STORAGE_PRIVATE_CONFIRMED==='true'&&!env.S3_PROOF_BUCKET)
  fail('proof_private_bucket_missing')
 if(env.REVIEW_STORAGE_PRIVATE_CONFIRMED==='true'&&!env.S3_REVIEW_BUCKET)
  fail('review_private_bucket_missing')
 return {safeToStart:issues.length===0,issues:[...new Set(issues)].sort(),
  warning:'Local configuration syntax check only: not proof of merchant approval, cloud ownership, TLS, bucket policies, database migrations or payment readiness.'}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkTencentProductionEnvironment(process.env)
 console.log(JSON.stringify(report,null,2))
 if(!report.safeToStart)process.exitCode=2
}
