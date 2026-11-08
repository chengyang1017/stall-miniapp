import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {compareRestoredInventories} from '../scripts/compare-migration-inventories.mjs'
const digest=rows=>createHash('sha256').update(JSON.stringify([...rows].sort((a,b)=>a.name.localeCompare(b.name,'en')))).digest('hex')
const fixture=()=>{
 const tables=[{name:'public.orders',exactRows:6},{name:'public.stores',exactRows:1}]
 return {audit:'read_only_migration_source',database:'neondb',pgVersion:'18.1',
  tables,tableCountSha256:digest(tables),
  objectReferences:[{table:'stores',column:'image_object_key',nonNullReferences:0}],
  extensions:[{extname:'plpgsql',extversion:'1.0'}],
  migration:{applied:21,expected:37,missing:['022.sql'],issues:[],cleanPrefix:true}}
}
const variant=(f,change)=>{const value=structuredClone(f);change(value);
 value.tableCountSha256=digest(value.tables);return value}
test('source and first restored snapshot with matching counts pass without opening connections',()=>{
 const input=fixture(),out=compareRestoredInventories(input,structuredClone(input))
 assert.equal(out.passed,true)
 assert.equal(out.problems.length,0)
 assert.equal(out.sourceTables,2)
 assert.match(out.limitations.join(' '),/not establish equality/)
})
test('missing tables, changed count and extra tables all block cutover',()=>{
 const source=fixture()
 const target=variant(source,f=>{f.tables=[{name:'public.orders',exactRows:5},{name:'public.extra',exactRows:1}];f.objectReferences=[]})
 const out=compareRestoredInventories(source,target)
 assert.equal(out.passed,false)
 assert.deepEqual(out.problems.filter(p=>p.kind.includes('table')).map(x=>x.kind),
 ['table_count_mismatch','missing_target_table','extra_target_table'])
})
test('migration summary and storage references must match before applying pending migrations',()=>{
 const source=fixture(),target=variant(source,f=>{
  f.migration.applied=37;f.migration.missing=[]
  f.objectReferences[0].nonNullReferences=1
 })
 const out=compareRestoredInventories(source,target)
 assert(out.problems.some(p=>p.kind==='migration_ledger_summary_mismatch'))
 assert(out.problems.some(p=>p.kind==='object_reference_count_mismatch'))
})
test('mismatched PG major version and extensions are blocked',()=>{
 const source=fixture(),target=variant(source,f=>{
  f.pgVersion='17.4'
  f.extensions[0].extversion='1.1'
 })
 const out=compareRestoredInventories(source,target)
 assert(out.problems.some(p=>p.kind==='postgres_major_version_mismatch'))
 assert(out.problems.some(p=>p.kind==='extension_version_mismatch'))
})
test('tampered counts and duplicate tables cannot bypass snapshot digest',()=>{
 const source=fixture(),target=structuredClone(source);target.tables[0].exactRows=3
 assert.throws(()=>compareRestoredInventories(source,target),/invalid_migration_inventory/)
 const duplicate=variant(source,f=>f.tables.push({...f.tables[0]}))
 assert.throws(()=>compareRestoredInventories(source,duplicate),/invalid_migration_inventory/)
})
