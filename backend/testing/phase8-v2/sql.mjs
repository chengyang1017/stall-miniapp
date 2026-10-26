// Real pg seam; no pg import or connection at module load. Observer never exposes a Pool.
import { check,V2 } from './policy.mjs'
import { pgOptions,grant } from './grants.mjs'
import { guardedPool } from '../phase8/leases.mjs'
import { assertIdentity,assertMarker,assertLedger } from '../phase8/policy.mjs'
import { inspectCatalog,assertBaseline } from '../phase8/schema.mjs'
export const IDENTITY=`SELECT current_database() AS database_name,current_user AS current_role,session_user AS session_role,
 pg_get_userbyid(d.datdba) AS database_owner,current_setting('server_version_num')::int AS server_version,inet_server_port() AS server_port,
 current_setting('transaction_read_only') AS read_only,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolcanlogin,
 has_database_privilege(current_user,current_database(),'CREATE') AS database_create,has_schema_privilege(current_user,'public','CREATE') AS public_create,
 (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
 FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`
export const MARKER=`SELECT i.instance_id::text,i.schema_state,i.manifest_sha256,i.schema_sha256,pg_get_userbyid(c.relowner) AS owner
 FROM phase8_control.instance i JOIN pg_class c ON c.oid='phase8_control.instance'::regclass`
export const BOOTSTRAP=`SELECT
 (SELECT count(*)::int FROM pg_class WHERE relnamespace='public'::regnamespace)+(SELECT count(*)::int FROM pg_proc WHERE pronamespace='public'::regnamespace)+(SELECT count(*)::int FROM pg_type WHERE typnamespace='public'::regnamespace) AS business_objects,
 (SELECT count(*)::int FROM pg_namespace WHERE nspname NOT IN ('public','information_schema','phase8_control') AND nspname NOT LIKE 'pg_%') AS extra_schemas,
 (SELECT array_agg(relname::text ORDER BY relname) FROM pg_class WHERE relnamespace='phase8_control'::regnamespace AND relkind IN ('r','v','m','p','f')) AS controls,
 has_schema_privilege('stall_test_observer','public','CREATE') OR has_schema_privilege('stall_test_observer','phase8_control','CREATE') OR
 has_table_privilege('stall_test_observer','phase8_control.instance','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
 has_any_column_privilege('stall_test_observer','phase8_control.instance','INSERT,UPDATE,REFERENCES') OR
 has_database_privilege('stall_test_observer',current_database(),'TEMPORARY,CREATE') AS observer_write,
 has_schema_privilege('stall_test_app','public','CREATE') OR has_schema_privilege('stall_test_app','phase8_control','CREATE') OR
 has_table_privilege('stall_test_app','phase8_control.instance','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
 has_any_column_privilege('stall_test_app','phase8_control.instance','INSERT,UPDATE,REFERENCES') OR
 has_database_privilege('stall_test_app',current_database(),'TEMPORARY,CREATE') AS app_write,
 has_column_privilege('stall_test_migrator','phase8_control.instance','instance_id','UPDATE') AS migrator_identity_write`
export const ROLES=`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin,
 (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
 FROM pg_roles r WHERE rolname IN ('stall_test_observer','stall_test_app','stall_test_migrator') ORDER BY rolname`
export function bootstrapRows(row,roles) {
  check(row?.business_objects===0&&row.extra_schemas===0&&JSON.stringify(row.controls)===JSON.stringify(['instance'])&&
    row.observer_write===false&&row.app_write===false&&row.migrator_identity_write===false,'bootstrap_objects_or_acl_rejected')
  check(roles.length===3&&roles.map(r=>r.rolname).sort().join()===['stall_test_app','stall_test_migrator','stall_test_observer'].join()&&
    roles.every(r=>r.rolcanlogin===true&&r.memberships===0&&[r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls].every(v=>v===false)),'bootstrap_roles_rejected')
}
export async function verifySQL(client,g,migrations,state) {
  const config={instance:g.instance,role:g.role,purpose:g.role==='observer'?'inspect':g.role==='app'?'test':'initialize',pg:{user:'stall_test_'+g.role}}
  assertIdentity((await client.query(IDENTITY)).rows[0],config)
  const rows=(await client.query(MARKER)).rows
  assertMarker(rows,config,state,migrations.manifestHash)
  if(state==='bootstrap') {
    check(rows[0].schema_sha256===null,'bootstrap_marker_rejected')
    bootstrapRows((await client.query(BOOTSTRAP)).rows[0],(await client.query(ROLES)).rows)
  }else{
    assertLedger((await client.query('SELECT filename,sha256 FROM phase8_control.migrations ORDER BY filename')).rows,migrations.files)
    const actual=await inspectCatalog(client),stored=(await client.query('SELECT catalog FROM phase8_control.schema_baseline WHERE singleton=true')).rows
    check(stored.length===1,'schema_rejected');assertBaseline(actual,stored[0].catalog,rows[0].schema_sha256)
  }
}
export async function openSQL(g,password,migrations,{makePool,now=Date.now,onPool=()=>{}}={}) {
  grant(g,now())
  const opts=pgOptions(g,password)
  const factory=makePool||((await import('pg')).Pool)
  const raw=new factory(opts);raw.on?.('error',()=>{})
  const pool=guardedPool(raw,async c=>{check(now()<=g.deadlineAt,'runtime_expired');await verifySQL(c,g,migrations,g.purpose==='bootstrap'||g.purpose==='initialize'?'bootstrap':'ready')})
  onPool(pool)
  try{const c=await pool.connect();c.release()}catch(e){await pool.end();throw e}
  return pool
}
export async function inspectBootstrap(pool,g,migrations) {
  check(g.purpose==='bootstrap'&&g.role==='observer','bootstrap_role_rejected')
  const c=await pool.connect()
  try {await c.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');await verifySQL(c,g,migrations,'bootstrap');await c.query('ROLLBACK');return {status:'bootstrap_verified',ready:false}}
  catch(e){try{await c.query('ROLLBACK')}catch{}throw e}
  finally{c.release()}
}
