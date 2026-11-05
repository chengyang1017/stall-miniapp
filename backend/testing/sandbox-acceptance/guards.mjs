// Pure checks: no network, secret values never enter the report.
export function inspectSandboxEnvironment(e){
 const checks=[]
 const add=(name,ok)=>checks.push({name,status:ok?'CONFIGURED':'NEEDS_CONFIGURATION'})
 add('APP_ENV',e.APP_ENV==='sandbox')
 add('PAYMENT_DB_ENV',e.PAYMENT_DB_ENV==='isolated-test')
 for(const k of ['STRIPE_TEST_PAYMENTS_ENABLED','SANDBOX_PAYMENT_LIFECYCLE_ENABLED','SANDBOX_PAYMENT_WORKER_ENABLED','STRIPE_TEST_REFUNDS_ENABLED'])add(k,['true','false'].includes(e[k]))
 add('SANDBOX_PAYMENT_INSTANCE_ID',/^[a-f0-9-]{36}$/i.test(e.SANDBOX_PAYMENT_INSTANCE_ID||''))
 add('STRIPE_TEST_SECRET_KEY',/^sk_test_[A-Za-z0-9]+$/.test(e.STRIPE_TEST_SECRET_KEY||''))
 add('STRIPE_TEST_WEBHOOK_SECRET',/^whsec_[A-Za-z0-9]+$/.test(e.STRIPE_TEST_WEBHOOK_SECRET||''))
 for(const c of ['CARD','ALIPAY','WECHAT_PAY'])add('STRIPE_TEST_'+c+'_CONFIGURATION',/^pmc_[A-Za-z0-9]+$/.test(e['STRIPE_TEST_'+c+'_CONFIGURATION']||''))
 // Return URLs must point to the routes actually mounted by this backend.
 // Keep them on the same HTTPS origin; no third-party redirect destination.
 let origin=null
 for(const [k,path] of [['STRIPE_TEST_SUCCESS_URL','/v1/payments/stripe-test/return/complete'],['STRIPE_TEST_CANCEL_URL','/v1/payments/stripe-test/return/cancel']]){
  let ok=false
  try{
   const u=new URL(e[k])
   ok=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname===path&&!!u.hostname
   if(ok){if(origin!==null&&u.origin!==origin)ok=false;else origin=u.origin}
  }catch{}
  add(k,ok)
 }
 let db=false;try{const u=new URL(e.DATABASE_URL);db=['postgres:','postgresql:'].includes(u.protocol)&&!!u.hostname&&!!u.pathname.slice(1)}catch{}
 add('DATABASE_URL',db);add('PG_SSL',e.PG_SSL==='true')
 return {kind:'LOCAL_CONFIGURATION_ONLY',networkUsed:false,ready:checks.every(c=>c.status==='CONFIGURED'),checks,
  note:'Syntax only. Does not prove sandbox ownership, account eligibility, TLS, migrations, grants, webhook delivery or enabled feature switches.'}
}
export function nativeTestConfiguration(e){
 if(e.SBX_NATIVE_ACCEPTANCE!=='I_CONFIRM_EMPTY_ISOLATED_TEST_DATABASE'||e.APP_ENV!=='sandbox'||e.PAYMENT_DB_ENV!=='isolated-test')throw Error('native_test_explicit_isolation_required')
 if(!e.SBX_TEST_DATABASE_URL||e.SBX_TEST_DATABASE_URL===e.DATABASE_URL)throw Error('dedicated_test_database_url_required')
 let u;try{u=new URL(e.SBX_TEST_DATABASE_URL)}catch{throw Error('invalid_test_database_url')}
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.search||u.hash)throw Error('invalid_test_database_url')
 if(!e.SBX_EXPECT_HOST||u.hostname!==e.SBX_EXPECT_HOST||!e.SBX_EXPECT_DATABASE||decodeURIComponent(u.pathname.slice(1))!==e.SBX_EXPECT_DATABASE||!e.SBX_EXPECT_ROLE||decodeURIComponent(u.username)!==e.SBX_EXPECT_ROLE)throw Error('test_database_identity_mismatch')
 if(!/^[a-f0-9-]{36}$/i.test(e.SANDBOX_PAYMENT_INSTANCE_ID||''))throw Error('test_marker_required')
 return {connectionString:e.SBX_TEST_DATABASE_URL,max:8,connectionTimeoutMillis:5000,statement_timeout:10000,ssl:['localhost','127.0.0.1','::1'].includes(u.hostname)?false:{rejectUnauthorized:true}}
}
