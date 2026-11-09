import test from 'node:test'
import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {buildMigrationPolicyPlan} from '../scripts/tencent-sql-policy-plan.mjs'
import {inspectRestoredSource} from '../scripts/tencent-restored-source-review.mjs'
const dir=fileURLToPath(new URL('../sql/',import.meta.url))
async function input(){
 const policy=await buildMigrationPolicyPlan(dir)
 const missing=policy.migrations.slice(21).map(x=>x.filename)
 const source={audit:'read_only_migration_source',migration:{
  cleanPrefix:true,issues:[],applied:21,expected:37,missing
 },tables:[],extensions:[]}
 return {source,policy}
}
test('restored 021 source emits explicit staged review, not executable SQL',async()=>{
 const {source,policy}=await input()
 const plan=inspectRestoredSource(source,policy)
 assert.equal(plan.cutoverAllowed,false)
 assert.equal(plan.sqlExecutionAuthorized,false)
 assert.equal(plan.exclusions.length,5)
 assert.equal(plan.groups.length,4)
 assert(plan.groups.every(x=>x.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)&&
  f.execution==='review_only_do_not_apply')))
 assert(plan.groups.find(g=>g.stage==='live_wechat_pay_schema').files.some(f=>f.filename.startsWith('037_')))
 assert(!JSON.stringify(plan.groups).includes('022_stripe_test_refund_jobs.sql'))
})
test('missing checksum ledger, out-of-order or different branch history are denied',async()=>{
 const {source,policy}=await input()
 assert.throws(()=>inspectRestoredSource({...source,migration:{...source.migration,applied:33}},policy),/source_inventory_not_approved_baseline/)
 assert.throws(()=>inspectRestoredSource({...source,migration:{...source.migration,issues:[{kind:'checksum_mismatch'}]}},policy),/source_inventory_not_approved_baseline/)
 assert.throws(()=>inspectRestoredSource({...source,migration:{...source.migration,missing:[...source.migration.missing].reverse()}},policy),/source_inventory_not_approved_baseline/)
 assert.throws(()=>inspectRestoredSource(source,{...policy,canApplyToProduction:true}),/source_inventory_not_approved_baseline/)
})
test('policy edits without reviewed SHA256 are rejected',async()=>{
 const {source,policy}=await input()
 const changed=structuredClone(policy)
 changed.migrations.find(x=>x.filename.startsWith('034_')).sha256='not-a-hash'
 assert.throws(()=>inspectRestoredSource(source,changed),/source_inventory_not_approved_baseline/)
})
