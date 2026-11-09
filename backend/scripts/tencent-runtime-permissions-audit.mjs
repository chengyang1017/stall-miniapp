// TencentDB isolated restored database runtime role audit.
// DEFAULT PLAN ONLY. --check uses read-only transaction, never changes grants or data.
import {fileURLToPath} from 'node:url'
import path from 'node:path'

// Reviewed from 001-020 SQL. This is the initial *table* baseline, not a
// proof of full app privileges, RLS policies, functions or column-level grants.
export const LEGACY_TABLES=Object.freeze([
 'merchants','stores','merchant_members','categories','products','orders',
 'order_items','payment_events','auth_sessions','store_delivery_rules',
 'order_status_events','product_drafts','inventory_reservations',
 'inventory_movements','support_conversations','support_messages',
 'merchant_archives','merchant_archive_actions','stored_images',
 'image_reference_history','image_cleanup_plans','image_cleanup_items',
 'image_cleanup_audit','customer_addresses','product_create_requests',
 'store_miniapp_codes','delivery_tracking_tasks','delivery_tracking_sessions',
 'product_reviews','product_review_revisions','product_review_replies',
 'product_review_images','product_review_reports','product_review_moderators',
 'product_review_moderation_events','product_review_image_cleanup_events'
])
export const CANDIDATE_TABLES=Object.freeze([
 'customer_accounts','customer_login_identities','customer_verified_phones',
 'customer_account_sessions','wechat_live_prepays','wechat_live_refunds',
 'wechat_live_refund_events','wechat_abnormal_collection_reviews'
])
export const LEDGERS=Object.freeze(['stall_schema_migrations','stall_tencent_drill_migrations'])
const writePriv=['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']
const coreReads=['stores','products','orders','order_items','merchant_members',
 'auth_sessions','store_delivery_rules','support_messages','payment_events']
const requiredWrites={
 orders:['INSERT','UPDATE'],
 order_items:['INSERT'],
 products:['INSERT','UPDATE'],
 auth_sessions:['INSERT','DELETE'],
 support_messages:['INSERT'],
 inventory_reservations:['INSERT','UPDATE'],
 inventory_movements:['INSERT'],
 payment_events:['INSERT']
}
// Explicitly exercised columns in customer sessions/profile and WeChat refunds.
// has_table_privilege() alone misses valid column-level GRANTs.
export const REQUIRED_COLUMN_GRANTS=Object.freeze({
 customer_accounts:{
  UPDATE:['nickname','avatar_style','avatar_photo_key','updated_at']
 },
 customer_account_sessions:{
  SELECT:['account_id','token_hash','expires_at','revoked_at'],
  INSERT:['account_id','token_hash','expires_at'],
  UPDATE:['revoked_at']
 },
 wechat_live_refunds:{
  UPDATE:['status','provider_refund_id','provider_status','last_error','claimed_at',
   'updated_at','reconcile_next_at','reconcile_attempts','reconcile_lease_token',
   'reconcile_lease_until']
 },
 store_delivery_rules:{
  INSERT:['store_id','configuration'],
  UPDATE:['configuration','updated_at']
 }
})
const appendOnly=['wechat_live_refund_events','wechat_abnormal_collection_reviews',
 'order_status_events','image_cleanup_audit','product_review_moderation_events']
