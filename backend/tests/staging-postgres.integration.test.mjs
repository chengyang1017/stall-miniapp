import {PAYMENT_CASES} from '../testing/phase8-v2/payments021.mjs'
import {localTestTarget} from '../testing/staging/postgres-target.mjs'
// REAL pg suite, default SKIPPED. Never falls back to DATABASE_URL or Phase8 DBs.
// DBA must first enroll a dedicated loopback database and three dedicated roles.
import {describe,test,before,after} from 'node:test'
import assert from 'node:assert/strict'
import {loadPlan,run021,CATALOG_SQL,catalogDigest} from '../testing/staging/migration.mjs'
import {inspectRuntimePrivileges} from '../src/stagingPermissions.mjs'
import {profile as syntheticProfile,environment as syntheticEnvironment} from './helpers/staging-profile.mjs'
const enabled=process.env.STALL_STAGING_PG_TEST_AUTHORIZE==='ISOLATED_001_021_TESTS_ONLY'
describe('real isolated PostgreSQL staging payments',{concurrency:false},()=>{
 let migration,app,authorizer,p,env,registry,plan,pools=[]
 const pgTest=(name,fn)=>test(name,{skip:!enabled},fn)
 before(async()=>{
  if(!enabled)return
  const target=localTestTarget(process.env),{Pool}=await import('pg')
  pools=target.configs.map(c=>new Pool(c));[migration,app,authorizer]=pools
  for(const pool of pools)pool.on('error',()=>{})
  // A single read is the first database action; never create/adopt identity here.
  const anchor=(await migration.query(`SELECT * FROM staging_control.deployment_identity WHERE singleton=true AND test_only=true AND instance_id=$1 AND database_name=current_database()`,[target.id])).rows[0]
  assert.ok(anchor,'DBA-enrolled isolated marker required');assert.equal(anchor.environment,'staging');assert.equal(anchor.database_name,target.database)
  const identities=await Promise.all(pools.map(async c=>(await c.query('SELECT current_database() AS db,current_user AS role')).rows[0]))
  identities.forEach((r,i)=>{assert.equal(r.db,target.database);assert.equal(r.role,target.configs[i].user)})
  plan=await loadPlan()
  const tables=(await migration.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n
  if(tables===0){
   assert.equal(process.env.STALL_STAGING_PG_TEST_INITIALIZE,'APPLY_001_021_ONLY','empty DB initialization requires second consent')
   const c=await migration.connect();try{await c.query('BEGIN');await c.query('CREATE TABLE public.stall_schema_migrations(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');for(const f of plan.files.slice(0,20)){await c.query(f.body);await c.query('INSERT INTO public.stall_schema_migrations(filename,sha256) VALUES($1,$2)',[f.filename,f.sha256])}await c.query('COMMIT')}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }
  const has21=(await migration.query('SELECT count(*)::int AS n FROM public.stall_schema_migrations')).rows[0].n===21
  if(!has21){
   const a='"'+target.configs[1].user+'"'
   for(const sql of [`GRANT SELECT ON merchants,merchant_members,categories,store_delivery_rules,delivery_tracking_sessions TO ${a}`,`GRANT INSERT ON orders,order_items,inventory_reservations,order_status_events TO ${a}`,`GRANT UPDATE(fulfillment_status,issue_reason,delivered_at,delivery_proof_key) ON orders TO ${a}`,`GRANT UPDATE(configuration) ON store_delivery_rules TO ${a}`,`GRANT UPDATE(state,ended_at,latitude,longitude,accuracy,sampled_at) ON delivery_tracking_sessions TO ${a}`])await migration.query(sql)
  }
  const pre=has21?(await migration.query('SELECT pre_catalog_sha256 FROM public.staging_payment_migration_audits WHERE filename=$1',[plan.files[20].filename])).rows[0].pre_catalog_sha256:catalogDigest((await migration.query(CATALOG_SQL)).rows)
  p={...syntheticProfile,instanceId:target.id,deploymentId:anchor.deployment_id,branchId:anchor.branch_id,database:target.database,migratorRole:target.configs[0].user,applicationRole:target.configs[1].user,authorizationRole:target.configs[2].user,pre021CatalogSha256:pre}
  await run021(await migration.connect(),plan,p)
  env={...syntheticEnvironment,STAGING_DEPLOYMENT_ID:p.deploymentId,STAGING_PAYMENT_INSTANCE_ID:p.instanceId,DATABASE_URL:'postgresql://'+p.applicationRole+':SYNTHETIC_POLICY_ONLY@'+p.applicationHost+'/'+p.database+'?sslmode=verify-full'}
  registry={version:1,deployments:[p]};await inspectRuntimePrivileges(app,p)
 },{timeout:60000})
 after(async()=>{await Promise.allSettled(pools.map(p=>p.end()))})
 for(const item of PAYMENT_CASES)pgTest(item.name,()=>item.run({migration,app,authorizer,p,env,registry}))
})
