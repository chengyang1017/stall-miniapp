// Offline comparison of two READ-ONLY inventory reports, not a restore or deployment.
// No database, network, credentials, or merchant data access.
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const hash=rows=>createHash('sha256').update(JSON.stringify([...rows].sort((a,b)=>a.name.localeCompare(b.name,'en')))).digest('hex')
const die=()=>{throw Error('invalid_migration_inventory')}
const cleanString=(s,max=180)=>typeof s==='string'&&s.length>0&&s.length<=max&&!/[\u0000-\u001f]/.test(s)
function normalized(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.audit!=='read_only_migration_source'||
  !cleanString(input.database)||!cleanString(input.pgVersion)||!Array.isArray(input.tables)||
  !Array.isArray(input.objectReferences)||!Array.isArray(input.extensions)||!input.migration||
  typeof input.migration!=='object'||!Array.isArray(input.migration.missing)||
  !Array.isArray(input.migration.issues)||!Number.isSafeInteger(input.migration.applied)||
  !Number.isSafeInteger(input.migration.expected)||typeof input.tableCountSha256!=='string')die()
 if(input.tables.length>200||input.objectReferences.length>200||input.extensions.length>100)die()
 const names=new Set(),tables=[]
 for(const row of input.tables){
  if(!row||!cleanString(row.name)||!/^public\.[^\u0000-\u001f]+$/.test(row.name)||
   !Number.isSafeInteger(row.exactRows)||row.exactRows<0||names.has(row.name))die()
  names.add(row.name);tables.push({name:row.name,exactRows:row.exactRows})
 }
 if(hash(tables)!==input.tableCountSha256)die()
 const refs=new Map()
 for(const ref of input.objectReferences){
  if(!ref||!cleanString(ref.table)||!cleanString(ref.column)||!Number.isSafeInteger(ref.nonNullReferences)||
   ref.nonNullReferences<0||!names.has('public.'+ref.table))die()
  const key=ref.table+'.'+ref.column
  if(refs.has(key))die()
  refs.set(key,ref.nonNullReferences)
 }
 const extensionNames=new Map()
 for(const ex of input.extensions){
  if(!ex||!cleanString(ex.extname)||!cleanString(ex.extversion)||extensionNames.has(ex.extname))die()
  extensionNames.set(ex.extname,ex.extversion)
 }
 if(input.migration.applied<0||input.migration.expected<0||input.migration.applied>200||
    input.migration.expected>200||typeof input.migration.cleanPrefix!=='boolean'||
    input.migration.missing.some(x=>!cleanString(x))||
    input.migration.issues.some(x=>!x||!cleanString(x.kind)))die()
 return {database:input.database,majorVersion:Number(input.pgVersion.split('.')[0]),
  tables:new Map(tables.map(x=>[x.name,x.exactRows])),
  refs,extensions:extensionNames,migration:input.migration,tableCountSha256:input.tableCountSha256}
}
export function compareRestoredInventories(source,target){
 const a=normalized(source),b=normalized(target),problems=[]
 if(a.database!==b.database)problems.push({kind:'database_name_mismatch',source:a.database,target:b.database})
 if(!Number.isInteger(a.majorVersion)||!Number.isInteger(b.majorVersion)||a.majorVersion!==b.majorVersion)
  problems.push({kind:'postgres_major_version_mismatch',source:a.majorVersion,target:b.majorVersion})
 for(const [name,n] of a.tables){
  if(!b.tables.has(name))problems.push({kind:'missing_target_table',table:name})
  else if(b.tables.get(name)!==n)problems.push({kind:'table_count_mismatch',table:name,source:n,target:b.tables.get(name)})
 }
 for(const name of b.tables.keys())if(!a.tables.has(name))problems.push({kind:'extra_target_table',table:name})
 for(const [name,n] of a.refs){
  if(!b.refs.has(name))problems.push({kind:'missing_target_object_reference',column:name})
  else if(b.refs.get(name)!==n)problems.push({kind:'object_reference_count_mismatch',column:name,source:n,target:b.refs.get(name)})
 }
 for(const name of b.refs.keys())if(!a.refs.has(name))problems.push({kind:'extra_target_object_reference',column:name})
 for(const [name,v] of a.extensions){
  if(!b.extensions.has(name))problems.push({kind:'missing_target_extension',extension:name})
  else if(b.extensions.get(name)!==v)problems.push({kind:'extension_version_mismatch',extension:name,source:v,target:b.extensions.get(name)})
 }
 for(const name of b.extensions.keys())if(!a.extensions.has(name))problems.push({kind:'extra_target_extension',extension:name})
 if(a.migration.applied!==b.migration.applied||
    JSON.stringify(a.migration.missing)!==JSON.stringify(b.migration.missing)||
    JSON.stringify(a.migration.issues)!==JSON.stringify(b.migration.issues)||
    a.migration.cleanPrefix!==b.migration.cleanPrefix)
  problems.push({kind:'migration_ledger_summary_mismatch',
   sourceApplied:a.migration.applied,targetApplied:b.migration.applied})
 return {comparison:'pre_migration_restored_database',passed:problems.length===0,
  sourceTables:a.tables.size,targetTables:b.tables.size,sourceCountDigest:a.tableCountSha256,
  targetCountDigest:b.tableCountSha256,problems,
  limitations:['Counts do not establish equality of individual rows, foreign keys or payment evidence.',
   'Reports must be captured from a consistent source backup and initial restore BEFORE applying new migrations.',
   'Object reference counts do not prove the R2/S3 files exist or match.',
   'A passing comparison does not authorize production cutover or activation of live payment.']}
}
async function main(){
 const [sourcePath,targetPath,...extra]=process.argv.slice(2)
 if(!sourcePath||!targetPath||extra.length)throw Error('usage_source_json_target_json')
 const read=async p=>{
  const bytes=await readFile(p)
  if(bytes.length>300000)die()
  try{return JSON.parse(bytes.toString('utf8'))}catch{die()}
 }
 const result=compareRestoredInventories(await read(sourcePath),await read(targetPath))
 console.log(JSON.stringify(result,null,2))
 if(!result.passed)process.exitCode=2
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('INVALID_OR_UNREADABLE_AUDIT_REPORT');process.exitCode=1})
}
