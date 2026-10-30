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
 const missing=['customer_accounts','customer_login_identities','customer_verified_phones'].filter(x=>!present.has(x))
 if(missing.length)fail('missing_tables:'+missing.join(','))
 const constraints=await client.query(`SELECT conrelid::regclass::text AS tbl,contype,pg_get_constraintdef(oid) AS definition
 FROM pg_constraint WHERE conrelid IN ('public.customer_verified_phones'::regclass,'public.customer_login_identities'::regclass)`)
 const phoneConstraints=constraints.rows.filter(x=>x.tbl==='customer_verified_phones'||x.tbl==='public.customer_verified_phones')
 const loginConstraints=constraints.rows.filter(x=>x.tbl==='customer_login_identities'||x.tbl==='public.customer_login_identities')
 if(!phoneConstraints.some(x=>x.contype==='u'&&x.definition.includes('phone_e164')))fail('phone_unique_constraint_missing')
 if(!phoneConstraints.some(x=>x.contype==='p'&&x.definition.includes('account_id')))fail('account_primary_key_missing')
 if(!loginConstraints.some(x=>x.contype==='u'&&x.definition.includes('provider')&&x.definition.includes('provider_subject')))fail('login_identity_unique_constraint_missing')
 const privileges=await client.query(`SELECT
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','SELECT') AS can_read,
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','INSERT') AS can_insert,
 has_column_privilege(current_user,'public.customer_verified_phones','phone_e164','UPDATE') AS can_update`)
 if(!privileges.rows[0]?.can_read||!privileges.rows[0]?.can_insert||!privileges.rows[0]?.can_update)fail('insufficient_phone_column_privileges')
 // Report only object/privilege readiness. Never output customer data or credentials.
 console.log(JSON.stringify({status:'inspected',databaseMatched:true,identityTablesPresent:true,phoneConstraintsPresent:true,loginIdentityConstraintPresent:true,runtimePhonePrivileges:privileges.rows[0]}))
 await client.query('ROLLBACK')
}catch(error){
 if(client)try{await client.query('ROLLBACK')}catch{}
 console.error('Phone staging preflight failed:',String(error.message||error).replace(raw||'','[redacted]'))
 process.exitCode=1
}finally{client?.release();await pool.end()}
