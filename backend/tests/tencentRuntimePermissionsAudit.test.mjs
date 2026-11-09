import test from 'node:test'
import assert from 'node:assert/strict'
import {LEGACY_TABLES,CANDIDATE_TABLES,LEDGERS,REQUIRED_COLUMN_GRANTS,validateRuntimeAuditTarget,auditRuntimePrivileges}
 from '../scripts/tencent-runtime-permissions-audit.mjs'

const baseEnv=()=>({
 APP_ENV:'isolated-migration',PG_SSL:'true',
 TENCENT_ROLE_AUDIT:'READ_ONLY_ISOLATED',
 TENCENT_ROLE_AUDIT_TARGET:'stall_tencent_drill',
 TENCENT_DRILL_EXPECTED_HOST:'db.tencent.internal',
 DATABASE_URL:'postgresql://reviewer:fake-for-test@db.tencent.internal:5432/stall_tencent_drill'
})
const all=[...new Set([...LEGACY_TABLES,...CANDIDATE_TABLES,...LEDGERS])]
function mockDb({missing=[],extraGrants={},denyGrants={},denyColumns={},missingColumns={},attributes={},dbName='stall_tencent_drill'}={}){
 const calls=[]
 const existing=all.filter(t=>!missing.includes(t))
 const db={calls,async query(sql,params=[]){
  calls.push({sql,params})
  if(sql.startsWith('SELECT current_database()'))return {rows:[{database:dbName,executor:'drill_auditor'}]}
  if(sql.includes('FROM pg_roles WHERE rolname=$1'))return {rows:[{rolname:'stall_tencent_runtime',
   rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,
   rolinherit:true,rolbypassrls:false,...attributes}]}
  if(sql.includes('JOIN pg_roles member ON'))return {rows:[]}
  if(sql.includes('has_schema_privilege'))return {rows:[{allowed:true}]}
  if(sql.includes('c.relname=ANY'))return {rows:existing.map(name=>({name}))}
  if(sql.includes('FROM pg_attribute a')){
   const [table,columns]=params
   return {rows:columns.filter(column=>!missingColumns[table]?.includes(column)).map(attname=>({attname}))}
  }
  if(sql.includes('has_column_privilege')){
   const [role,table,column,privilege]=params
   assert.equal(role,'stall_tencent_runtime')
   const valid=REQUIRED_COLUMN_GRANTS[table]?.[privilege]?.includes(column)===true
   return {rows:[{allowed:valid&&!denyColumns[table]?.includes(column+':'+privilege)}]}
  }
  if(sql.includes('has_table_privilege')){
   const [role,table,privilege]=params
   assert.equal(role,'stall_tencent_runtime')
   let allowed=privilege==='SELECT'
   if(table==='orders'&&['INSERT','UPDATE'].includes(privilege))allowed=true
   if(table==='products'&&['INSERT','UPDATE'].includes(privilege))allowed=true
   if(table==='order_items'&&privilege==='INSERT')allowed=true
   if(table==='auth_sessions'&&['INSERT','DELETE'].includes(privilege))allowed=true
   if(['support_messages','inventory_movements','payment_events'].includes(table)&&privilege==='INSERT')allowed=true
   if(table==='inventory_reservations'&&['INSERT','UPDATE'].includes(privilege))allowed=true
   if(LEDGERS.includes(table))allowed=false
   if(extraGrants[table]?.includes(privilege))allowed=true
   if(denyGrants[table]?.includes(privilege))allowed=false
   return {rows:[{allowed}]}
  }
  return {rows:[]}
 }}
 return db
}
test('local default is read-only and requires exact Tencent isolated target',()=>{
 assert.equal(validateRuntimeAuditTarget(baseEnv()).database,'stall_tencent_drill')
 for(const changes of [
  {TENCENT_ROLE_AUDIT:''},{APP_ENV:'production'},
  {TENCENT_ROLE_AUDIT_TARGET:'neondb'},
  {PG_SSL:'false'},
  {DATABASE_URL:'postgresql://u:pass@ep-old.neon.tech/neondb',
   TENCENT_DRILL_EXPECTED_HOST:'ep-old.neon.tech'},
  {DATABASE_URL:'postgresql://u:pass@db.tencent.internal:5432/stall'}
 ]){
  assert.throws(()=>validateRuntimeAuditTarget({...baseEnv(),...changes}),/audit_/)
 }
})
test('valid limited role yields passing read-only baseline, never issues data writes',async()=>{
 const db=mockDb()
 const result=await auditRuntimePrivileges(db)
 assert.equal(result.passed,true)
 assert.deepEqual(result.violations,[])
 assert.equal(result.presentTables,all.length)
 assert.equal(db.calls[0].sql,'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
 assert.equal(db.calls.at(-1).sql,'COMMIT')
 assert(db.calls.every(x=>!/^\s*(?:GRANT|REVOKE|ALTER|INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE)\b/i.test(x.sql)))
})
test('missing historical table is a failure instead of assuming privilege denied',async()=>{
 const db=mockDb({missing:['order_status_events']})
 const report=await auditRuntimePrivileges(db)
 assert.equal(report.passed,false)
 assert(report.violations.some(v=>v.code==='table_missing'&&v.table==='order_status_events'))
})
test('detects dangerous grants on financial audit, migration ledger and legacy table',async()=>{
 const db=mockDb({extraGrants:{
  wechat_abnormal_collection_reviews:['DELETE'],
  stall_schema_migrations:['UPDATE'],
  orders:['TRUNCATE']
 }})
 const report=await auditRuntimePrivileges(db)
 assert.equal(report.passed,false)
 for(const code of ['append_only_write_exposure','migration_ledger_write_exposure','legacy_truncate_exposure'])
  assert(report.violations.some(v=>v.code===code),code)
})
test('detects missing order write grant and elevated runtime role',async()=>{
 const db=mockDb({denyGrants:{orders:['INSERT']},attributes:{rolsuper:true}})
 const report=await auditRuntimePrivileges(db)
 assert(report.violations.some(v=>v.code==='missing_business_insert'&&v.table==='orders'))
 assert(report.violations.some(v=>v.code==='unsafe_role_attribute'&&v.table==='rolsuper'))
})
test('mismatched database forces rollback and no misleading success report',async()=>{
 const db=mockDb({dbName:'neondb'})
 await assert.rejects(()=>auditRuntimePrivileges(db),/isolated_role_audit_identity_mismatch/)
 assert.equal(db.calls.at(-1).sql,'ROLLBACK')
})

test('column-specific grants count without requiring whole-table UPDATE',async()=>{
 const db=mockDb()
 const out=await auditRuntimePrivileges(db)
 assert(out.checkedColumnPrivileges>=20)
 assert.equal(out.passed,true)
 assert(db.calls.some(c=>c.sql.includes('has_column_privilege')&&c.params[1]==='customer_account_sessions'&&c.params[3]==='UPDATE'))
})
test('missing account-session revoke column privilege is actionable',async()=>{
 const db=mockDb({denyColumns:{customer_account_sessions:['revoked_at:UPDATE']}})
 const out=await auditRuntimePrivileges(db)
 assert.equal(out.passed,false)
 assert(out.violations.some(v=>v.code==='missing_column_update'&&v.table==='customer_account_sessions.revoked_at'))
})
test('missing refund reconciliation privilege and absent avatar column block validation',async()=>{
 const db=mockDb({denyColumns:{wechat_live_refunds:['reconcile_lease_token:UPDATE']},
 missingColumns:{customer_accounts:['avatar_photo_key']}})
 const out=await auditRuntimePrivileges(db)
 assert(out.violations.some(v=>v.code==='missing_column_update'&&v.table==='wechat_live_refunds.reconcile_lease_token'))
 assert(out.violations.some(v=>v.code==='required_column_missing'&&v.table==='customer_accounts.avatar_photo_key'))
})
