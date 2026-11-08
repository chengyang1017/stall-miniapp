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
export function quotePgIdentifier(value){
 if(typeof value!=='string'||!value||value.includes('\\0')||value.length>63)
  throw Error('invalid_catalog_identifier')
 return '"'+value.replaceAll('"','""')+'"'
}
export function inventoryDigest(rows){
 const sorted=[...rows].sort((a,b)=>a.name.localeCompare(b.name,'en'))
 if(sorted.some(x=>typeof x.name!=='string'||!Number.isSafeInteger(x.exactRows)||x.exactRows<0))
  throw Error('invalid_inventory_count')
 return digest(JSON.stringify(sorted))
}
export async function inventoryTables(db,tables){
 if(tables.length>200)throw Error('too_many_tables_for_bounded_audit')
 const output=[]
 for(const row of tables){
  const schema=quotePgIdentifier(row.schema),name=quotePgIdentifier(row.name)
  // Catalog identifiers only. Never select/serialize customer rows.
  const {rows}=await db.query('SELECT count(*)::text AS n FROM '+schema+'.'+name)
  const n=Number(rows[0]?.n)
  if(!Number.isSafeInteger(n)||n<0)throw Error('invalid_inventory_count')
  output.push({name:row.schema+'.'+row.name,exactRows:n})
 }
 return output.sort((a,b)=>a.name.localeCompare(b.name,'en'))
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
  const tables=(await db.query(`SELECT n.nspname AS schema,c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
    ORDER BY n.nspname,c.relname`)).rows
  const exactRows=await inventoryTables(db,tables)
  const objectReferences=(await db.query(`SELECT c.table_name,c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema='public'
      AND c.column_name IN ('image_object_key','object_key','storage_key','avatar_object_key')
      AND c.data_type IN ('text','character varying')
    ORDER BY c.table_name,c.column_name`)).rows
  const objectCounts=[]
  for(const item of objectReferences){
   // The catalog is authoritative, but check public table membership before counting.
   if(!tables.some(t=>t.name===item.table_name))continue
   const relation=quotePgIdentifier('public')+'.'+quotePgIdentifier(item.table_name)
   const column=quotePgIdentifier(item.column_name)
   const result=await db.query('SELECT count(*)::text AS n FROM '+relation+' WHERE '+column+' IS NOT NULL')
   const count=Number(result.rows[0]?.n)
   if(!Number.isSafeInteger(count)||count<0)throw Error('invalid_inventory_count')
   objectCounts.push({table:item.table_name,column:item.column_name,nonNullReferences:count})
  }
  const deps=(await db.query(`SELECT extname,extversion FROM pg_extension ORDER BY extname`)).rows
  const report={audit:'read_only_migration_source',sourceHostSha256:target.hostSha256,
   database:identity.database,role:identity.role,pgVersion:identity.pg_version,
   migration:compareMigrationLedger(files,ledger),
   tables:exactRows,tableCountSha256:inventoryDigest(exactRows),
   objectReferences:objectCounts,
   extensions:deps,
   warnings:['Table counts are exact only for this read-only snapshot; repeat on target after cutover write freeze. Counts alone cannot prove row-level fidelity.',
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
