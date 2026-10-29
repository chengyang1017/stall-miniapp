// Policy/transaction orchestration with synthetic transports. No PostgreSQL or Docker I/O.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {runtimeDeployment,approvedProfile,assertDatabaseIdentity,parsedDatabase} from '../src/stagingDeployment.mjs'
import {permissionPlan,inspectRuntimePrivileges} from '../src/stagingPermissions.mjs'
import {loadPlan,run021,catalogDigest,CATALOG_SQL} from '../testing/staging/migration.mjs'
import {environment as env,profile,registry} from './helpers/staging-profile.mjs'
import {stagingPaymentRoute} from '../src/stagingPayments.mjs'
import {localTestTarget} from '../testing/staging/postgres-target.mjs'
const plan=await loadPlan()
test('NODE_ENV production is a runtime mode, not the reviewed deployment identity',()=>{assert.equal(runtimeDeployment(env,registry)?.instanceId,profile.instanceId);assert.equal(runtimeDeployment({...env,NODE_ENV:'development'},registry)?.instanceId,profile.instanceId)})
for(const [name,patch] of Object.entries({production:{APP_ENV:'production'},missing:{APP_ENV:''},forgedAPP:{STAGING_DEPLOYMENT_ID:''},wrongService:{RENDER_SERVICE_ID:'srv-prod'},notRender:{RENDER:'false'},wrongInstance:{STAGING_PAYMENT_INSTANCE_ID:profile.deploymentId},wrongDatabase:{DATABASE_URL:env.DATABASE_URL.replace(profile.database,'production')},wrongHost:{DATABASE_URL:env.DATABASE_URL.replace(profile.applicationHost,'ep-production.unit.neon.tech')},wrongRole:{DATABASE_URL:env.DATABASE_URL.replace('unit_app:','unit_migrator:')},libpq:{PGOPTIONS:'-c search_path=attacker'},disabled:{STAGING_SIMULATED_PAYMENTS:''}}))test('deployment refuses '+name,()=>assert.equal(runtimeDeployment({...env,...patch},registry),null))
test('environment variables cannot approve an empty/duplicate/unreviewed source registry',()=>{assert.equal(runtimeDeployment(env),null);assert.equal(approvedProfile(profile.deploymentId,{version:1,deployments:[profile,profile]}),null);assert.equal(runtimeDeployment(env,{version:1,deployments:[{...profile,approved:false}]}),null)})
test('rejected deployment never reaches authentication or pool connect',async()=>{let calls=0;const r={writeHead(code){this.code=code},end(){}};await stagingPaymentRoute({method:'POST'},r,new URL('http://unit.invalid/v1/stores/alpha/orders/11111111-1111-4111-8111-111111111111/staging-payment'),{query(){calls++},connect(){calls++}},{...env,APP_ENV:'production'},registry);assert.equal(r.code,404);assert.equal(calls,0)})
test('TLS options and role are explicit and cannot be overridden by connection query',()=>{const p=parsedDatabase(env.DATABASE_URL,profile);assert.equal(p.ssl.rejectUnauthorized,true);assert.equal(p.connectionString,undefined);assert.equal(parsedDatabase(env.DATABASE_URL+'&options=anything',profile),null);assert.equal(parsedDatabase(env.DATABASE_URL.replace('verify-full','disable'),profile),null)})
test('wrong database marker/branch rejects instead of accepting env declarations',async()=>{await assert.rejects(()=>assertDatabaseIdentity({query:async(sql,args)=>{assert.match(sql,/branch_id=\$3/);assert.deepEqual(args,[profile.deploymentId,profile.instanceId,profile.branchId,profile.database]);return {rows:[]}}},profile),{message:'staging_database_identity_rejected'})})
test('permission plan isolates administrator and grants only constant lock columns to app',()=>{const sql=permissionPlan(profile).join('\n');assert.doesNotMatch(sql,/GRANT ALL|CREATE ROLE|SUPERUSER|BYPASSRLS/);assert.match(sql,/GRANT UPDATE\(lock_key\) ON staging_payment_environment,staging_payment_testers/);assert.match(sql,/UPDATE\(expires_at,revoked_at\).*unit_authorizer/);assert.doesNotMatch(sql,/UPDATE\(expires_at,revoked_at\).*unit_app/);assert.throws(()=>permissionPlan({...profile,authorizationRole:profile.applicationRole}),/distinct_catalog_verified_roles_required/)})
function permissionReply(sql,args){
 if(sql.startsWith('SELECT count(*)::int AS count,bool_or'))return {rows:[{count:3,unsafe:false}]}
 if(sql.startsWith('SELECT r.rolsuper'))return {rows:[{rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false,migrator_member:false,authorization_member:false,schema_create:false,control_schema_create:false,owns_tables:false}]}
 if(sql.startsWith('SELECT has_any_column_privilege'))return {rows:[{unsafe:false}]}
 if(sql.startsWith('SELECT has_table_privilege'))return {rows:[{ok:['SELECT','INSERT'].includes(args[1])}]}
 if(sql.startsWith('SELECT a.attname,has_column_privilege'))return {rows:[{attname:'lock_key',writable:true},{attname:'expires_at',writable:false}]}
 return null
}
for(const danger of ['superuser','owner','grant-write','column-write'])test('effective privilege probe rejects '+danger,async()=>{
 const db={async query(sql,args){const r=permissionReply(sql,args);assert.ok(r,sql);if(danger==='superuser'&&sql.startsWith('SELECT count'))r.rows[0].unsafe=true;if(danger==='owner'&&sql.startsWith('SELECT r.'))r.rows[0].owns_tables=true;if(danger==='grant-write'&&sql.startsWith('SELECT has_table')&&args[1].includes('DELETE'))r.rows[0].ok=true;if(danger==='column-write'&&sql.startsWith('SELECT a.'))r.rows[1].writable=true;return r}}
 await assert.rejects(()=>inspectRuntimePrivileges(db,profile),/staging_.*(?:required|privilege)/)
})
function transport(fault=''){
 const pre=[{kind:'table',name:'baseline',detail:{owner:'unit_migrator'}},
 ...[
 ['orders.orders_inventory_store_id','UNIQUE (store_id, id)'],
 ['inventory_reservations.inventory_reservations_store_id_order_id_fkey','FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id)'],
 ['inventory_reservations.inventory_reservations_store_id_product_id_fkey','FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id)'],
 ['payment_events.payment_events_provider_provider_event_id_key','UNIQUE (provider, provider_event_id)'],
 ['products.products_stock_quantity_check','CHECK ((stock_quantity >= 0) AND (stock_quantity <= 1000000))']].map(([name,definition])=>({kind:'constraint',name,detail:{definition,validated:true}})),
 ...['orders_checkout_retry_unique','inventory_expiring_orders','orders_customer_cursor'].map(name=>({kind:'index',name,detail:{valid:true,ready:true}})),
 ...['inventory_movements.inventory_movements_no_rewrite','orders.track_proof_image','order_items.order_item_category_snapshot','orders.end_order_tracking_on_status'].map(name=>({kind:'trigger',name,detail:{enabled:'O'}}))],post=[...pre,{kind:'table',name:'staging_payment_confirmations',detail:{owner:'unit_migrator'}}]
 const p={...profile,pre021CatalogSha256:catalogDigest(pre)}
 let saved={ledger:plan.files.slice(0,20).map(f=>({filename:f.filename,sha256:f.sha256})),audit:[],catalog:pre},tx=null,released=[],trace=[],fired=false
 const c={release:d=>released.push(d),async query(sql,args=[]){trace.push({sql,args});
  if(!fired&&(fault==='ddl'&&sql===plan.files[20].body||fault==='ledger'&&sql.startsWith('INSERT INTO public.stall_schema_migrations')||fault==='audit'&&sql.startsWith('INSERT INTO public.staging_payment_migration_audits'))){fired=true;throw Object.assign(Error('injected SQL failure'),{code:'XX000'})}
  if(sql==='BEGIN'){tx=structuredClone(saved);return {rows:[]}}
  if(sql==='ROLLBACK'){tx=null;return {rows:[]}}
  if(sql==='COMMIT'){saved=tx;tx=null;if(fault==='commit'&&!fired){fired=true;throw Object.assign(Error('acknowledgement lost'),{code:'08006'})}return {rows:[],command:'COMMIT'}}
  if(sql.startsWith('SELECT set_config')||sql.startsWith('LOCK TABLE'))return {rows:[]}
  if(sql.startsWith('SELECT deployment_id'))return {rows:fault==='identity'?[]:[{deployment_id:p.deploymentId}]}
  if(sql==='SELECT current_user AS role,current_database() AS database')return {rows:[{role:fault==='role'?'wrong_role':p.migratorRole,database:p.database}]}
  if(sql.startsWith('SELECT pg_try_advisory'))return {rows:[{acquired:fault!=='concurrent'}]}
  if(sql.includes("to_regclass('public.stall_schema_migrations')"))return {rows:[{present:fault!=='missing-ledger'}]}
  if(sql==='SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename')return {rows:fault==='history'?tx.ledger.slice(1):tx.ledger}
  if(sql===CATALOG_SQL)return {rows:fault==='drift'?[...tx.catalog,{kind:'changed'}]:fault==='constraint'?tx.catalog.filter(r=>r.kind!=='constraint'):tx.catalog}
  if(sql===plan.files[20].body){tx.catalog=post;return {rows:[]}}
  if(/^(GRANT|REVOKE)/.test(sql))return {rows:[]}
  const perm=permissionReply(sql,args);if(perm){if(fault==='permissions'&&sql.startsWith('SELECT has_table_privilege')&&args[1]==='SELECT')perm.rows[0].ok=false;if(fault==='unsafe-role'&&sql.startsWith('SELECT count'))perm.rows[0].unsafe=true;return perm}
  if(sql.startsWith('INSERT INTO public.stall_schema_migrations')){tx.ledger.push({filename:args[0],sha256:args[1]});return {rows:[],rowCount:1}}
  if(sql.startsWith('INSERT INTO public.staging_payment_migration_audits')){tx.audit.push({filename:args[0],sha256:args[1],deployment_id:args[2],instance_id:args[3],branch_id:args[4],pre_catalog_sha256:args[5],post_catalog_sha256:args[6]});return {rows:[],rowCount:1}}
  if(sql.startsWith('SELECT * FROM public.staging_payment_migration_audits'))return {rows:tx.audit}
  assert.fail('Unexpected transport SQL: '+sql)
 }}
 return {c,p,trace,released,state:()=>saved}
}
test('21 pinned files strip transaction wrappers without splitting function bodies',()=>{assert.equal(plan.files.length,21);assert.doesNotMatch(plan.files[20].body,/^BEGIN;|\nCOMMIT;/);assert.match(plan.files[8].body,/CREATE FUNCTION[\s\S]*BEGIN[\s\S]*END;/);assert.match(plan.files[20].body,/CHECK\(lock_key\)/)})
test('DDL, permissions, ledger and audit commit exactly once with parameterized identity',async()=>{const f=transport();const r=await run021(f.c,plan,f.p);assert.equal(r.status,'applied');assert.equal(f.state().ledger.length,21);assert.equal(f.state().audit.length,1);const index=f.trace.findIndex(x=>x.sql===plan.files[20].body);assert.ok(f.trace.slice(0,index).some(x=>x.sql===CATALOG_SQL));assert.ok(f.trace.slice(0,index).some(x=>x.sql.startsWith('LOCK TABLE public.orders')));assert.deepEqual(f.trace.find(x=>x.sql.startsWith('INSERT INTO public.stall_schema')).args,[plan.files[20].filename,plan.files[20].sha256]);assert.ok(f.trace.some(x=>x.sql==='SELECT set_config($1,$2,true)'&&x.args[0]==='lock_timeout'));assert.equal(f.released[0],false)})
for(const fault of ['identity','role','unsafe-role','concurrent','missing-ledger','history','constraint','drift'])test('migration refuses '+fault+' BEFORE DDL',async()=>{const f=transport(fault);await assert.rejects(()=>run021(f.c,plan,f.p));assert.equal(f.trace.some(x=>x.sql===plan.files[20].body),false);assert.equal(f.state().ledger.length,20)})
for(const fault of ['ddl','permissions','ledger','audit'])test('transaction failure at '+fault+' leaves neither DDL nor ledger committed (model)',async()=>{const f=transport(fault);await assert.rejects(()=>run021(f.c,plan,f.p));assert.equal(f.state().ledger.length,20);assert.equal(f.state().catalog.some(r=>r.name==='staging_payment_confirmations'),false);assert.equal(f.state().audit.length,0);assert.equal(f.trace.at(-1).sql,'ROLLBACK')})
test('successful re-run attests ledger and schema without reapplying DDL',async()=>{const f=transport();await run021(f.c,plan,f.p);const before=f.trace.length;assert.equal((await run021(f.c,plan,f.p)).status,'already_verified');assert.ok(f.trace.slice(before).every(x=>x.sql!==plan.files[20].body))})

