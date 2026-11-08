// Read-only inventory of an explicitly approved PostgreSQL source before migration.
// Never runs DDL, exports user data, copies credentials or writes to any database.
import {Pool} from 'pg'
import {readFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const digest=x=>createHash('sha256').update(x).digest('hex')
export function migrationTarget(raw,expectedHost){
 if(!raw||!expectedHost)throw Error('database_url_and_expected_host_required')
 let url
 try{url=new URL(raw)}catch{throw Error('invalid_database_url')}
 if(!['postgres:','postgresql:'].includes(url.protocol)||
   !url.hostname||!url.username||!url.password||!url.pathname||url.pathname==='/'||
   url.searchParams.has('password')||url.hash)throw Error('invalid_database_url')
 if(url.hostname.toLowerCase()!==expectedHost.toLowerCase())throw Error('source_host_mismatch')
 return {host:url.hostname,database:decodeURIComponent(url.pathname.slice(1)),
  user:decodeURIComponent(url.username),hostSha256:digest(url.hostname).slice(0,16)}
}
export function compareMigrationLedger(files,rows){
 const expected=new Map(files.map(({filename,sha256})=>[filename,sha256]))
 const current=new Map()
 const issues=[]
 for(const row of rows){
  if(current.has(row.filename))issues.push({kind:'duplicate',filename:row.filename})
  current.set(row.filename,row.sha256)
  if(!expected.has(row.filename))issues.push({kind:'unknown',filename:row.filename})
  else if(expected.get(row.filename)!==row.sha256)issues.push({kind:'checksum_mismatch',filename:row.filename})
 }
 const missing=files.filter(({filename})=>!current.has(filename)).map(x=>x.filename)
 const installedPrefix=files.slice(0,rows.length).every(x=>current.has(x.filename))&&
  !issues.length&&rows.length<=files.length
 return {applied:current.size,expected:files.length,missing,issues,
   cleanPrefix:installedPrefix,readyForLatest:installedPrefix&&missing.length===0}
}
async function main(){
 if(process.env.MIGRATION_SOURCE_READ_ONLY_AUDIT!=='YES')
  throw Error('Set MIGRATION_SOURCE_READ_ONLY_AUDIT=YES to authorize read-only audit')
 const target=migrationTarget(process.env.DATABASE_URL,process.env.MIGRATION_EXPECTED_DB_HOST)
 if(process.env.PG_SSL!=='true')throw Error('PG_SSL=true_required_for_audit')
 const sqlDir=fileURLToPath(new URL('../sql/',import.meta.url))
 const names=(await readdir(sqlDir)).filter(n=>n.endsWith('.sql')).sort()
 if(names.length!==37||names.some((n,i)=>!new RegExp('^'+String(i+1).padStart(3,'0')+'_[a-z0-9_]+\\.sql$').test(n)))
  throw Error('expected_001_to_037_migrations')
 const files=await Promise.all(names.map(async filename=>({
  filename,sha256:digest(await readFile(path.join(sqlDir,filename)))
 })))
 const pool=new Pool({connectionString:process.env.DATABASE_URL,
  ssl:{rejectUnauthorized:true},connectionTimeoutMillis:5000,max:1})
 let db,open=false
 try{
  db=await pool.connect()
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');open=true
  await db.query("SET LOCAL statement_timeout='5000ms'")
  await db.query("SET LOCAL lock_timeout='1500ms'")
  const identity=(await db.query(`SELECT current_database() AS database,
   current_user AS role,inet_server_addr()::text AS server_ip,
   current_setting('server_version') AS pg_version`)).rows[0]
  if(identity.database!==target.database||identity.role!==target.user)
   throw Error('database_or_role_mismatch')
  const ledgerPresent=(await db.query(`SELECT to_regclass('public.stall_schema_migrations') IS NOT NULL AS found`)).rows[0].found
  if(!ledgerPresent)throw Error('migration_ledger_missing_no_changes_made')
  const ledger=(await db.query(`SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename`)).rows
  const tables=(await db.query(`SELECT c.oid::regclass::text AS relation,
    c.reltuples::bigint AS estimated_rows
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
    ORDER BY c.oid::regclass::text`)).rows
  const deps=(await db.query(`SELECT extname,extversion FROM pg_extension ORDER BY extname`)).rows
  const report={audit:'read_only_migration_source',sourceHostSha256:target.hostSha256,
   database:identity.database,role:identity.role,pgVersion:identity.pg_version,
   migration:compareMigrationLedger(files,ledger),
   tables:tables.map(x=>({name:x.relation,estimatedRows:Number(x.estimated_rows)})),
   extensions:deps,
   warnings:['Estimated table rows are NOT exact counts; verify backup/restore with row counts and constraints.',
    'This audit does not export database bytes, passwords, S3 objects, Render environment settings or external integration secrets.',
    'Do not run migrate-dev.mjs on a remote database; get explicit approval for a separate production migration.']}
  await db.query('COMMIT');open=false
  console.log(JSON.stringify(report,null,2))
  if(!report.migration.cleanPrefix)process.exitCode=2
 }finally{
  if(open)await db.query('ROLLBACK').catch(()=>{})
  db?.release()
  await pool.end()
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(error=>{console.error('AUDIT_FAILED '+String(error?.message||'unknown').replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi,'$1[REDACTED]').slice(0,180));process.exitCode=1})
}
