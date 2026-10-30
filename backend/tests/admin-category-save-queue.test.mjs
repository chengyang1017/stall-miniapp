import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const source=readFileSync(new URL('../../miniprogram/pages/admin-categories/admin-categories.ts',import.meta.url),'utf8')
test('category editor is optimistic and serializes revisioned cloud writes',()=>{
 assert.match(source,/this\.saveQueue\.push\(change\)/)
 assert.match(source,/this\.renderCategories\(this\.applyCloudChange\(this\.data\.categories,change\)\)/)
 assert.match(source,/while\(this\.saveQueue\.length\)/)
 assert.match(source,/expectedRevision:this\.revision/)
 assert.match(source,/this\.saveQueue\.shift\(\)/)
 assert.match(source,/this\.renderCategories\(this\.confirmed\)/)
})
test('category edit controls are not gated by cloudBusy during background save',()=>{
 for(const method of ['addCategory','beginRename','saveRename','openNewIconPicker','selectIcon','handleStart']){
  const from=source.indexOf('  '+method+'('),to=source.indexOf('\n  ',from+3)
  assert.ok(from>=0,method)
  assert.doesNotMatch(source.slice(from,to>from?to:undefined),/if\(this\.data\.cloudBusy/)
 }
})