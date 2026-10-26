// Real pg boundary. Import is inert: no Pool creation, subprocess or connection.
// Every access goes through explicit authorization + Docker + SQL identity checks.
import { readFile } from 'node:fs/promises'
import { accessConfig, assertResources, assertIdentity, assertMarker, assertLedger, requireSafe, TARGET } from './policy.mjs'
import { loadMigrations } from './migrations.mjs'
import { createDocker } from './docker.mjs'
import { readReceipt } from './receipts.mjs'
import { guardedPool } from './leases.mjs'
import { inspectCatalog,assertBaseline } from './schema.mjs'
export const loadImageApproval = async () => JSON.parse(await readFile(new URL('./image-approval.json',import.meta.url),'utf8'))
export const IDENTITY_SQL = `SELECT current_database() AS database_name,current_user AS current_role,session_user AS session_role,
  pg_get_userbyid(d.datdba) AS database_owner,current_setting('server_version_num')::int AS server_version,inet_server_port() AS server_port,current_setting('transaction_read_only') AS read_only,
  r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolcanlogin,
  has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
  has_schema_privilege(current_user,'public','CREATE') AS public_create,
  (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
  FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`
export const MARKER_SQL = `SELECT i.instance_id::text,i.schema_state,i.manifest_sha256,i.schema_sha256,pg_get_userbyid(c.relowner) AS owner
  FROM phase8_control.instance i JOIN pg_class c ON c.oid='phase8_control.instance'::regclass`
export async function attestResources(config,env,approval) {
  const receipt=await readReceipt(env,config), docker=createDocker(env)
  const bound=await docker.bind()
  requireSafe(bound.endpoint===receipt.endpoint && bound.name===receipt.context,'phase8_docker_context_changed')
  const resources=await docker.inspectAll()
  requireSafe(resources[0].Id===receipt.containerId,'phase8_receipt_identity_rejected')
  assertResources(...resources,config.instance,{approval,nonce:receipt.nonce})
}
export async function verifyConnection(client,config,migrations,state) {
  assertIdentity((await client.query(IDENTITY_SQL)).rows[0],config)
  const marker=(await client.query(MARKER_SQL)).rows
  assertMarker(marker,config,state,migrations.manifestHash)
  if(state==='ready'){
    assertLedger((await client.query('SELECT filename,sha256 FROM phase8_control.migrations ORDER BY filename')).rows,migrations.files)
    const actual=await inspectCatalog(client), stored=(await client.query('SELECT catalog FROM phase8_control.schema_baseline WHERE singleton=true')).rows
    requireSafe(stored.length===1,'phase8_schema_drift');assertBaseline(actual,stored[0].catalog,marker[0].schema_sha256)
  }
}
async function openChecked(env,{role,purpose,state},approval) {
  const config = accessConfig(env,role,purpose,approval)
  requireSafe(state==='ready'&&purpose!=='initialize'||state==='bootstrap'&&purpose==='initialize','phase8_invalid_access_state')
  const migrations = await loadMigrations() // Hash/transaction review happens before any connection.
  await attestResources(config,env,approval)
  const { Pool } = await import('pg')
  const pool = new Pool(config.pg)
  pool.on('error', () => {})
  const facade=guardedPool(pool,client=>verifyConnection(client,config,migrations,state))
  try { const client = await facade.connect(); client.release() } catch (error) { await facade.end(); throw error }
  return { pool: facade, config, migrations }
}
export async function openVerifiedPool(env,{role='observer',purpose='inspect',state='ready'}={}) {
  requireSafe(env.STALL_PHASE8_AUTHORIZE==='LOCAL_PHASE8_DATABASE_ACCESS','phase8_access_not_authorized')
  requireSafe(purpose!=='inspect','phase8_inspect_pool_not_exposed')
  const approval=await loadImageApproval()
  accessConfig(env,role,purpose,approval)
  return openChecked(env,{role,purpose,state},approval)
}
export async function inspectReady(env) {
  const approval=await loadImageApproval(), {pool}=await openChecked(env,{role:'observer',purpose:'inspect',state:'ready'},approval)
  try{return {ready:true,database:TARGET.database,role:'stall_test_observer'}}finally{await pool.end()}
}
