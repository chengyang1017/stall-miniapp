// Fixed, opt-in 021 stage. No connection, DDL or environment action on import.
import {check,V2,PURPOSES021} from './policy.mjs'
import {loadMigrations} from '../phase8/migrations.mjs'
import {loadPlan,CATALOG_SQL,catalogDigest,verifyCoreSchema} from '../staging/migration.mjs'
import {inspectCatalog,assertBaseline,fingerprint,assertCatalog,CATALOG_SQL as BASE_CATALOG_SQL,CONTROL_ACL_SQL} from '../phase8/schema.mjs'
import {assertLedger} from '../phase8/policy.mjs'
import {permissionPlan,inspectRuntimePrivileges} from '../../src/stagingPermissions.mjs'
export const ENROLL_ACL_BODY=`BEGIN
 IF session_user <> 'stall_test_migrator' OR current_database() <> 'stall_test_phase8' THEN RAISE EXCEPTION 'phase8_021_acl_refused'; END IF;
 GRANT USAGE ON SCHEMA public,phase8_control TO stall_test_authorizer;
END;`
function stageScope(g,m){
 const spec=Object.hasOwn(PURPOSES021,g?.purpose)?PURPOSES021[g.purpose]:undefined
 check(g?.version===2&&g.schemaVersion===21&&spec&&(spec.role===g.role||g.purpose==='payments021'&&g.role==='migrator')&&spec.scope===g.scope&&
 g.planSha256===m?.plan?.manifestSha256&&g.baselineManifestSha256===m?.baseline?.manifestHash,'schema021_scope_rejected')
}
export async function inspectCatalog021(db){
 const rows=(await db.query(BASE_CATALOG_SQL)).rows,controls=(await db.query(CONTROL_ACL_SQL)).rows
 check(controls.length===4&&controls.filter(c=>c.relname==='stage021'&&c.owner==='stall_test_migrator'&&c.app_write===false&&c.observer_write===false).length===1,'schema021_control_drift')
 assertCatalog(rows,controls.filter(c=>c.relname!=='stage021'));return rows
}
export async function verifyAuthorizer021(db,g){
 await enrolled021(db,g)
 const s=(await db.query('SELECT instance_id,status,plan_sha256,baseline_sha256 FROM phase8_control.stage021')).rows
 check(s.length===1&&s[0].instance_id===g.instance&&s[0].status==='ready'&&s[0].plan_sha256===g.planSha256&&s[0].baseline_sha256===g.baselineManifestSha256,'schema021_state_rejected')
 const r=(await db.query(`SELECT has_schema_privilege(current_user,'public','CREATE') OR has_schema_privilege(current_user,'phase8_control','CREATE') AS unsafe,
 has_table_privilege(current_user,'public.staging_payment_testers','INSERT') AS can_authorize,
 EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'phase8_control'::regnamespace,'staging_control'::regnamespace)
 AND c.relkind IN ('r','p') AND c.oid<>'public.staging_payment_testers'::regclass
 AND (pg_get_userbyid(c.relowner)=current_user OR has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES'))) AS excess_write,
 has_table_privilege(current_user,'public.staging_payment_testers','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS tester_excess`)).rows[0]
 check(r?.unsafe===false&&r.can_authorize===true&&r.excess_write===false&&r.tester_excess===false,'schema021_authorizer_acl_rejected')
 const columns=(await db.query(`SELECT a.attname,has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') AS writable FROM pg_class c
 JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid='public.staging_payment_testers'::regclass AND a.attnum>0 AND NOT a.attisdropped`)).rows
 check(columns.length>0&&columns.every(c=>c.writable===['expires_at','revoked_at'].includes(c.attname)),'schema021_authorizer_columns_rejected')
}
export async function stageMigrations(){
 const baseline=await loadMigrations({sourceProfile:'workspace021-baseline020'}),plan=await loadPlan()
 return {...baseline,baseline,plan,manifestHash:plan.manifestSha256}
}
export function stageProfile(instance,pre='0'.repeat(64)){
 // Policy-only local fixture registry; never added to production approval files.
 const p={approved:true,reviewedBy:'fixed Phase8 isolated test harness',reviewedAt:'2026-10-28T00:00:00Z',environment:'staging',
  deploymentId:instance,instanceId:instance,renderServiceId:'srv-phase8-isolated',branchId:'br-phase8-'+instance,
  applicationHost:'ep-phase8-pooler.test.neon.tech',migrationHost:'ep-phase8.test.neon.tech',database:V2.database,
  applicationRole:'stall_test_app',migratorRole:'stall_test_migrator',authorizationRole:'stall_test_authorizer',pre021CatalogSha256:pre}
 const env={NODE_ENV:'production',APP_ENV:'staging',STAGING_SIMULATED_PAYMENTS:'ENABLED_FOR_TESTING_ONLY',STAGING_DEPLOYMENT_ID:instance,
  STAGING_PAYMENT_INSTANCE_ID:instance,RENDER:'true',RENDER_SERVICE_ID:p.renderServiceId,
  DATABASE_URL:'postgresql://stall_test_app:POLICY_FIXTURE_ONLY@'+p.applicationHost+'/'+V2.database+'?sslmode=verify-full'}
 return {p,env,registry:{version:1,deployments:[p]}}
}
export async function enrolled021(db,g){
 const {p}=stageProfile(g.instance)
 const r=(await db.query(`SELECT deployment_id::text,instance_id::text,branch_id,database_name,environment,test_only,
 pg_get_userbyid(c.relowner) AS owner,pg_get_userbyid(n.nspowner) AS schema_owner FROM staging_control.deployment_identity i
 JOIN pg_class c ON c.oid='staging_control.deployment_identity'::regclass JOIN pg_namespace n ON n.oid=c.relnamespace WHERE singleton=true`)).rows
 check(r.length===1&&r[0].deployment_id===g.instance&&r[0].instance_id===g.instance&&r[0].branch_id===p.branchId&&r[0].database_name===V2.database&&r[0].environment==='staging'&&r[0].test_only===true&&r[0].owner==='stall_test_bootstrap'&&r[0].schema_owner==='stall_test_bootstrap','schema021_enrollment_rejected')
 const roles=(await db.query(`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolcanlogin,
 (SELECT count(*)::int FROM pg_auth_members m WHERE m.member=r.oid) AS memberships
 FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[['stall_test_migrator','stall_test_app','stall_test_observer','stall_test_authorizer']])).rows
 check(roles.length===4&&roles.every(r=>r.rolcanlogin===true&&r.memberships===0&&[r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls].every(x=>x===false)),'schema021_roles_rejected')
 const control=(await db.query(`SELECT r.rolname,
 has_schema_privilege(r.rolname,'staging_control','CREATE') AS schema_create,
 has_table_privilege(r.rolname,'staging_control.deployment_identity','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
 has_any_column_privilege(r.rolname,'staging_control.deployment_identity','INSERT,UPDATE,REFERENCES') AS identity_write
 FROM pg_roles r WHERE rolname=ANY($1::text[])`,[['stall_test_app','stall_test_migrator','stall_test_observer','stall_test_authorizer']])).rows
 check(control.length===4&&control.every(r=>r.schema_create===false&&r.identity_write===false),'schema021_control_acl_rejected')
 return p
}
export async function verifyStage021(db,g,m){
 stageScope(g,m)
 await enrolled021(db,g)
 assertLedger((await db.query('SELECT filename,sha256 FROM phase8_control.migrations ORDER BY filename')).rows,m.baseline.files)
 const marker=(await db.query('SELECT schema_sha256 FROM phase8_control.instance WHERE singleton=true')).rows[0]
 const old=(await db.query('SELECT catalog FROM phase8_control.schema_baseline WHERE singleton=true')).rows
 check(old.length===1&&fingerprint(old[0].catalog)===marker?.schema_sha256,'schema021_old_baseline_changed')
 assertLedger((await db.query('SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename')).rows,m.plan.files)
 const rows=(await db.query(`SELECT s.*,pg_get_userbyid(c.relowner) AS owner FROM phase8_control.stage021 s
 JOIN pg_class c ON c.oid='phase8_control.stage021'::regclass`)).rows
 const s=rows[0]
 check(rows.length===1&&s.instance_id===g.instance&&s.status==='ready'&&s.plan_sha256===g.planSha256&&s.baseline_sha256===g.baselineManifestSha256&&s.owner==='stall_test_migrator','schema021_state_rejected')
 assertBaseline(await inspectCatalog021(db),s.catalog,s.catalog_sha256)
 const {p}=stageProfile(g.instance)
 await inspectRuntimePrivileges(db,p)
 verifyCoreSchema((await db.query(CATALOG_SQL)).rows)
 // Catalog baseline pins exact definitions; independently require enabled 021 constraints.
 const constraints=(await db.query(`SELECT conname,convalidated FROM pg_constraint WHERE conrelid IN
 ('public.staging_payment_confirmations'::regclass,'public.staging_payment_testers'::regclass,'public.staging_payment_environment'::regclass)
 OR conname='orders_simulation_identity'`)).rows
 check(constraints.length>=12&&constraints.every(r=>r.convalidated===true)&&constraints.some(r=>r.conname==='orders_simulation_identity'),'schema021_constraints_rejected')
 const audit=(await db.query('SELECT * FROM public.staging_payment_migration_audits WHERE filename=$1',[m.plan.files[20].filename])).rows
 check(audit.length===1&&audit[0].sha256===m.plan.files[20].sha256&&audit[0].instance_id===g.instance&&audit[0].deployment_id===g.instance&&audit[0].branch_id===p.branchId&&audit[0].post_catalog_sha256===catalogDigest((await db.query(CATALOG_SQL)).rows),'schema021_audit_rejected')
 // Include inherited/PUBLIC rights; observer remains read-only, authorizer only
 // administers tester grants, and neither may rewrite the identity or stage.
 const rights=(await db.query(`SELECT
 has_table_privilege('stall_test_authorizer','public.staging_payment_testers','SELECT') AND has_table_privilege('stall_test_authorizer','public.staging_payment_testers','INSERT') AS manager_read_insert,
 has_table_privilege('stall_test_authorizer','public.staging_payment_testers','UPDATE,DELETE,TRUNCATE') AS manager_table_write,
 has_column_privilege('stall_test_authorizer','public.staging_payment_testers','expires_at','UPDATE') AS manager_expiry,
 has_column_privilege('stall_test_authorizer','public.staging_payment_testers','revoked_at','UPDATE') AS manager_revoke,
 EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'phase8_control'::regnamespace,'staging_control'::regnamespace)
 AND (has_table_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,REFERENCES'))) AS observer_write,
 has_table_privilege('stall_test_app','phase8_control.stage021','INSERT,UPDATE,DELETE,TRUNCATE') AS app_stage_write,
 has_table_privilege('stall_test_app','public.stall_schema_migrations','INSERT,UPDATE,DELETE,TRUNCATE') AS app_ledger_write,
 has_table_privilege('stall_test_app','public.staging_payment_migration_audits','INSERT,UPDATE,DELETE,TRUNCATE') AS app_audit_write`)).rows[0]
 check(rights?.manager_read_insert===true&&rights.manager_expiry===true&&rights.manager_revoke===true&&[rights.manager_table_write,rights.observer_write,rights.app_stage_write,rights.app_ledger_write,rights.app_audit_write].every(x=>x===false),'schema021_acl_rejected')
 return {status:'ready021_verified',schemaVersion:21,ready:true,planSha256:g.planSha256,catalogSha256:s.catalog_sha256}
}
export async function upgrade021(pool,g,m){
 check(g.version===2&&g.purpose==='upgrade021'&&g.role==='migrator','schema021_upgrade_scope_rejected')
 stageScope(g,m)
 const db=await pool.connect();let transaction=false,broken=false,committing=false
 try{
  await db.query('BEGIN');transaction=true
  for(const [k,v]of [['search_path','public, pg_catalog'],['lock_timeout','3000ms'],['statement_timeout','30000ms'],['idle_in_transaction_session_timeout','30000ms']])await db.query('SELECT set_config($1,$2,true)',[k,v])
  check((await db.query('SELECT pg_try_advisory_xact_lock(803280,21) AS acquired')).rows[0]?.acquired===true,'schema021_upgrade_locked')
  await db.query('LOCK TABLE phase8_control.migrations IN SHARE MODE');await db.query('LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE')
  // Recheck actual 020 schema under lock. No recapture of an unverified baseline.
  const {verifySQL}=await import('./sql.mjs');await verifySQL(db,{...g,version:1,purpose:'initialize'},m.baseline,'ready')
  const p=await enrolled021(db,g)
  const helper=(await db.query(`SELECT p.prosrc,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner
   FROM pg_proc p WHERE p.oid='staging_control.authorize021_schema_usage()'::regprocedure`)).rows
  check(helper.length===1&&helper[0].prosrc.trim()===ENROLL_ACL_BODY&&helper[0].prosecdef===true&&helper[0].owner==='stall_test_bootstrap'&&JSON.stringify(helper[0].proconfig)===JSON.stringify(['search_path=pg_catalog']),'schema021_acl_helper_rejected')
  check((await db.query("SELECT to_regclass('public.stall_schema_migrations') AS ledger,to_regclass('phase8_control.stage021') AS stage")).rows.every(r=>r.ledger===null&&r.stage===null),'schema021_already_attempted')
  await db.query('CREATE TABLE public.stall_schema_migrations(filename text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())')
  await db.query('INSERT INTO public.stall_schema_migrations(filename,sha256) SELECT filename,sha256 FROM phase8_control.migrations ORDER BY filename')
  const pre=catalogDigest((await db.query(CATALOG_SQL)).rows)
  await db.query(m.plan.files[20].body)
  await db.query('SELECT staging_control.authorize021_schema_usage()')
  // CONNECT is enrolled by DBA, never granted by the non-owner migrator.
  for(const sql of permissionPlan(p).filter(s=>!s.startsWith('GRANT CONNECT ON DATABASE')&&!s.startsWith('GRANT USAGE ON SCHEMA public TO')))
   await db.query(sql.replace('GRANT USAGE ON SCHEMA public,staging_control','GRANT USAGE ON SCHEMA staging_control'))
  await db.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO stall_test_observer')
  await db.query('GRANT SELECT ON public.stall_schema_migrations,public.staging_payment_migration_audits TO stall_test_app')
  await db.query('GRANT SELECT ON public.stall_schema_migrations,public.staging_payment_migration_audits TO stall_test_authorizer')
  await inspectRuntimePrivileges(db,p)
  await db.query(`CREATE TABLE phase8_control.stage021(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),instance_id uuid NOT NULL,
   status text NOT NULL CHECK(status='ready'),plan_sha256 text NOT NULL,baseline_sha256 text NOT NULL,run_id uuid NOT NULL,catalog jsonb NOT NULL,catalog_sha256 text NOT NULL)`)
  await db.query('REVOKE ALL ON phase8_control.stage021 FROM PUBLIC')
  await db.query('GRANT SELECT ON phase8_control.stage021 TO stall_test_app,stall_test_observer,stall_test_authorizer')
  const file=m.plan.files[20],post=catalogDigest((await db.query(CATALOG_SQL)).rows)
  check((await db.query('INSERT INTO public.stall_schema_migrations(filename,sha256) VALUES($1,$2)',[file.filename,file.sha256])).rowCount===1,'schema021_ledger_write_rejected')
  check((await db.query(`INSERT INTO public.staging_payment_migration_audits(filename,sha256,deployment_id,instance_id,branch_id,pre_catalog_sha256,post_catalog_sha256)
   VALUES($1,$2,$3,$3,$4,$5,$6)`,[file.filename,file.sha256,g.instance,p.branchId,pre,post])).rowCount===1,'schema021_audit_write_rejected')
  const catalog=await inspectCatalog021(db)
  check((await db.query("INSERT INTO phase8_control.stage021(instance_id,status,plan_sha256,baseline_sha256,run_id,catalog,catalog_sha256) VALUES($1,'ready',$2,$3,$4,$5::jsonb,$6)",[g.instance,g.planSha256,g.baselineManifestSha256,g.runId,JSON.stringify(catalog),fingerprint(catalog)])).rowCount===1,'schema021_stage_write_rejected')
  await verifyStage021(db,g,m)
  committing=true;await db.query('COMMIT');transaction=false;committing=false
  return {status:'schema021_initialized',schemaVersion:21,ready:false,planSha256:g.planSha256}
 }catch(e){if(transaction)try{await db.query('ROLLBACK')}catch{broken=true}if(committing){broken=true;throw Object.assign(Error('schema021_commit_unknown'),{phase8Code:'phase8_v2_schema021_commit_unknown'})}throw e}
 finally{db.release(broken?Error('schema021_connection_uncertain'):undefined)}
}
