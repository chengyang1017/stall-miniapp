import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareTencentDrill,validateDrillTarget,unwrapSingleTransaction,applyDrill,DRILL_FILES} from '../scripts/tencent-isolated-db-drill.mjs'

const env=()=>({
 APP_ENV:'isolated-migration',PG_SSL:'true',
 DATABASE_URL:'postgresql://migrator:fixture-secret@db-tencent.internal:5432/stall_tencent_drill',
 TENCENT_DRILL_EXPECTED_HOST:'db-tencent.internal',
 TENCENT_DRILL_APPLY:'APPLY_ONLY_ISOLATED_RESTORED_DB',
 WECHAT_PAY_LIVE_ENABLED:'false'
})
test('default drill plan contains identity, COS profile/session, live payment, never sandbox',async()=>{
 const p=await prepareTencentDrill()
 assert.equal(p.source.length,21)
 assert.deepEqual(p.scripts.map(s=>s.filename),DRILL_FILES)
 assert(p.scripts.every(s=>/^[a-f0-9]{64}$/.test(s.sha256)))
 assert(p.scripts.every(s=>!/^\s*BEGIN\s*;/i.test(s.sql)&&!/COMMIT\s*;\s*$/i.test(s.sql)))
 assert.equal(p.productionApproved,false)
})
test('only a specifically named, authorized isolated database passes target check',()=>{
 assert.equal(validateDrillTarget(env()).database,'stall_tencent_drill')
 for(const change of [
  {DATABASE_URL:'postgresql://x:secret@ep-old.neon.tech/neondb',TENCENT_DRILL_EXPECTED_HOST:'ep-old.neon.tech'},
  {DATABASE_URL:'postgresql://x:secret@db-tencent.internal:5432/stall'},
  {TENCENT_DRILL_EXPECTED_HOST:'db-other.internal'},
  {TENCENT_DRILL_APPLY:''},
  {APP_ENV:'production'},
  {WECHAT_PAY_LIVE_ENABLED:'true'},
  {PG_SSL:'false'}
 ]){
  assert.throws(()=>validateDrillTarget({...env(),...change}),/drill_|isolated_|live_payment/)
 }
})
test('reject arbitrary SQL transaction wrappers',()=>{
 assert.equal(unwrapSingleTransaction('-- reviewed\nBEGIN;\nSELECT 1;\nCOMMIT;').trim(),'SELECT 1;')
 assert.throws(()=>unwrapSingleTransaction('SELECT 1;'),/unsafe_sql_transaction_wrapper/)
 assert.throws(()=>unwrapSingleTransaction('BEGIN; SELECT 1; COMMIT; COMMIT;'),/unsafe_sql_transaction_wrapper/)
})
function fakeClient(plan,{ledgerChanged=false,existingTables=false,sqlFails=false}={}){
 const logs=[],records=[]
 return {logs,records,async query(sql,params){
  logs.push({sql,params})
  if(sql.startsWith('SELECT current_database()'))return {rows:[{database:'stall_tencent_drill',role:'migrator'}]}
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]}
  if(sql.startsWith('SELECT filename,sha256 FROM public.stall_schema_migrations'))return {rows:ledgerChanged?plan.source.slice(0,-1):plan.source}
  if(sql.includes("to_regclass('public.stall_tencent_drill_migrations')"))return {rows:[{found:false}]}
  if(sql.includes("to_regclass('public.customer_accounts')"))return {rows:[{found:existingTables}]}
  if(sql.startsWith('SELECT filename,sha256 FROM public.stall_tencent_drill_migrations'))return {rows:[]}
  if(sql.startsWith('SELECT sha256 FROM public.stall_tencent_drill_migrations'))return {rows:records.filter(r=>r.filename===params[0]).map(r=>({sha256:r.sha256}))}
  if(sql.startsWith('INSERT INTO public.stall_tencent_drill_migrations')){records.push({filename:params[0],sha256:params[1]});return {rows:[]}}
  if(sqlFails&&sql.includes('CREATE TABLE wechat_live_prepays'))throw Error('simulated DDL failure')
  return {rows:[]}
 }}
}
test('successful isolated drill inserts each ledger row inside its SQL transaction',async()=>{
 const plan=await prepareTencentDrill(),db=fakeClient(plan)
 const result=await applyDrill(db,plan)
 assert.equal(result.applied.length,6)
 assert.equal(db.records.length,6)
 const statements=db.logs.map(x=>x.sql)
 for(const file of DRILL_FILES){
  const i=db.logs.findIndex(x=>x.sql.startsWith('INSERT INTO public.stall_tencent_drill_migrations')&&x.params[0]===file)
  assert(i>0)
  assert.equal(statements[i+1],'COMMIT')
 }
 assert(statements.includes('SELECT pg_advisory_unlock(552193, 20261109)'))
})
test('mismatched source ledger and untracked schema refuse before any DDL',async()=>{
 const plan=await prepareTencentDrill()
 for(const config of [{ledgerChanged:true},{existingTables:true}]){
  const db=fakeClient(plan,config)
  await assert.rejects(()=>applyDrill(db,plan),/source_ledger_not_exact|untracked_target_tables_present/)
  assert(!db.logs.some(x=>x.sql.startsWith('CREATE TABLE IF NOT EXISTS public.stall_tencent_drill_migrations')))
  assert(db.logs.some(x=>x.sql==='ROLLBACK'))
 }
})
test('migration SQL failure rolls back the target transaction and never records failed file',async()=>{
 const plan=await prepareTencentDrill(),db=fakeClient(plan,{sqlFails:true})
 await assert.rejects(()=>applyDrill(db,plan),/simulated DDL failure/)
 assert.deepEqual(db.records.map(x=>x.filename),['023_customer_identity_groundwork.sql','tencent_isolated_customer_profile_sessions.sql'])
 const log=db.logs.map(x=>x.sql)
 assert(log.includes('ROLLBACK'))
 assert(log.includes('SELECT pg_advisory_unlock(552193, 20261109)'))
})

test('COS-backed profile/session drill uses no staging permissions or private avatar bytea',async()=>{
 const plan=await prepareTencentDrill()
 const sql=plan.scripts.find(x=>x.filename==='tencent_isolated_customer_profile_sessions.sql')?.sql
 assert(sql)
 for(const field of ['nickname','avatar_style','avatar_photo_key','customer_account_sessions','token_hash'])
  assert(sql.includes(field),field)
 const statements=sql.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n')
 assert(!/stall_payment_app_limited|sbx04_app_least|\bGRANT\s/i.test(statements))
 assert(!/image_bytes\s+bytea/i.test(sql))
 assert(plan.scripts.findIndex(x=>x.filename==='023_customer_identity_groundwork.sql')<
  plan.scripts.findIndex(x=>x.filename==='tencent_isolated_customer_profile_sessions.sql'))
 assert(plan.scripts.findIndex(x=>x.filename==='tencent_isolated_customer_profile_sessions.sql')<
  plan.scripts.findIndex(x=>x.filename==='034_wechat_live_prepays.sql'))
})
