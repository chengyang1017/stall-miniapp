import test from 'node:test'
import assert from 'node:assert/strict'
import {migrationTarget,compareMigrationLedger} from '../scripts/migration-source-inventory.mjs'

test('source identity is derived without ever returning credentials',()=>{
 const t=migrationTarget('postgresql://app_user:SECRET@ep-source.example.neon.tech:5432/neondb?sslmode=require','ep-source.example.neon.tech')
 assert.equal(t.database,'neondb')
 assert.equal(t.user,'app_user')
 assert.equal(t.host,'ep-source.example.neon.tech')
 assert.equal(t.hostSha256.length,16)
 assert.doesNotMatch(JSON.stringify(t),/SECRET|sslmode=require/)
})
test('host mismatch, invalid URLs and missing target confirmation are refused',()=>{
 const raw='postgresql://app_user:SECRET@ep-source.example.neon.tech/neondb'
 assert.throws(()=>migrationTarget(raw,'ep-different.example.neon.tech'),/source_host_mismatch/)
 assert.throws(()=>migrationTarget(raw,''),/database_url_and_expected_host_required/)
 assert.throws(()=>migrationTarget('https://example.com','example.com'),/invalid_database_url/)
 assert.throws(()=>migrationTarget('postgresql://a@db.example.com/neondb','db.example.com'),/invalid_database_url/)
})
test('ledger accepts only exact SHA256 matching prefixes',()=>{
 const files=[{filename:'001_init.sql',sha256:'one'},{filename:'002_foo.sql',sha256:'two'},{filename:'003_bar.sql',sha256:'three'}]
 const report=compareMigrationLedger(files,[files[0],files[1]])
 assert.equal(report.cleanPrefix,true)
 assert.deepEqual(report.missing,['003_bar.sql'])
 assert.equal(report.readyForLatest,false)
 assert.equal(compareMigrationLedger(files,files).readyForLatest,true)
})
test('out-of-order, unknown and changed migration checksums block deployment',()=>{
 const files=[{filename:'001_init.sql',sha256:'one'},{filename:'002_foo.sql',sha256:'two'}]
 assert.equal(compareMigrationLedger(files,[files[1]]).cleanPrefix,false)
 const bad=compareMigrationLedger(files,[files[0],{filename:'002_foo.sql',sha256:'changed'}])
 assert.equal(bad.cleanPrefix,false)
 assert.equal(bad.issues[0].kind,'checksum_mismatch')
 const unknown=compareMigrationLedger(files,[files[0],{filename:'999_unknown.sql',sha256:'x'}])
 assert.equal(unknown.cleanPrefix,false)
 assert.equal(unknown.issues[0].kind,'unknown')
})
