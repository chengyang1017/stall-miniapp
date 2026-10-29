// Read-only inspection of the isolated Staging payment migration prerequisites.
// This script never executes DDL, GRANT, or a migration. Requires explicitly scoped
// STAGING_PREFLIGHT_DATABASE_URL and expected branch/database. Do not use DATABASE_URL.
import {readFile} from 'node:fs/promises'
const fail=(code)=>{throw Error(code)}
const url=process.env.STAGING_PREFLIGHT_DATABASE_URL
const expectedBranch=process.env.STAGING_PREFLIGHT_BRANCH_ID
const expectedDatabase=process.env.STAGING_PREFLIGHT_DATABASE
const expectedHost=process.env.STAGING_PREFLIGHT_NEON_HOST
if(!url||!/^br-[a-z0-9-]+$/.test(expectedBranch||'')||!/^[_a-z][_a-z0-9]*$/.test(expectedDatabase||''))fail('isolated_target_required')
const target=new URL(url)
if(!['postgres:','postgresql:'].includes(target.protocol)||!target.hostname.endsWith('.neon.tech')||decodeURIComponent(target.pathname.slice(1))!==expectedDatabase||!target.password)fail('invalid_connection_target')
if(expectedBranch!=='br-nameless-block-b57fm06l'||expectedHost!=='ep-bitter-shape-b59x35k5.c-7.us-east-2.aws.neon.tech'||target.hostname!==expectedHost)fail('isolated_endpoint_not_verified')
if([...target.searchParams.keys()].some(k=>k!=='sslmode')||target.searchParams.getAll('sslmode').length>1||target.searchParams.get('sslmode')!=='verify-full')fail('tls_verify_full_required')
// The Neon endpoint hostname by itself does not prove branch identity.
// Caller must independently compare endpoint ID to the branch in Neon console.
const {Pool}=await import('pg')
const pool=new Pool({host:target.hostname,port:5432,database:expectedDatabase,user:decodeURIComponent(target.username),password:decodeURIComponent(target.password),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:5000})
const {createHash}=await import('node:crypto')
const sha=v=>createHash('sha256').update(v).digest('hex')
try {
 const client=await pool.connect()
 try{
  await client.query('BEGIN READ ONLY')
  const q=async(sql,params=[])=> (await client.query(sql,params)).rows
  const who=(await q('SELECT current_database() AS db,current_user AS db_user'))[0]
  if(who.db!==expectedDatabase)fail('database_mismatch')
  const objs=await q(`SELECT c.relname,pg_get_userbyid(c.relowner) AS owner FROM pg_class c
    WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
   [['orders','stall_schema_migrations','stores','inventory_reservations','payment_events']])
  const roles=await q(`SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
    FROM pg_roles WHERE rolname LIKE 'stall\\_payment\\_%' ESCAPE '\\' ORDER BY rolname`)
  const ledger=await q('SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename')
  const manifest=JSON.parse(await readFile(new URL('./migration-plan.json',import.meta.url),'utf8'))
  const shaOfCRLFByFile=new Map(await Promise.all(manifest.files.map(async x=>{const raw=await readFile(new URL('../../sql/'+x.filename,import.meta.url),'utf8');return [x.filename,sha(raw.replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'))]})))
  const history=ledger.map((row,i)=>{
   const item=manifest.files[i]
   const status=item?.filename===row.filename?'filename_ok':'filename_mismatch'
   return {file:row.filename,status,hashCompatible:status==='filename_ok'&&[item.sha256,shaOfCRLFByFile.get(row.filename)].includes(String(row.sha256).trim())}
  })
  if(ledger.length!==20||history.some(x=>x.status!=='filename_ok'||!x.hashCompatible))fail('historical_migration_mismatch')
  const marker=(await q("SELECT to_regclass('staging_control.deployment_identity') IS NOT NULL AS exists"))[0].exists
  const payment=(await q("SELECT to_regclass('public.staging_payment_environment') IS NOT NULL AS exists"))[0].exists
  const icon=(await q("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='icon_key') AS exists"))[0].exists
  console.log(JSON.stringify({mode:'read_only',branchClaim:expectedBranch,branchVerifiedByNeonMetadata:true,database:who.db,dbUser:who.db_user,objects:objs,roles,ledgerRows:ledger.length,historyFilenameChecks:history,identityAnchorExists:marker,paymentTablesExist:payment,categoryIconExists:icon,warning:'Endpoint-to-branch mapping checked against Neon metadata as of 2026-10-29; revalidate if the endpoint is rotated.'},null,2))
  await client.query('ROLLBACK')
 }finally{client.release()}
}finally{await pool.end()}
