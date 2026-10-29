// OFFLINE: actual controllers/SQL orchestration with synthetic metadata only.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {configuration,PURPOSES021,runnerIdentity,V2} from '../testing/phase8-v2/policy.mjs'
import {grant} from '../testing/phase8-v2/grants.mjs'
import {run} from '../testing/phase8-v2/controller.mjs'
import {runJob} from '../testing/phase8-v2/runner.mjs'
import {stageMigrations,stageProfile,enrolled021,upgrade021,verifyStage021,ENROLL_ACL_BODY} from '../testing/phase8-v2/schema021.mjs'
import {verifySQL,IDENTITY,MARKER,openSQL} from '../testing/phase8-v2/sql.mjs'
import {hostMigrations} from '../testing/phase8-v2/host.mjs'
import {PAYMENT_CASES,runPayments021} from '../testing/phase8-v2/payments021.mjs'
import {BUSINESS_CASES} from '../testing/phase8-v2/business.mjs'
import {CATALOG_SQL,CONTROL_ACL_SQL,fingerprint} from '../testing/phase8/schema.mjs'
import {CATALOG_SQL as STAGING_CATALOG_SQL,catalogDigest} from '../testing/staging/migration.mjs'
import {identity} from './helpers/phase8-fixtures.mjs'
import {environment,token,pg,node,now,instance,dbId,runnerId,paths,runner,rec,resources,hostFake} from './helpers/phase8-v2-fixtures.mjs'
const approval={...node,schemaProfile:'staging021'}
const authorizations={upgrade021:'UPGRADE_021_ATOMIC_ONCE',ready021:'VERIFY_021_READ_ONLY',business021:'RUN_EXISTING_26_ON_021',payments021:'RUN_11_PAYMENT_CASES_ON_021'}
const env=purpose=>({...environment(purpose),PHASE8_V2_SCHEMA:'EXPLICIT_021_ONLY',PHASE8_V2_021_AUTHORIZE:authorizations[purpose]})
const code=s=>e=>e.phase8Code===s
const m=await stageMigrations()
const g=purpose=>({...token(),version:2,purpose,...PURPOSES021[purpose],schemaVersion:21,planSha256:m.manifestHash,manifestSha256:m.manifestHash,baselineManifestSha256:m.baseline.manifestHash,prerequisiteSha256:'9'.repeat(64)})
// state is purpose policy metadata, not a grant property.
for(const purpose of Object.keys(PURPOSES021))test('021 purpose explicitly authorized and exact scoped grant '+purpose,()=>{
 const c=configuration(env(purpose),'run',pg,approval);assert.equal(c.purpose,purpose)
 const value=g(purpose);delete value.state;assert.equal(grant(value,now),value)
 assert.throws(()=>configuration({...env(purpose),PHASE8_V2_021_AUTHORIZE:''},'run',pg,approval),code('phase8_v2_schema021_not_authorized'))
 assert.throws(()=>configuration(env(purpose),'run',pg,node),code('phase8_v2_image_schema_rejected'))
})
function staged(purpose='payments021'){const value=g(purpose);delete value.state;return value}
for(const [name,patch,expected]of [
 ['v1 purpose borrowing',{version:1},'grant_rejected'],['wrong role',{role:'observer'},'grant_purpose_rejected'],['wrong scope',{scope:'shell'},'grant_purpose_rejected'],
 ['wrong schema',{schemaVersion:20},'grant_schema021_rejected'],['wrong plan',{planSha256:'0'.repeat(64)},'grant_schema021_rejected'],
 ['missing prerequisite',{prerequisiteSha256:undefined},'grant_schema021_rejected'],['unknown field',{arbitrarySQL:'SELECT 1'},'grant_rejected'],['command',{command:'psql'},'grant_target_rejected']
])test('021 grant rejects '+name,()=>assert.throws(()=>grant({...staged(),...patch},now),code('phase8_v2_'+expected)))
test('v2 grant cannot run legacy purpose and v1 cannot opt into 021',()=>{
 assert.throws(()=>grant({...staged(),purpose:'business',role:'app',scope:'business-consistency-v1'},now),code('phase8_v2_grant_purpose_rejected'))
 assert.throws(()=>configuration(environment('business'),'run',pg,approval))
 assert.throws(()=>configuration(environment('toString'),'run',pg,approval),code('phase8_v2_purpose_rejected'))
})
test('021 source plan retains exact 20 baseline and pinned SQL',()=>{
 assert.equal(m.files.length,20);assert.equal(m.plan.files.length,21)
 assert.deepEqual(m.plan.files.slice(0,20).map(f=>[f.filename,f.sha256]),m.baseline.files.map(f=>[f.filename,f.sha256]))
 assert.equal(m.plan.files[20].sha256,'e70cced05180b5c356096273d5be14ae128aabbdd462b9d9604c87c4d36cfab2')
})
test('legacy host defaults remain strict; explicit source projection pairs old 020 runner',async()=>{
 await assert.rejects(()=>hostMigrations('initialize'),code('phase8_migration_list_rejected'))
 await assert.rejects(()=>hostMigrations('initialize',{PHASE8_V2_BASELINE_SOURCE:'latest'}),code('phase8_v2_baseline_source_rejected'))
 const legacy=await hostMigrations('initialize',{PHASE8_V2_BASELINE_SOURCE:'VERIFIED_021_WORKSPACE_PROJECT_020'})
 assert.equal(legacy.files.length,20);assert.equal(legacy.manifestHash,m.baseline.manifestHash)
 assert.equal((await hostMigrations('upgrade021')).plan.files.length,21)
})
test('eleven payment cases and existing 26 orders are shared fixed functions',async()=>{
 assert.equal(PAYMENT_CASES.length,11);assert.equal(new Set(PAYMENT_CASES.map(x=>x.name)).size,11);assert.equal(BUSINESS_CASES.length,26)
 const text=await readFile(new URL('./staging-postgres.integration.test.mjs',import.meta.url),'utf8')
 assert.match(text,/for\(const item of PAYMENT_CASES\)/)
 await assert.rejects(()=>runPayments021({}, {...staged(),purpose:'business021'}),code('phase8_v2_payments021_scope_rejected'))
 await assert.rejects(()=>runPayments021({p:{instanceId:'wrong',database:V2.database}},staged()),code('phase8_v2_payments021_instance_rejected'))
})
const roles=['app','migrator','observer','authorizer'].map(role=>({rolname:'stall_test_'+role,rolcanlogin:true,memberships:0,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false}))
function enrollmentReply(sql){
 if(sql.includes('SELECT deployment_id::text'))return [{deployment_id:instance,instance_id:instance,branch_id:stageProfile(instance).p.branchId,database_name:V2.database,environment:'staging',test_only:true,owner:'stall_test_bootstrap',schema_owner:'stall_test_bootstrap'}]
 if(sql.includes('SELECT rolname,rolsuper'))return structuredClone(roles)
 if(sql.includes('SELECT r.rolname,'))return roles.map(r=>({rolname:r.rolname,schema_create:false,identity_write:false}))
}
for(const [field,value]of [['instance_id','different'],['test_only',false],['owner','stall_test_migrator'],['database_name','stall_dev']])test('enrollment rejects '+field,async()=>{
 const db={query:async sql=>{const rows=enrollmentReply(sql);if(sql.includes('SELECT deployment_id::text'))rows[0][field]=value;return {rows}}}
 await assert.rejects(()=>enrolled021(db,staged()),code('phase8_v2_schema021_enrollment_rejected'))
})
test('enrollment rejects dangerous role and control rights',async()=>{
 for(const danger of ['role','control']){const db={query:async sql=>{const rows=enrollmentReply(sql);if(danger==='role'&&sql.includes('SELECT rolname,rolsuper'))rows[0].rolsuper=true;if(danger==='control'&&sql.includes('SELECT r.rolname,'))rows[0].identity_write=true;return {rows}}}
 await assert.rejects(()=>enrolled021(db,staged()),code('phase8_v2_schema021_'+(danger==='role'?'roles_rejected':'control_acl_rejected')))}
})
test('SQL verifier rejects wrong instance/illegal old state before stage queries',async()=>{
 for(const patch of [{instance_id:'wrong'},{schema_state:'failed'}]){
 const queries=[],db={query:async sql=>{queries.push(sql);return {rows:sql===IDENTITY?[identity('observer')]:[{instance_id:instance,schema_state:'ready',manifest_sha256:m.baseline.manifestHash,owner:'stall_test_bootstrap',...patch}]}}}
 await assert.rejects(()=>verifySQL(db,staged('ready021'),m,'ready'),code('phase8_instance_marker_rejected'))
 assert.equal(queries.length,2)
 }
})
test('v2 wrong manifest is refused by runner before claim or pool creation',async()=>{
 let claimed=false,opened=false
 await assert.rejects(()=>runJob({readGrant:async()=>staged(),now:()=>now,env:{},verifyArtifact:async()=>{},migrations:async()=>({...m,manifestHash:'0'.repeat(64)}),claim:async()=>{claimed=true},makePool:class{constructor(){opened=true}}}),code('phase8_v2_manifest_rejected'))
 assert.equal(claimed,false);assert.equal(opened,false)
})
test('extra credential pool forbidden for every purpose except payment tests',async()=>{
 await assert.rejects(()=>openSQL(staged('ready021'),'a'.repeat(64),m,{now:()=>now,role:'migrator'}),code('phase8_v2_pool_role_rejected'))
})
test('payment-only runner mounts are exact and read-only; other purposes reject them',()=>{
 const c=configuration(env('payments021'),'run',pg,approval),p={...paths,secret:'/synthetic/app',migratorSecret:'/synthetic/migrator',authorizerSecret:'/synthetic/authorizer'},r=runner()
 r.Mounts[2].Source=p.secret
 r.Mounts.push(...[['migrator',p.migratorSecret],['authorizer',p.authorizerSecret]].map(([role,Source])=>({Type:'bind',Source,Destination:'/run/secrets/phase8_'+role,RW:false})))
 assert.doesNotThrow(()=>runnerIdentity(r,c,rec(),p))
 assert.throws(()=>runnerIdentity(r,{...c,purpose:'business021'},rec(),p),code('phase8_v2_runner_mount_rejected'))
 r.Mounts[4].RW=true;assert.throws(()=>runnerIdentity(r,c,rec(),p),code('phase8_v2_runner_mount_rejected'))
})
test('controller refuses stale 020 ready for payment task before Docker creation',async()=>{
 const io=hostFake();io.approvals=async()=>[pg,approval];io.prerequisite=async()=>({profile:V2.profile,instance,dbId,status:'ready_verified'});io.migrations=async()=>m
 await assert.rejects(()=>run(env('payments021'),io),code('phase8_v2_prerequisite_rejected'))
 assert(!io.calls.includes('create:runner'))
})
test('controller refuses wrong 021 plan prerequisite before Docker creation',async()=>{
 const io=hostFake();io.approvals=async()=>[pg,approval];io.prerequisite=async()=>({profile:V2.profile,instance,dbId,status:'ready021_verified',schemaVersion:21,planSha256:'0'.repeat(64)});io.migrations=async()=>m
 await assert.rejects(()=>run(env('payments021'),io),code('phase8_v2_schema021_prerequisite_rejected'));assert(!io.calls.includes('create:runner'))
})
// Valid minimal synthetic catalog for orchestration fault injection, never SQL evaluation.
const catalog=[...['orders_checkout_retry_unique','inventory_held_product','inventory_expiring_orders'].map(name=>({kind:'index',name,detail:{valid:true}})),
 ...['products.products_stock_quantity_check','inventory_reservations.inventory_reservations_pkey','inventory_reservations.inventory_reservations_store_id_order_id_fkey','inventory_reservations.inventory_reservations_store_id_product_id_fkey','inventory_movements.inventory_movements_store_id_order_id_fkey','inventory_movements.inventory_movements_store_id_product_id_fkey'].map(name=>({kind:'constraint',name,detail:{validated:true}})),
 ...['inventory_movements.inventory_movements_no_rewrite','order_items.order_item_category_snapshot','order_items.capture_order_image','orders.end_order_tracking_on_status'].map(name=>({kind:'trigger',name,detail:{enabled:'O'}}))]
