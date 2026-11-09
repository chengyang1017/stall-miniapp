// Offline Tencent production environment safety gate. Never opens network or DB.
// Do not print secrets or the raw DATABASE_URL; errors contain only variable names.
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const placeholder=/(?:CHANGE_ME|SET_WITH_SECRET_MANAGER|PLACEHOLDER|YOUR[_-]|EXAMPLE|DUMMY|SYNTHETIC|REPLACE[_-]|PRIVATE_POSTGRES_HOST|APP_ROLE|TODO|TEST_ONLY)/i
const missingOrPlaceholder=value=>typeof value!=='string'||!value.trim()||placeholder.test(value)
const invalidHost=host=>!host||host==='localhost'||host==='127.0.0.1'||
 host==='::1'||host.endsWith('.neon.tech')||host.endsWith('.onrender.com')||
 host.endsWith('.example')||host.endsWith('.example.com')||host.endsWith('.example.cn')||
 host.endsWith('.test')||host.endsWith('.invalid')
const secureUrl=value=>{
 if(missingOrPlaceholder(value))return false
 try{const u=new URL(value);return u.protocol==='https:'&&
  !invalidHost(u.hostname)&&!u.username&&!u.password&&!u.hash}
 catch{return false}
}
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
   if(!['postgres:','postgresql:'].includes(u.protocol)||missingOrPlaceholder(u.username)||
      missingOrPlaceholder(u.password)||!u.pathname||u.pathname==='/'||
      missingOrPlaceholder(decodeURIComponent(u.pathname.slice(1)))||
      u.hash||u.searchParams.has('password'))fail('DATABASE_URL_invalid')
   if(invalidHost(u.hostname)||placeholder.test(u.hostname))
      fail('DATABASE_URL_not_new_cloud_database')
  }catch{fail('DATABASE_URL_invalid')}
 }
 if(!/^wx[a-z0-9]{16}$/i.test(env.WX_APPID||''))fail('WX_APPID_not_configured')
 if(missingOrPlaceholder(env.WX_APPSECRET)||env.WX_APPSECRET.length<12)fail('WX_APPSECRET_not_configured')
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
 const storageHost=(()=>{try{return new URL(env.S3_ENDPOINT).hostname}catch{return ''}})()
 if(storageHost.endsWith('.r2.cloudflarestorage.com')||storageHost.endsWith('.amazonaws.com'))
   fail('object_storage_not_tencent_cos')
 if(!secureUrl(env.S3_ENDPOINT)||['S3_BUCKET','S3_REGION',
   'S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY'].some(key=>missingOrPlaceholder(env[key])))
   fail('object_storage_not_configured')
 if(!secureUrl(env.IMAGE_PUBLIC_BASE_URL))
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