test('migration creates unqualified objects in public and bounds waits before DDL',async()=>{
 const f=transport();await run021(f.c,plan,f.p)
 const ddl=f.trace.findIndex(x=>x.sql===plan.files[20].body)
 for(const pair of [['search_path','public, pg_catalog'],['lock_timeout','3000ms'],['statement_timeout','30000ms']])assert.ok(f.trace.slice(0,ddl).some(x=>x.sql==='SELECT set_config($1,$2,true)'&&JSON.stringify(x.args)===JSON.stringify(pair)))
})
test('unknown COMMIT result destroys client and can only be reconciled by reattestation',async()=>{const f=transport('commit');await assert.rejects(()=>run021(f.c,plan,f.p),{code:'STAGING_COMMIT_UNKNOWN'});assert.equal(f.released[0],true);assert.equal(f.state().ledger.length,21);assert.equal((await run021(f.c,plan,f.p)).status,'already_verified')})
test('migration --plan is offline, and unauthorised --apply fails without connecting',()=>{
 const envWithoutSecrets={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP}
 for(const mode of ['--plan','--apply']){const r=spawnSync(process.execPath,['backend/scripts/migrate-staging.mjs',mode],{encoding:'utf8',env:envWithoutSecrets});assert.equal(r.status,mode==='--plan'?0:1);if(mode==='--plan')assert.equal(JSON.parse(r.stdout).databaseConnected,false);else assert.match(r.stderr,/staging_migration_plan_approval_required/)}
})
test('PostgreSQL integration target refuses protected databases, remote hosts and mixed roles before connection',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',database='stall_payment_it_'+id.replaceAll('-','')
 const e={STALL_STAGING_PG_TEST_INSTANCE_ID:id}
 for(const role of ['MIGRATOR','APP','AUTHORIZER'])e['STALL_STAGING_PG_TEST_'+role+'_URL']='postgresql://unit_'+role.toLowerCase()+':SYNTHETIC_ONLY@127.0.0.1:55490/'+database
 assert.equal(localTestTarget(e).database,database)
 for(const name of ['stall_dev','stall_restore_20261027','stall_test_phase8','neondb'])assert.throws(()=>localTestTarget({...e,STALL_STAGING_PG_TEST_APP_URL:e.STALL_STAGING_PG_TEST_APP_URL.replace(database,name)}),/dedicated UUID database only/)
 assert.throws(()=>localTestTarget({...e,STALL_STAGING_PG_TEST_APP_URL:e.STALL_STAGING_PG_TEST_APP_URL.replace('127.0.0.1','ep-prod.neon.tech')}),/loopback only/)
 assert.throws(()=>localTestTarget({...e,PGOPTIONS:'-c search_path=public'}),/libpq override refused/)
 assert.throws(()=>localTestTarget({...e,STALL_STAGING_PG_TEST_APP_URL:e.STALL_STAGING_PG_TEST_MIGRATOR_URL}),/Expected values to be strictly equal/)
})
