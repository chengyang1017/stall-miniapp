// Read-only preflight for an explicitly isolated staging PostgreSQL connection.
// Never applies migrations, grants or touches customer phone values.
import {Pool} from 'pg'
const fail=code=>{throw Error(code)}
const env=process.env
if(env.PAYMENT_DB_ENV!=='isolated-test'||env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true')
 fail('isolated_staging_required')
const raw=env.PHONE_PREFLIGHT_DATABASE_URL
const expectedHost=env.PHONE_PREFLIGHT_EXPECTED_HOST
const expectedDatabase=env.PHONE_PREFLIGHT_EXPECTED_DATABASE
const expectedRole=env.PHONE_PREFLIGHT_EXPECTED_ROLE
if(!raw||!expectedHost||!expectedDatabase||!expectedRole)fail('explicit_target_required')
const target=new URL(raw)
if(!['postgres:','postgresql:'].includes(target.protocol)||target.hostname!==expectedHost||decodeURIComponent(target.pathname.slice(1))!==expectedDatabase||!target.password)
 fail('target_mismatch')
if(target.searchParams.get('sslmode')!=='verify-full'||[...target.searchParams.keys()].some(k=>k!=='sslmode'))fail('strict_tls_required')
const pool=new Pool({host:target.hostname,port:Number(target.port||5432),user:decodeURIComponent(target.username),password:decodeURIComponent(target.password),database:expectedDatabase,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:5000})
let client
try{
 client=await pool.connect()
 await client.query('BEGIN READ ONLY')
 const identity=await client.query('SELECT current_database() AS db,current_user AS role')
 if(identity.rows[0]?.db!==expectedDatabase)fail('database_mismatch')
 if(identity.rows[0]?.role!==expectedRole)fail('database_role_mismatch')
 const tables=await client.query(`SELECT table_name FROM information_schema.tables
 WHERE table_schema='public' AND table_name=ANY($1::text[])`,
 [['customer_accounts','customer_login_identities','customer_verified_phones']])
 const present=new Set(tables.rows.map(x=>x.table_name))
 const profileColumns=await client.query(`SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='customer_accounts' AND column_name=ANY($1::text[])`,
 [['id','nickname','avatar_style','updated_at']])
 if(profileColumns.rows.length!==4)fail('customer_profile_migrations_missing')
 const missing=['customer_accounts','customer_login_identities','customer_verified_phones'].filter(x=>!present.has(x))
 if(missing.length)fail('missing_tables:'+missing.join(','))
 const constraints=await client.query(`SELECT conrelid::regclass::text AS tbl,contype,pg_get_constraintdef(oid) AS definition
 FROM pg_constraint WHERE conrelid IN ('public.customer_verified_phones'::regclass,'public.customer_login_identities'::regclass)`)
 const phoneConstraints=constraints.rows.filter(x=>x.tbl==='customer_verified_phones'||x.tbl==='public.customer_verified_phones')
 const loginConstraints=constraints.rows.filter(x=>x.tbl==='customer_login_identities'||x.tbl==='public.customer_login_identities')
 if(!phoneConstraints.some(x=>x.contype==='u'&&x.definition.includes('phone_e164')))fail('phone_unique_constraint_missing')
 if(!phoneConstraints.some(x=>x.contype==='p'&&x.definition.includes('account_id')))fail('account_primary_key_missing')
 if(!loginConstraints.some(x=>x.contype==='u'&&x.definition.includes('provider')&&x.definition.includes('provider_subject')))fail('login_identity_unique_constraint_missing')
 const onboardingPrivileges=await client.query(`SELECT
 has_table_privilege(current_user,'public.customer_accounts','INSERT') AS account_create,
 has_column_privilege(current_user,'public.customer_accounts','id','SELECT') AS account_id_read,
 has_column_privilege(current_user,'public.customer_accounts','nickname','SELECT') AS nickname_read,
 has_column_privilege(current_user,'public.customer_accounts','avatar_style','SELECT') AS avatar_style_read,
 has_column_privilege(current_user,'public.customer_accounts','nickname','UPDATE') AS nickname_write,
 has_column_privilege(current_user,'public.customer_accounts','avatar_style','UPDATE') AS avatar_style_write,
 has_column_privilege(current_user,'public.customer_accounts','updated_at','UPDATE') AS timestamp_write,
 has_column_privilege(current_user,'public.customer_login_identities','account_id','SELECT') AS login_account_read,
 has_column_privilege(current_user,'public.customer_login_identities','provider','SELECT') AS login_provider_read,
 has_column_privilege(current_user,'public.customer_login_identities','provider_subject','SELECT') AS login_subject_read,
 has_column_privilege(current_user,'public.customer_login_identities','account_id','INSERT') AS login_account_insert,
 has_column_privilege(current_user,'public.customer_login_identities','provider','INSERT') AS login_provider_insert,
 has_column_privilege(current_user,'public.customer_login_identities','provider_subject','INSERT') AS login_subject_insert,
 has_column_privilege(current_user,'public.customer_login_identities','verified_at','INSERT') AS login_verified_insert`)
 if(Object.values(onboardingPrivileges.rows[0]||{}).some(value=>value!==true))fail('insufficient_first_wechat_login_privileges')
 const privileges=await client.query(`SELECT
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','SELECT') AS can_read,
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','INSERT') AS can_insert,
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','UPDATE') AS can_update`)
 if(!privileges.rows[0]?.can_read||!privileges.rows[0]?.can_insert||!privileges.rows[0]?.can_update)fail('insufficient_phone_column_privileges')
 // SMS is an explicit second-stage gate: inspect schema and permissions only when requested.
 let smsReady=false
 if(env.CUSTOMER_SMS_LOGIN_ENABLED==='true'){
  if(env.CUSTOMER_PHONE_SESSION_ENABLED!=='true'||env.CUSTOMER_SMS_PROVIDER_READY!=='true'||
   !env.CUSTOMER_SMS_HMAC_SECRET||env.CUSTOMER_SMS_HMAC_SECRET.length<32||
   !env.TENCENTCLOUD_SECRET_ID||!env.TENCENTCLOUD_SECRET_KEY||
   !/^\d{5,20}$/.test(env.TENCENT_SMS_APP_ID||'')||
   !/^\d{4,20}$/.test(env.TENCENT_SMS_TEMPLATE_ID||'')||
   !env.TENCENT_SMS_SIGN_NAME)fail('sms_provider_configuration_incomplete')
  const smsTables=await client.query(`SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name=ANY($1::text[])`,
   [['customer_sms_challenges','customer_sms_issue_attempts','customer_account_sessions']])
  const found=new Set(smsTables.rows.map(x=>x.table_name))
  if(['customer_sms_challenges','customer_sms_issue_attempts','customer_account_sessions'].some(t=>!found.has(t)))
   fail('sms_migrations_missing')
  const smsCols=await client.query(`SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='public' AND
   ((table_name='customer_sms_challenges' AND column_name=ANY($1::text[]))
   OR (table_name='customer_sms_issue_attempts' AND column_name=ANY($2::text[])))`,
   [['phone_e164','code_hash','attempts','expires_at','consumed_at'],['phone_e164','ip_hash','created_at']])
  const colSet=new Set(smsCols.rows.map(x=>x.table_name+'.'+x.column_name))
  if(['phone_e164','code_hash','attempts','expires_at','consumed_at'].some(c=>!colSet.has('customer_sms_challenges.'+c))||
     ['phone_e164','ip_hash','created_at'].some(c=>!colSet.has('customer_sms_issue_attempts.'+c)))fail('sms_columns_missing')
  const grants=await client.query(`SELECT
   has_table_privilege(current_user,'public.customer_sms_challenges','SELECT') AS challenge_read,
   has_table_privilege(current_user,'public.customer_sms_challenges','INSERT') AS challenge_insert,
   has_table_privilege(current_user,'public.customer_sms_challenges','UPDATE') AS challenge_update,
   has_table_privilege(current_user,'public.customer_sms_issue_attempts','SELECT') AS issue_read,
   has_table_privilege(current_user,'public.customer_sms_issue_attempts','INSERT') AS issue_insert,
   has_sequence_privilege(current_user,'public.customer_sms_issue_attempts_id_seq','USAGE') AS issue_sequence`)
  if(Object.values(grants.rows[0]||{}).some(v=>v!==true))fail('sms_runtime_privileges_missing')
  smsReady=true
 }
 // Report only object/privilege readiness. Never output customer data or credentials.
 console.log(JSON.stringify({status:'inspected',databaseMatched:true,identityTablesPresent:true,phoneConstraintsPresent:true,loginIdentityConstraintPresent:true,firstWechatLoginPrivileges:onboardingPrivileges.rows[0],runtimePhonePrivileges:privileges.rows[0],smsReadinessChecked:env.CUSTOMER_SMS_LOGIN_ENABLED==='true',smsReady}))
 await client.query('ROLLBACK')
}catch(error){
 if(client)try{await client.query('ROLLBACK')}catch{}
 console.error('Phone staging preflight failed:',String(error.message||error).replace(raw||'','[redacted]'))
 process.exitCode=1
}finally{client?.release();await pool.end()}
