// Reviewed migration drill ONLY: never a merchant production migration entrypoint.
// --plan does not connect to any database. --apply modifies ONLY isolated DB
// "stall_tencent_drill" after explicit authorization + source-ledger verification.
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {buildMigrationPolicyPlan} from './tencent-sql-policy-plan.mjs'

export const DRILL_FILES=Object.freeze([
 '023_customer_identity_groundwork.sql',
 'tencent_isolated_customer_profile_sessions.sql',
 '034_wechat_live_prepays.sql',
 '035_wechat_live_refunds.sql',
 '036_wechat_refund_reconcile.sql',
 '037_wechat_abnormal_collection_reviews.sql'
])
const sha=b=>createHash('sha256').update(b).digest('hex')
const sqlDir=fileURLToPath(new URL('../sql/',import.meta.url))
export async function prepareTencentDrill(){
 const policy=await buildMigrationPolicyPlan(sqlDir)
 const byName=new Map(policy.migrations.map(e=>[e.filename,e]))
 const source=policy.migrations.slice(0,21).map(e=>({filename:e.filename,sha256:e.sha256}))
 const scripts=[]
 for(const filename of DRILL_FILES){
  const special=filename==='tencent_isolated_customer_profile_sessions.sql'
  const entry=special?null:byName.get(filename)
  if(!special&&(!entry||!entry.policy.startsWith('review_')))
   throw Error('drill_sql_policy_changed')
  const file=special?fileURLToPath(new URL('../../deploy/tencent/isolated-customer-profile-sessions.sql',import.meta.url)):path.join(sqlDir,filename)
  const raw=await readFile(file,'utf8')
  const checksum=sha(raw)
  if(!special&&checksum!==entry.sha256)throw Error('drill_sql_hash_changed')
  scripts.push({filename,sha256:checksum,sql:unwrapSingleTransaction(raw)})
 }
 return {mode:'isolated_tencentdb_drill_plan',database:'stall_tencent_drill',source,
  scripts,executed:false,productionApproved:false}
}
// Strictly require a single outer BEGIN/COMMIT pair in each pre-reviewed SQL.
// The runner must own transaction + insert the drill ledger in the SAME commit.
export function unwrapSingleTransaction(sql){
 if(typeof sql!=='string')throw Error('unsafe_sql_transaction_wrapper')
 const start=/^(?:(?:--[^\n]*\n)|(?:\s*))*BEGIN\s*;\s*/i
 const end=/\s*COMMIT\s*;\s*$/i
 if(!start.test(sql)||!end.test(sql))throw Error('unsafe_sql_transaction_wrapper')
 const body=sql.replace(start,'').replace(end,'')
 // No extra transaction boundaries permitted in the SQL body.
 if(/\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\s*;/i.test(body))throw Error('unsafe_sql_transaction_wrapper')
 return body
}
export function validateDrillTarget(env){
 if(env.TENCENT_DRILL_APPLY!=='APPLY_ONLY_ISOLATED_RESTORED_DB'||
    env.APP_ENV!=='isolated-migration'||env.PG_SSL!=='true')
  throw Error('isolated_drill_authorization_required')
 const expected=env.TENCENT_DRILL_EXPECTED_HOST,raw=env.DATABASE_URL
 if(!expected||!raw)throw Error('isolated_drill_target_missing')
 let u
 try{u=new URL(raw)}catch{throw Error('isolated_drill_target_invalid')}
 const host=u.hostname.toLowerCase()
 if(!['postgres:','postgresql:'].includes(u.protocol)||
    host!==expected.toLowerCase()||host==='localhost'||host==='127.0.0.1'||
    host.endsWith('.neon.tech')||host.endsWith('.onrender.com')||
    host.endsWith('.example')||host.endsWith('.test')||
    u.pathname!=='/stall_tencent_drill'||!u.username||!u.password||u.hash||
    u.searchParams.has('password'))
  throw Error('isolated_drill_target_invalid')
 if(env.WECHAT_PAY_LIVE_ENABLED==='true'||env.WECHAT_PAY_LIVE_REFUNDS_ENABLED==='true')
  throw Error('live_payment_must_remain_off')
 return {database:'stall_tencent_drill',host}
}
export async function applyDrill(client,plan){
 if(!plan||plan.scripts?.map(x=>x.filename).join('|')!==DRILL_FILES.join('|')||
    plan.source?.length!==21)throw Error('drill_plan_invalid')
 const run=sql=>client.query(sql)
 let locked=false
 try{
  const identity=(await run("SELECT current_database() AS database,current_user AS role")).rows[0]
  if(identity.database!=='stall_tencent_drill')throw Error('isolated_drill_database_mismatch')
  // Cooperative lock: blocks concurrent invocations of this runner.
  const lock=(await run('SELECT pg_try_advisory_lock(552193, 20261109) AS locked')).rows[0]?.locked
  if(lock!==true)throw Error('isolated_drill_lock_unavailable')
  locked=true
  await run("BEGIN")
  try{
   await run("SET LOCAL lock_timeout='2000ms'")
   await run("SET LOCAL statement_timeout='15000ms'")
   const source=(await run("SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename")).rows
   if(source.length!==21||source.some((x,i)=>
     x.filename!==plan.source[i].filename||x.sha256!==plan.source[i].sha256))
    throw Error('source_ledger_not_exact_001_021')
   // If there is no drill ledger, refuse preexisting target tables (untracked DDL).
   const present=(await run("SELECT to_regclass('public.stall_tencent_drill_migrations') IS NOT NULL AS found")).rows[0].found
   if(!present){
    const preexisting=(await run("SELECT to_regclass('public.customer_accounts') IS NOT NULL OR to_regclass('public.customer_account_sessions') IS NOT NULL OR to_regclass('public.wechat_live_prepays') IS NOT NULL OR to_regclass('public.wechat_live_refunds') IS NOT NULL OR to_regclass('public.wechat_abnormal_collection_reviews') IS NOT NULL AS found")).rows[0].found
    if(preexisting)throw Error('untracked_target_tables_present')
   }
   await run('CREATE TABLE IF NOT EXISTS public.stall_tencent_drill_migrations (filename text PRIMARY KEY,sha256 char(64) NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())')
   const recorded=(await run('SELECT filename,sha256 FROM public.stall_tencent_drill_migrations ORDER BY filename')).rows
   if(recorded.length>plan.scripts.length||recorded.some((x,i)=>
      x.filename!==plan.scripts[i].filename||x.sha256!==plan.scripts[i].sha256))
    throw Error('drill_ledger_changed_or_out_of_order')
   await run('COMMIT')
  }catch(e){await run('ROLLBACK').catch(()=>{});throw e}
  const outcome=[]
  for(const script of plan.scripts){
   await run('BEGIN')
   try{
    await run("SET LOCAL lock_timeout='2000ms'")
    await run("SET LOCAL statement_timeout='15000ms'")
    const record=(await client.query('SELECT sha256 FROM public.stall_tencent_drill_migrations WHERE filename=$1',[script.filename])).rows[0]
    if(record){
     if(record.sha256!==script.sha256)throw Error('drill_ledger_checksum_mismatch')
     await run('COMMIT')
     outcome.push({filename:script.filename,status:'already_applied'})
     continue
    }
    await run(script.sql)
    await client.query('INSERT INTO public.stall_tencent_drill_migrations(filename,sha256) VALUES($1,$2)',[script.filename,script.sha256])
    await run('COMMIT')
    outcome.push({filename:script.filename,status:'applied'})
   }catch(e){await run('ROLLBACK').catch(()=>{});throw e}
  }
  return {database:'stall_tencent_drill',applied:outcome,productionApproved:false}
 }finally{
  if(locked)await run('SELECT pg_advisory_unlock(552193, 20261109)').catch(()=>{})
 }
}
async function main(){
 const args=process.argv.slice(2)
 if(args.length>1||args.length===1&&!['--plan','--apply'].includes(args[0]))
  throw Error('usage_plan_or_apply')
 const plan=await prepareTencentDrill()
 if(args[0]!=='--apply'){
  console.log(JSON.stringify({mode:plan.mode,database:plan.database,
    sourceMigrationCount:plan.source.length,
    migrations:plan.scripts.map(({filename,sha256})=>({filename,sha256})),
    executed:false,productionApproved:false},null,2))
  return
 }
 validateDrillTarget(process.env)
 const {Client}=await import('pg')
 const client=new Client({connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000})
 try{await client.connect();const result=await applyDrill(client,plan)
  console.log(JSON.stringify(result,null,2))
 }finally{await client.end()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('TENCENT_ISOLATED_DRILL_REFUSED_OR_FAILED');process.exitCode=1})
}