function upgradeClient(fault){
 const queries=[],oldHash=fingerprint(catalog),controls=['instance','migrations','schema_baseline'].map(relname=>({relname,owner:relname==='instance'?'stall_test_bootstrap':'stall_test_migrator',app_write:false,observer_write:false}))
 let released;const db={async query(sql,args){queries.push(sql)
  if(fault==='ddl'&&sql===m.plan.files[20].body||fault==='ledger'&&sql.startsWith('INSERT INTO public.stall_schema_migrations(filename,sha256) VALUES'))throw Object.assign(Error('injected real orchestration boundary'),{code:'23514'})
  let rows=enrollmentReply(sql)
  if(sql===IDENTITY)rows=[identity('migrator','initialize')]
  if(sql===MARKER)rows=[{instance_id:instance,schema_state:'ready',manifest_sha256:m.baseline.manifestHash,schema_sha256:oldHash,owner:'stall_test_bootstrap'}]
  if(sql==='SELECT filename,sha256 FROM phase8_control.migrations ORDER BY filename')rows=m.baseline.files
  if(sql==='SELECT catalog FROM phase8_control.schema_baseline WHERE singleton=true')rows=[{catalog}]
  if(sql===CATALOG_SQL)rows=catalog
  if(sql===CONTROL_ACL_SQL)rows=controls
  if(sql.includes('pg_try_advisory_xact_lock'))rows=[{acquired:true}]
  if(sql.startsWith('SELECT p.prosrc'))rows=[{prosrc:ENROLL_ACL_BODY,prosecdef:true,owner:'stall_test_bootstrap',proconfig:['search_path=pg_catalog']}]
  if(sql.startsWith('SELECT to_regclass'))rows=[{ledger:null,stage:null}]
  // Permission probes have synthetic catalog replies, not a mock SQL database.
  if(sql.startsWith('SELECT count(*)::int AS count,bool_or'))rows=[{count:3,unsafe:false}]
  if(sql.startsWith('SELECT r.rolsuper'))rows=[Object.fromEntries(['rolsuper','rolcreatedb','rolcreaterole','rolbypassrls','migrator_member','authorization_member','schema_create','control_schema_create','missing_public_usage','missing_control_usage','missing_connect','owns_tables'].map(k=>[k,false]))]
  if(sql.startsWith('SELECT has_table_privilege'))rows=[{ok:['SELECT','INSERT'].includes(args[1])}]
  if(sql.startsWith('SELECT has_any_column_privilege'))rows=[{unsafe:false}]
  if(sql.startsWith('SELECT a.attname'))rows=[{attname:'lock_key',writable:true},{attname:'instance_id',writable:false}]
  return {rows:rows||[],rowCount:1}
 },release(e){released=e}}
 return {db,queries,get released(){return released}}
}
for(const fault of ['ddl','ledger'])test('021 '+fault+' failure rolls back entire transaction without touching old ledger/baseline',async()=>{
 const fake=upgradeClient(fault)
 await assert.rejects(()=>upgrade021({connect:async()=>fake.db},staged('upgrade021'),m),e=>e.code==='23514')
 assert(fake.queries.includes('BEGIN'));assert(fake.queries.includes('ROLLBACK'));assert(!fake.queries.includes('COMMIT'))
 assert(fake.queries.includes(m.plan.files[20].body))
 assert(!fake.queries.some(q=>/^UPDATE phase8_control\.(instance|migrations|schema_baseline)/.test(q)))
 if(fault==='ledger')assert(fake.queries.some(q=>q.startsWith('GRANT SELECT ON ALL TABLES')))
})
test('021 upgrade rejects role borrowing before connecting',async()=>{
 let touched=false;await assert.rejects(()=>upgrade021({connect(){touched=true}},staged('ready021'),m),code('phase8_v2_schema021_upgrade_scope_rejected'));assert.equal(touched,false)
})
test('021 readiness refuses wrong instance stage and preserves frozen old baseline',async()=>{
 const db={query:async sql=>{let rows=enrollmentReply(sql);if(sql.includes('SELECT filename'))rows=sql.includes('phase8_control')?m.baseline.files:m.plan.files;if(sql.startsWith('SELECT schema_sha256'))rows=[{schema_sha256:fingerprint(catalog)}];if(sql.startsWith('SELECT catalog'))rows=[{catalog}];if(sql.startsWith('SELECT s.*'))rows=[{instance_id:'wrong',status:'ready',plan_sha256:m.manifestHash,baseline_sha256:m.baseline.manifestHash,owner:'stall_test_migrator'}];return {rows}}}
 await assert.rejects(()=>verifyStage021(db,staged('ready021'),m),code('phase8_v2_schema021_state_rejected'))
})
test('DBA enrollment helper has exact fixed body and no alteration of old baseline',async()=>{
 const sql=await readFile(new URL('../testing/phase8-v2/enroll021.sql',import.meta.url),'utf8')
 assert(sql.includes(ENROLL_ACL_BODY));assert.match(sql,/REVOKE ALL ON FUNCTION .* FROM PUBLIC/)
 assert.doesNotMatch(sql,/UPDATE phase8_control|ALTER TABLE phase8_control|GRANT .*phase8_control\.instance/)
})
test('controller issues v2 grant for exact eleven case report and preserves failed results',async()=>{
 for(const failed of [0,1]){
 const io=hostFake(),p={...paths,secret:'/synthetic/app',migratorSecret:'/synthetic/migrator',authorizerSecret:'/synthetic/authorizer'}
 io.approvals=async()=>[pg,approval];io.migrations=async()=>m
 io.prerequisite=async()=>({profile:V2.profile,instance,dbId,status:'ready021_verified',schemaVersion:21,planSha256:m.manifestHash})
 io.reserveRun=async()=>p
 let running=false;io.docker.start=async()=>{running=true};io.docker.resources=async()=>resources({runnerRunning:running})
 io.docker.runner=async()=>{const r=runner(running);r.Mounts[2].Source=p.secret;r.Mounts.push(...[['migrator',p.migratorSecret],['authorizer',p.authorizerSecret]].map(([role,Source])=>({Type:'bind',Source,Destination:'/run/secrets/phase8_'+role,RW:false})));return r}
 const results=PAYMENT_CASES.map((c,i)=>({name:c.name,status:failed&&i===0?'failed':'passed'}))
 io.docker.waitResult=async()=>{running=false;return {version:1,profile:V2.profile,instance,dbId,runId:staged().runId,runnerId,purpose:'payments021',status:'payments021_finished',schemaVersion:21,planSha256:m.manifestHash,passed:11-failed,failed,skipped:0,results}}
 let saved;io.writeResult=async(_c,r)=>{saved=r}
 if(failed)await assert.rejects(()=>run(env('payments021'),io),code('phase8_v2_business_assertions_failed'))
 else assert.equal((await run(env('payments021'),io)).passed,11)
 assert.equal(io.grant.version,2);assert.equal(io.grant.planSha256,m.manifestHash);assert.equal(saved.failed,failed)
 }
})
function readyClient({drift=false,unsafe=false}={}){
 const base=upgradeClient(),queries=[]
 const core=[
 ['orders.orders_inventory_store_id','UNIQUE (store_id, id)'],
 ['inventory_reservations.inventory_reservations_store_id_order_id_fkey','FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id)'],
 ['inventory_reservations.inventory_reservations_store_id_product_id_fkey','FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id)'],
 ['payment_events.payment_events_provider_provider_event_id_key','UNIQUE (provider, provider_event_id)'],
 ['products.products_stock_quantity_check','CHECK (stock_quantity >= 0 AND stock_quantity <= 1000000)']].map(([name,definition])=>({kind:'constraint',name,detail:{validated:true,definition}}))
 for(const name of ['orders_checkout_retry_unique','inventory_expiring_orders','orders_customer_cursor'])core.push({kind:'index',name,detail:{valid:true,ready:true}})
 for(const name of ['inventory_movements.inventory_movements_no_rewrite','orders.track_proof_image','order_items.order_item_category_snapshot','orders.end_order_tracking_on_status'])core.push({kind:'trigger',name,detail:{enabled:'O'}})
 const db={async query(sql,args){queries.push(sql)
 if(sql===IDENTITY)return {rows:[identity('observer')]}
 if(sql===MARKER)return {rows:[{instance_id:instance,schema_state:'ready',manifest_sha256:m.baseline.manifestHash,schema_sha256:fingerprint(catalog),owner:'stall_test_bootstrap'}]}
 if(sql.startsWith('SELECT schema_sha256'))return {rows:[{schema_sha256:fingerprint(catalog)}]}
 if(sql.startsWith('SELECT filename,sha256 FROM public.'))return {rows:m.plan.files}
 if(sql.startsWith('SELECT s.*'))return {rows:[{instance_id:instance,status:'ready',plan_sha256:m.manifestHash,baseline_sha256:m.baseline.manifestHash,owner:'stall_test_migrator',catalog,catalog_sha256:fingerprint(catalog)}]}
 if(sql===CATALOG_SQL)return {rows:drift?[...catalog,{kind:'unexpected',name:'changed',detail:{}}]:catalog}
 if(sql===CONTROL_ACL_SQL)return {rows:['instance','migrations','schema_baseline','stage021'].map(relname=>({relname,owner:relname==='instance'?'stall_test_bootstrap':'stall_test_migrator',app_write:false,observer_write:false}))}
 if(sql===STAGING_CATALOG_SQL)return {rows:core}
 if(sql.startsWith('SELECT conname,convalidated'))return {rows:Array.from({length:12},(_,i)=>({conname:i?'constraint'+i:'orders_simulation_identity',convalidated:true}))}
 if(sql.startsWith('SELECT * FROM public.staging_payment_migration_audits'))return {rows:[{sha256:m.plan.files[20].sha256,instance_id:instance,deployment_id:instance,branch_id:stageProfile(instance).p.branchId,post_catalog_sha256:catalogDigest(core)}]}
 if(sql.includes('AS manager_read_insert'))return {rows:[{manager_read_insert:true,manager_expiry:true,manager_revoke:true,manager_table_write:false,observer_write:unsafe,app_stage_write:false,app_ledger_write:false,app_audit_write:false}]}
 return base.db.query(sql,args)
 },release(){}}
 return {db,queries}
}
test('independent 021 readiness checks catalog, ACL, audit and both ledgers with read-only queries',async()=>{
 const f=readyClient(),result=await verifyStage021(f.db,staged('ready021'),m)
 assert.equal(result.status,'ready021_verified');assert.equal(result.schemaVersion,21)
 assert(f.queries.every(q=>q.startsWith('SELECT')))
 assert(f.queries.some(q=>q.includes('phase8_control.migrations')));assert(f.queries.some(q=>q.includes('public.stall_schema_migrations')))
})
for(const option of [{drift:true},{unsafe:true}])test('021 ready refuses actual catalog or ACL drift '+JSON.stringify(option),async()=>{
 const f=readyClient(option);await assert.rejects(()=>verifyStage021(f.db,staged('ready021'),m),code(option.drift?'phase8_schema_drift':'phase8_v2_schema021_acl_rejected'))
})
test('real runner dispatches ready021 through read-only transaction and destroys its pool',async()=>{
 const f=readyClient();let closed=0,claims=0
 class Pool{on(){}async connect(){return f.db}async end(){closed++}}
 const result=await runJob({env:{},readGrant:async()=>staged('ready021'),now:()=>now,hostname:()=>runnerId.slice(0,12),verifyArtifact:async()=>{},migrations:async()=>m,claim:async()=>{claims++},secret:async()=> 'a'.repeat(64),watchdog:()=>1,clearWatchdog(){},makePool:Pool})
 assert.equal(result.status,'ready021_verified');assert.equal(closed,1);assert.equal(claims,1)
 assert(f.queries.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));assert(f.queries.includes('ROLLBACK'))
})
for(const lost of [false,true])test('021 upgrade transaction '+(lost?'treats COMMIT acknowledgement as unknown':'commits ledger, audit and independent baseline together'),async()=>{
 const before=upgradeClient(),after=readyClient(),queries=[];let stagedSchema=false,released
 const db={async query(sql,args){queries.push(sql)
  if(sql.startsWith('CREATE TABLE phase8_control.stage021'))stagedSchema=true
  if(sql==='COMMIT'&&lost)throw Object.assign(Error('synthetic lost commit acknowledgement'),{code:'08006'})
  if(stagedSchema||sql===STAGING_CATALOG_SQL)return after.db.query(sql,args)
  return before.db.query(sql,args)
 },release(e){released=e}}
 if(lost)await assert.rejects(()=>upgrade021({connect:async()=>db},staged('upgrade021'),m),code('phase8_v2_schema021_commit_unknown'))
 else{const result=await upgrade021({connect:async()=>db},staged('upgrade021'),m);assert.equal(result.status,'schema021_initialized');assert.equal(result.ready,false)}
 assert.equal(queries.filter(q=>q==='COMMIT').length,1)
 assert(queries.indexOf('COMMIT')>queries.findIndex(q=>q.startsWith('INSERT INTO phase8_control.stage021')))
 assert(queries.some(q=>q.startsWith('INSERT INTO public.staging_payment_migration_audits')))
 assert(!queries.some(q=>/^UPDATE phase8_control\.(instance|migrations|schema_baseline)/.test(q)))
 assert.equal(released instanceof Error,lost)
})
