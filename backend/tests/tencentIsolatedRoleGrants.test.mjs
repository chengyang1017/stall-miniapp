import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const template=new URL('../../deploy/tencent/isolated-runtime-grants.sql.template',import.meta.url)
test('Tencent isolated role grant template is limited to verified restored drill target',async()=>{
 const sql=await readFile(template,'utf8')
 assert.match(sql,/current_database\(\) <> 'stall_tencent_drill'/)
 assert.match(sql,/current_user <> 'stall_tencent_migrator'/)
 assert.match(sql,/approved_runtime_role_missing/)
 assert.match(sql,/runtime_role_has_unsafe_role_attributes/)
 assert.match(sql,/runtime_role_has_global_data_privileges/)
 assert.match(sql,/expected_reviewed_tables_missing/)
 assert.match(sql,/^BEGIN;/m)
 assert.match(sql,/COMMIT;\s*$/)
})
test('payment review and refund event records are append-only to runtime',async()=>{
 const sql=await readFile(template,'utf8')
 for(const table of ['wechat_abnormal_collection_reviews','wechat_live_refund_events']){
  const grants=[...sql.matchAll(/^GRANT\s+([^;\n]+)\s+ON\s+public\.(\w+)\s+TO\s+stall_tencent_runtime\s*;/gmi)]
   .filter(x=>x[2]===table)
  assert.equal(grants.length,1)
  assert.equal(grants[0][1].trim(),'SELECT, INSERT')
 }
 assert.doesNotMatch(sql,/GRANT\s+ALL\b/i)
 assert.doesNotMatch(sql,/GRANT\s+.*\bTO\s+PUBLIC\b/i)
 assert.doesNotMatch(sql,/ALTER\s+ROLE\s+stall_tencent_runtime\s+SUPERUSER/i)
})
test('narrow explicit grant covers refund reconciliation columns and no ledger writes',async()=>{
 const sql=await readFile(template,'utf8')
 const match=sql.match(/GRANT UPDATE \(([\s\S]*?)\) ON public\.wechat_live_refunds TO stall_tencent_runtime;/)
 assert(match)
 for(const name of ['status','provider_refund_id','provider_status','last_error',
  'claimed_at','updated_at','reconcile_next_at','reconcile_attempts','reconcile_lease_token','reconcile_lease_until'])
  assert(match[1].split(',').map(x=>x.trim()).includes(name),name)
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE).*stall_tencent_drill_migrations/i)
})
