const role=/^[a-z_][a-z0-9_]{0,62}$/
export function permissionPlan(p){
 if(!role.test(p.database||'')||![p.applicationRole,p.migratorRole,p.authorizationRole].every(r=>role.test(r))||new Set([p.applicationRole,p.migratorRole,p.authorizationRole]).size!==3)throw Error('distinct_catalog_verified_roles_required')
 const a='"'+p.applicationRole+'"',manager='"'+p.authorizationRole+'"'
 return [
  `GRANT CONNECT ON DATABASE "${p.database}" TO ${a},${manager}`,
  `GRANT USAGE ON SCHEMA public,staging_control TO ${a}`,
  `GRANT SELECT ON staging_control.deployment_identity TO ${a}`,
  `REVOKE ALL ON staging_payment_environment,staging_payment_testers,staging_payment_confirmations,staging_payment_migration_audits FROM ${a}`,
  `GRANT SELECT ON staging_payment_environment,staging_payment_testers,staging_payment_confirmations TO ${a}`,
  `GRANT UPDATE(lock_key) ON staging_payment_environment,staging_payment_testers TO ${a}`,
  `GRANT INSERT ON staging_payment_confirmations TO ${a}`,
  `GRANT SELECT ON auth_sessions,stores,orders,order_items,products,inventory_reservations,payment_events TO ${a}`,
  `GRANT UPDATE(revoked_at) ON auth_sessions TO ${a}`,
  `GRANT UPDATE(name) ON stores TO ${a}`,
  `GRANT UPDATE(payment_status,payment_source,simulation_instance_id,paid_at,inventory_state,updated_at) ON orders TO ${a}`,
  `GRANT UPDATE(stock_quantity,inventory_version) ON products TO ${a}`,
  `GRANT UPDATE(state,resolved_at) ON inventory_reservations TO ${a}`,
  `GRANT INSERT ON payment_events,inventory_movements TO ${a}`,
  `GRANT USAGE ON SCHEMA public TO ${manager}`,
  `GRANT SELECT,INSERT ON staging_payment_testers TO ${manager}`,
  `GRANT UPDATE(expires_at,revoked_at) ON staging_payment_testers TO ${manager}`
 ].map(s=>s+';')
}
export async function inspectDedicatedRoles(db,p){
 const roles=(await db.query('SELECT count(*)::int AS count,bool_or(rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls) AS unsafe FROM pg_roles WHERE rolname=ANY($1::text[])',[[p.applicationRole,p.migratorRole,p.authorizationRole]])).rows[0]
 if(roles?.count!==3||roles.unsafe!==false)throw Error('staging_dedicated_roles_required')
}
export async function inspectRuntimePrivileges(db,p){
 await inspectDedicatedRoles(db,p)
 const rows=(await db.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,
  pg_has_role($3,$1,'MEMBER') AS migrator_member,pg_has_role($3,$2,'MEMBER') AS authorization_member,
  has_schema_privilege($3,'public','CREATE') AS schema_create,
  has_schema_privilege($3,'staging_control','CREATE') AS control_schema_create,
  NOT has_schema_privilege($3,'public','USAGE') AS missing_public_usage,
  NOT has_schema_privilege($3,'staging_control','USAGE') AS missing_control_usage,
  NOT has_database_privilege($3,current_database(),'CONNECT') AS missing_connect,
  EXISTS(SELECT 1 FROM pg_class c WHERE c.relnamespace IN ('public'::regnamespace,'staging_control'::regnamespace) AND pg_get_userbyid(c.relowner)=$3) AS owns_tables
  FROM pg_roles r WHERE r.rolname=$3`,[p.migratorRole,p.authorizationRole,p.applicationRole])).rows
 if(rows.length!==1||Object.values(rows[0]).some(v=>v!==false))throw Error('staging_runtime_role_excessive_privilege')
 const checks=[
  ['staging_payment_environment','SELECT',true],['staging_payment_testers','SELECT',true],['staging_payment_confirmations','SELECT',true],['staging_payment_confirmations','INSERT',true],
  ['staging_payment_environment','INSERT,UPDATE,DELETE,TRUNCATE',false],['staging_payment_testers','INSERT,UPDATE,DELETE,TRUNCATE',false],['staging_payment_confirmations','UPDATE,DELETE,TRUNCATE',false]
 ]
 for(const table of ['auth_sessions','stores','orders','order_items','products','inventory_reservations','payment_events'])checks.push([table,'SELECT',true])
 for(const table of ['payment_events','inventory_movements'])checks.push([table,'INSERT',true])
 for(const [table,privilege,expected]of checks){const r=(await db.query('SELECT has_table_privilege($3,$1,$2) AS ok',['public.'+table,privilege,p.applicationRole])).rows[0];if(r?.ok!==expected)throw Error('staging_runtime_table_privilege_rejected')}
 for(const [privilege,expected]of [['SELECT',true],['INSERT,UPDATE,DELETE,TRUNCATE',false]]){
  const r=(await db.query('SELECT has_table_privilege($3,$1,$2) AS ok',['staging_control.deployment_identity',privilege,p.applicationRole])).rows[0]
  if(r?.ok!==expected)throw Error('staging_control_privilege_rejected')
 }
 for(const [table,privilege]of [['staging_control.deployment_identity','INSERT,UPDATE,REFERENCES'],['public.staging_payment_environment','INSERT,REFERENCES'],['public.staging_payment_testers','INSERT,REFERENCES'],['public.staging_payment_confirmations','UPDATE,REFERENCES']]){
  if((await db.query('SELECT has_any_column_privilege($1,$2,$3) AS unsafe',[p.applicationRole,table,privilege])).rows[0]?.unsafe!==false)throw Error('staging_sensitive_column_privilege_rejected')
 }
 for(const table of ['staging_payment_environment','staging_payment_testers']){
  const columns=(await db.query(`SELECT a.attname,has_column_privilege($2,c.oid,a.attnum,'UPDATE') AS writable
   FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.oid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped`,['public.'+table,p.applicationRole])).rows
  if(!columns.length||columns.some(c=>c.writable!==(c.attname==='lock_key')))throw Error('staging_authorization_column_privilege_rejected')
 }
 return true
}
