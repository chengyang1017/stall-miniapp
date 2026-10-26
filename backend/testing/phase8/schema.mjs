// Read-only catalog attestation. Baseline is captured once inside initialization's
// schema+ledger transaction. Nothing here repairs drift or updates a baseline.
import { createHash } from 'node:crypto'
import { requireSafe } from './policy.mjs'
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]))
  return value
}
export const fingerprint = rows => createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex')
export const CATALOG_SQL = `SELECT kind,name,detail FROM (
 SELECT 'table' AS kind,n.nspname||'.'||c.relname AS name,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',coalesce(c.relacl::text,''),'rls',c.relrowsecurity,
 'observer_write',has_table_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,REFERENCES'),
 'app_danger',has_table_privilege('stall_test_app',c.oid,'TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege('stall_test_app',c.oid,'REFERENCES')) AS detail
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','phase8_control')
 UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
 'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'acl',coalesce(a.attacl::text,''),'default',pg_get_expr(d.adbin,d.adrelid))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','phase8_control') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'constraint',conrelid::regclass::text||'.'||conname,jsonb_build_object('definition',pg_get_constraintdef(oid,true),'validated',convalidated)
 FROM pg_constraint WHERE connamespace='public'::regnamespace
 UNION ALL SELECT 'index',i.indexrelid::regclass::text,jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'ready',i.indisready)
 FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid WHERE c.relnamespace='public'::regnamespace
 UNION ALL SELECT 'trigger',tgrelid::regclass::text||'.'||tgname,jsonb_build_object('definition',pg_get_triggerdef(t.oid,true),'enabled',t.tgenabled)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal
 UNION ALL SELECT 'function',p.oid::regprocedure::text,jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef)
 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
 UNION ALL SELECT 'schema',nspname,jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',coalesce(nspacl::text,''),
 'app_create',has_schema_privilege('stall_test_app',oid,'CREATE'),'observer_create',has_schema_privilege('stall_test_observer',oid,'CREATE'))
 FROM pg_namespace WHERE nspname IN ('public','phase8_control')
 ) s ORDER BY kind,name`
export const CONTROL_ACL_SQL = `SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,
 (has_table_privilege('stall_test_app',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege('stall_test_app',c.oid,'INSERT,UPDATE,REFERENCES')) AS app_write,
 (has_table_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') OR has_any_column_privilege('stall_test_observer',c.oid,'INSERT,UPDATE,REFERENCES')) AS observer_write
 FROM pg_class c WHERE c.relnamespace='phase8_control'::regnamespace AND c.relkind='r' ORDER BY c.relname`
export function assertCatalog(rows, controls) {
  requireSafe(Array.isArray(rows) && rows.length > 0, 'phase8_catalog_missing')
  const find = (kind, name) => rows.find(r => r.kind === kind && r.name === name)
  for (const name of ['orders_checkout_retry_unique','inventory_held_product','inventory_expiring_orders']) requireSafe(find('index',name)?.detail?.valid === true, 'phase8_key_index_missing')
  for (const name of ['products.products_stock_quantity_check','inventory_reservations.inventory_reservations_pkey',
    'inventory_reservations.inventory_reservations_store_id_order_id_fkey','inventory_reservations.inventory_reservations_store_id_product_id_fkey',
    'inventory_movements.inventory_movements_store_id_order_id_fkey','inventory_movements.inventory_movements_store_id_product_id_fkey']) {
    requireSafe(find('constraint',name)?.detail?.validated === true, 'phase8_key_constraint_missing')
  }
  for (const name of ['inventory_movements.inventory_movements_no_rewrite','order_items.order_item_category_snapshot',
    'order_items.capture_order_image','orders.end_order_tracking_on_status']) requireSafe(find('trigger',name)?.detail?.enabled === 'O', 'phase8_key_trigger_missing')
  for (const row of rows) {
    if (row.kind === 'table' && row.name.startsWith('public.')) requireSafe(row.detail.owner === 'stall_test_migrator' && row.detail.observer_write === false && row.detail.app_danger === false, 'phase8_table_privilege_drift')
    if (row.kind === 'function') requireSafe(row.detail.definer === false && row.detail.owner === 'stall_test_migrator', 'phase8_function_privilege_drift')
    if (row.kind === 'schema') requireSafe(row.detail.observer_create === false && (row.name !== 'phase8_control' || row.detail.app_create === false), 'phase8_schema_privilege_drift')
  }
  requireSafe(controls.length === 3 && ['instance','migrations','schema_baseline'].every(name => {
    const r = controls.find(c => c.relname === name)
    return r && r.owner === (name === 'instance' ? 'stall_test_bootstrap' : 'stall_test_migrator') && r.app_write === false && r.observer_write === false
  }), 'phase8_control_acl_drift')
}
export async function inspectCatalog(client) {
  const rows = (await client.query(CATALOG_SQL)).rows, controls = (await client.query(CONTROL_ACL_SQL)).rows
  assertCatalog(rows, controls); return rows
}
export function assertBaseline(actual, stored, markerHash) {
  requireSafe(typeof markerHash === 'string' && /^[a-f0-9]{64}$/.test(markerHash) && fingerprint(stored) === markerHash && fingerprint(actual) === markerHash, 'phase8_schema_drift')
}
export function assertReadyTransition(result) { requireSafe(result?.rowCount===1,'phase8_ready_transition_failed') }