export function validateRuntimeAuditTarget(env){
 if(env.TENCENT_ROLE_AUDIT!=='READ_ONLY_ISOLATED'||env.PG_SSL!=='true'||
    env.APP_ENV!=='isolated-migration'||env.TENCENT_ROLE_AUDIT_TARGET!=='stall_tencent_drill')
  throw Error('tencent_runtime_audit_authorization_missing')
 let u
 try{u=new URL(env.DATABASE_URL)}catch{throw Error('tencent_runtime_audit_target_invalid')}
 const host=u.hostname.toLowerCase()
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.username||!u.password||
   !host||host!==env.TENCENT_DRILL_EXPECTED_HOST?.toLowerCase()||
   host==='localhost'||host==='127.0.0.1'||host.endsWith('.neon.tech')||
   host.endsWith('.onrender.com')||host.endsWith('.example')||host.endsWith('.test')||
   u.pathname!=='/stall_tencent_drill'||u.searchParams.has('password')||u.hash)
  throw Error('tencent_runtime_audit_target_invalid')
 return {database:'stall_tencent_drill'}
}
export async function auditRuntimePrivileges(db,{role='stall_tencent_runtime'}={}){
 if(role!=='stall_tencent_runtime')throw Error('runtime_role_unapproved')
 // Strictly read-only and transaction-scoped; no DDL or data writes.
 await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 let open=true
 try{
  await db.query("SET LOCAL statement_timeout='5000ms'")
  await db.query("SET LOCAL lock_timeout='1500ms'")
  const id=(await db.query('SELECT current_database() AS database, current_user AS executor')).rows[0]
  if(id?.database!=='stall_tencent_drill'||id.executor===role)
   throw Error('isolated_role_audit_identity_mismatch')
  const roles=(await db.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,
    rolinherit,rolbypassrls FROM pg_roles WHERE rolname=$1`,[role])).rows
  if(roles.length!==1)throw Error('runtime_role_missing')
  const attributes=roles[0]
  const violations=[]
  const add=(code,table)=>violations.push({code,table})
  for(const key of ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'])
   if(attributes[key])add('unsafe_role_attribute',key)
  const superMembership=(await db.query(`SELECT granted.rolname FROM pg_auth_members m
     JOIN pg_roles member ON m.member=member.oid
     JOIN pg_roles granted ON granted.oid=m.roleid
     WHERE member.rolname=$1 AND granted.rolname IN ('pg_read_all_data','pg_write_all_data')`,[role])).rows
  if(superMembership.length)add('global_privilege_membership','runtime')
  const schema=(await db.query("SELECT has_schema_privilege($1,'public','USAGE') AS allowed",[role])).rows[0]
  if(!schema?.allowed)add('missing_schema_usage','public')
  const required=[...new Set([...LEGACY_TABLES,...CANDIDATE_TABLES,...LEDGERS])]
  const rows=(await db.query(`SELECT c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname=ANY($1::text[])`,[required])).rows
  const present=new Set(rows.map(x=>x.name))
  // An incomplete restored schema is an audit failure, never treated as denied grants.
  for(const name of required)if(!present.has(name))add('table_missing',name)
  const privileges={}
  for(const table of required){
   if(!present.has(table))continue
   const status={}
   for(const privilege of ['SELECT',...writePriv]){
    const result=(await db.query(
     "SELECT has_table_privilege($1,format('%I.%I','public',$2),$3) AS allowed",
     [role,table,privilege])).rows[0]
    status[privilege]=result?.allowed===true
   }
   privileges[table]=status
   if(coreReads.includes(table)&&!status.SELECT)add('missing_core_select',table)
   for(const privilege of requiredWrites[table]||[])
    if(!status[privilege])add('missing_business_'+privilege.toLowerCase(),table)
   if(appendOnly.includes(table))
    for(const privilege of ['UPDATE','DELETE','TRUNCATE'])
     if(status[privilege])add('append_only_write_exposure',table)
   if(LEDGERS.includes(table))
    for(const privilege of writePriv)if(status[privilege])add('migration_ledger_write_exposure',table)
  }
  let columnsChecked=0
  for(const [table,grants] of Object.entries(REQUIRED_COLUMN_GRANTS)){
   if(!present.has(table))continue
   const expected=[...new Set(Object.values(grants).flat())]
   const columnResult=await db.query(`SELECT a.attname
     FROM pg_attribute a
     JOIN pg_class c ON c.oid=a.attrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relname=$1 AND c.relkind IN ('r','p')
       AND a.attnum>0 AND NOT a.attisdropped AND a.attname=ANY($2::text[])`,
      [table,expected])
   const available=new Set(columnResult.rows.map(x=>x.attname))
   for(const column of expected)if(!available.has(column))
    add('required_column_missing',table+'.'+column)
   for(const [privilege,columns] of Object.entries(grants)){
    for(const column of columns){
     if(!available.has(column))continue
     columnsChecked++
     const result=(await db.query(
      "SELECT has_column_privilege($1,format('%I.%I','public',$2),$3,$4) AS allowed",
       [role,table,column,privilege])).rows[0]
     if(result?.allowed!==true)
      add('missing_column_'+privilege.toLowerCase(),table+'.'+column)
    }
   }
  }
  // High-risk extras: detect accidental universal destructive grants on legacy tables.
  for(const table of LEGACY_TABLES)if(privileges[table]?.TRUNCATE)
   add('legacy_truncate_exposure',table)
  await db.query('COMMIT');open=false
  return {audit:'tencent_runtime_privileges_read_only',database:'stall_tencent_drill',
   role,expectedTables:required.length,presentTables:present.size,
   legacyTables:LEGACY_TABLES.length,checkedTablePrivileges:Object.keys(privileges).length*7,
   checkedColumnPrivileges:columnsChecked,
   passed:violations.length===0,violations,
   caution:'This is a narrow baseline, NOT proof of complete query permissions, all column grants, RLS, sequence/function grants or merchant production readiness.'}
 }finally{
  if(open)await db.query('ROLLBACK').catch(()=>{})
 }
}
async function main(){
 const args=process.argv.slice(2)
 if(args.length>1||args.length===1&&!['--plan','--check'].includes(args[0]))
  throw Error('usage_plan_or_check')
 if(args[0]!=='--check'){
  console.log(JSON.stringify({mode:'offline_plan',executed:false,
   legacyTables:LEGACY_TABLES.length,candidateTables:CANDIDATE_TABLES.length,
   ledgers:LEDGERS.length,requires:['TencentDB isolated restore','dedicated audit role',
   'verified runtime role grants','explicit read-only audit authorization']},null,2))
  return
 }
 validateRuntimeAuditTarget(process.env)
 const {Client}=await import('pg')
 const client=new Client({connectionString:process.env.DATABASE_URL,
   ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000})
 try{
  await client.connect()
  const report=await auditRuntimePrivileges(client)
  console.log(JSON.stringify(report,null,2))
  if(!report.passed)process.exitCode=2
 }finally{await client.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('TENCENT_RUNTIME_PRIVILEGE_AUDIT_BLOCKED');process.exitCode=1})
}
