import {readFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {statements,sourceHash} from '../phase8/migrations.mjs'
import {canonical} from '../phase8/schema.mjs'
import {permissionPlan,inspectRuntimePrivileges,inspectDedicatedRoles} from '../../src/stagingPermissions.mjs'
import {assertDatabaseIdentity} from '../../src/stagingDeployment.mjs'
const hash=v=>createHash('sha256').update(v).digest('hex')
const requireThat=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code})}
export const CATALOG_SQL=`SELECT kind,name,detail FROM (
 SELECT 'table' AS kind,c.relname AS name,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',coalesce(c.relacl::text,''),'rls',c.relrowsecurity) AS detail FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p')
 UNION ALL SELECT 'column',c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'acl',coalesce(a.attacl::text,'')) FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'constraint',conrelid::regclass::text||'.'||conname,jsonb_build_object('definition',pg_get_constraintdef(oid,true),'validated',convalidated) FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL SELECT 'index',i.indexrelid::regclass::text,jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace
 UNION ALL SELECT 'trigger',tgrelid::regclass::text||'.'||tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
 UNION ALL SELECT 'function',p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner)) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p')
 ) s ORDER BY kind,name`
export const catalogDigest=rows=>hash(JSON.stringify(canonical(rows)))
export function verifyCoreSchema(rows){
 const requireConstraint=(name,pattern)=>requireThat(rows.some(r=>r.kind==='constraint'&&r.name===name&&r.detail.validated===true&&pattern.test(r.detail.definition)),'staging_core_constraint_missing')
 requireConstraint('orders.orders_inventory_store_id',/UNIQUE \(store_id, id\)/)
 requireConstraint('inventory_reservations.inventory_reservations_store_id_order_id_fkey',/FOREIGN KEY \(store_id, order_id\) REFERENCES orders\(store_id, id\)/)
 requireConstraint('inventory_reservations.inventory_reservations_store_id_product_id_fkey',/FOREIGN KEY \(store_id, product_id\) REFERENCES products\(store_id, id\)/)
 requireConstraint('payment_events.payment_events_provider_provider_event_id_key',/UNIQUE \(provider, provider_event_id\)/)
 requireConstraint('products.products_stock_quantity_check',/stock_quantity >= 0[\s\S]*stock_quantity <= 1000000/)
 for(const name of ['orders_checkout_retry_unique','inventory_expiring_orders','orders_customer_cursor'])requireThat(rows.some(r=>r.kind==='index'&&r.name===name&&r.detail.valid===true&&r.detail.ready===true),'staging_core_index_missing')
 for(const name of ['inventory_movements.inventory_movements_no_rewrite','orders.track_proof_image','order_items.order_item_category_snapshot','orders.end_order_tracking_on_status'])requireThat(rows.some(r=>r.kind==='trigger'&&r.name===name&&r.detail.enabled==='O'),'staging_core_trigger_missing')
}
export async function loadPlan(){
 const manifest=JSON.parse(await readFile(new URL('./migration-plan.json',import.meta.url),'utf8'))
 const dir=new URL('../../sql/',import.meta.url),names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()
 requireThat(manifest.version===1&&manifest.files?.length===21&&JSON.stringify(names)===JSON.stringify(manifest.files.map(f=>f.filename)),'staging_migration_list_changed')
 const files=[]
 for(const [i,e]of manifest.files.entries()){
  requireThat(Number(e.filename.slice(0,3))===i+1,'staging_migration_sequence_changed')
  const raw=await readFile(new URL(e.filename,dir));requireThat(sourceHash(raw)===e.sha256,'staging_migration_source_changed')
  const list=statements(raw.toString('utf8'));if(i!==6){requireThat(list[0]==='BEGIN'&&list.at(-1)==='COMMIT','staging_transaction_wrapper_changed');list.shift();list.pop()}
  requireThat(list.length&&list.every(s=>!/^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|END|START TRANSACTION)\b/i.test(s)&&!/^CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(s)),'staging_nonatomic_sql')
  files.push({...e,body:list.map(s=>s+';').join('\n'),ledgerHashes:[e.sha256,hash(raw.toString('utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'))]})
 }
 return {files,manifestSha256:hash(JSON.stringify(manifest))}
}
export async function run021(client,plan,p){
 let open=false,broken=false,phase='preflight'
 try{
  await client.query('BEGIN');open=true
  // CREATE TABLE without a schema targets the first search_path schema. Keeping
  // pg_catalog first would incorrectly attempt DDL in the system catalog.
  for(const [key,value]of [['lock_timeout','3000ms'],['statement_timeout','30000ms'],['idle_in_transaction_session_timeout','30000ms'],['search_path','public, pg_catalog']])await client.query('SELECT set_config($1,$2,true)',[key,value])
  await assertDatabaseIdentity(client,p)
  const who=(await client.query('SELECT current_user AS role,current_database() AS database')).rows[0]
  requireThat(who?.role===p.migratorRole&&who.database===p.database,'staging_migration_role_rejected')
  await inspectDedicatedRoles(client,p)
  const lock=(await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',['stall:staging:public-schema'])).rows[0]
  requireThat(lock?.acquired===true,'staging_concurrent_migration_rejected')
  // Never create or adopt a ledger in an existing database.
  requireThat((await client.query("SELECT to_regclass('public.stall_schema_migrations') IS NOT NULL AS present")).rows[0]?.present===true,'staging_existing_ledger_required')
  await client.query('LOCK TABLE public.stall_schema_migrations IN EXCLUSIVE MODE')
  await client.query('LOCK TABLE public.orders IN ACCESS EXCLUSIVE MODE')
  const ledger=(await client.query('SELECT filename,sha256 FROM public.stall_schema_migrations ORDER BY filename')).rows
  requireThat([20,21].includes(ledger.length)&&ledger.every((r,i)=>r.filename===plan.files[i].filename&&plan.files[i].ledgerHashes.includes(String(r.sha256).trim())),'staging_ledger_history_rejected')
  const catalog=(await client.query(CATALOG_SQL)).rows
  verifyCoreSchema(catalog)
  const current=catalogDigest(catalog),file=plan.files[20]
  if(ledger.length===21){
   const a=(await client.query('SELECT * FROM public.staging_payment_migration_audits WHERE filename=$1',[file.filename])).rows[0]
   requireThat(a&&a.sha256===file.sha256&&a.instance_id===p.instanceId&&a.deployment_id===p.deploymentId&&a.branch_id===p.branchId&&a.pre_catalog_sha256===p.pre021CatalogSha256&&a.post_catalog_sha256===current,'staging_completed_migration_drift')
   await inspectRuntimePrivileges(client,p)
   await client.query('COMMIT');open=false;return {status:'already_verified',sha256:file.sha256}
  }
  requireThat(current===p.pre021CatalogSha256,'staging_pre021_schema_drift')
  phase='ddl';await client.query(file.body)
  phase='permissions';for(const sql of permissionPlan(p))await client.query(sql)
  await inspectRuntimePrivileges(client,p)
  const post=catalogDigest((await client.query(CATALOG_SQL)).rows)
  phase='ledger';requireThat((await client.query('INSERT INTO public.stall_schema_migrations(filename,sha256) VALUES($1,$2)',[file.filename,file.sha256])).rowCount===1,'staging_ledger_insert_unconfirmed')
  requireThat((await client.query(`INSERT INTO public.staging_payment_migration_audits(filename,sha256,deployment_id,instance_id,branch_id,pre_catalog_sha256,post_catalog_sha256) VALUES($1,$2,$3,$4,$5,$6,$7)`,[file.filename,file.sha256,p.deploymentId,p.instanceId,p.branchId,current,post])).rowCount===1,'staging_audit_insert_unconfirmed')
  phase='commit';await client.query('COMMIT');open=false
  return {status:'applied',sha256:file.sha256,postCatalogSha256:post}
 }catch(error){
  if(open)try{await client.query('ROLLBACK');open=false}catch{broken=true}
  if(phase==='commit'||['57014','08006','57P01'].includes(error.code)||!error.code){broken=true}
  if(phase==='commit')throw Object.assign(Error('staging_migration_commit_unknown_inspect_before_retry'),{code:'STAGING_COMMIT_UNKNOWN'})
  const code=error.code||(/^staging_[a-z_]+$/.test(error.message||'')?error.message:'STAGING_MIGRATION_FAILED')
  throw Object.assign(Error(code),{code,phase})
 }finally{client.release?.(broken)}
}
