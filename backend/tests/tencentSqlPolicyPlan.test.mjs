import test from 'node:test'
import assert from 'node:assert/strict'
import {readdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {classifySqlMigrations,buildMigrationPolicyPlan} from '../scripts/tencent-sql-policy-plan.mjs'
const dir=fileURLToPath(new URL('../sql/',import.meta.url))
test('all 001-037 are classified and sandbox SQL is explicitly excluded',async()=>{
 const p=await buildMigrationPolicyPlan(dir)
 assert.equal(p.canApplyToProduction,false)
 assert.equal(p.migrations.length,37)
 assert.deepEqual(p.summary,{historical:20,preserveExisting:1,sandboxExcluded:5,individualReviewRequired:11})
 assert.equal(p.migrations.find(x=>x.filename.startsWith('022_')).policy,'exclude_sandbox')
 assert.equal(p.migrations.find(x=>x.filename.startsWith('021_')).policy,'preserve_existing_staging_ledger_only')
 assert.equal(p.migrations.find(x=>x.filename.startsWith('034_')).policy,'review_live_payment')
 assert(p.migrations.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)))
})
test('unreviewed new migration, missing numbered file or duplicate is refused',async()=>{
 const files=(await readdir(dir)).filter(x=>x.endsWith('.sql'))
 assert.throws(()=>classifySqlMigrations([...files,'038_unreviewed.sql']),/migration_inventory_not_exactly/)
 assert.throws(()=>classifySqlMigrations(files.filter(x=>!x.startsWith('022_'))),/migration_inventory_not_exactly/)
 assert.throws(()=>classifySqlMigrations([...files.filter(x=>!x.startsWith('022_')),'022_surprise.sql']),/production_migration_policy_requires_review/)
 assert.throws(()=>classifySqlMigrations([...files.slice(0,-1),files[0]]),/migration_inventory_not_exactly/)
})
