import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanJavaScript,scanWxml,checkConfig,auditProject } from '../../scripts/miniapp-preview-audit.mjs'

test('preview scanner detects optional chaining in generated JS with exact location',()=>{
 const found=scanJavaScript('const x = 1;\nif (row?.publicReplyRevisionId) {}','component.js')
 assert.equal(found.length,1)
 assert.equal(found[0].rule,'OPTIONAL_CHAINING')
 assert.equal(found[0].line,2)
})
test('preview scanner detects nullish coalescing and assignment',()=>{
 assert.deepEqual(scanJavaScript('const x = a ?? 1; x ??= 2').map(x=>x.rule),['NULLISH_COALESCING','NULLISH_ASSIGNMENT'])
})
test('preview scanner does not flag simple strings and comments',()=>{
 const source=`// row?.name\nconst message = 'x?.y ?? 1'; /* obj?.name */\nconst n = 3;`
 assert.deepEqual(scanJavaScript(source),[])
})
test('preview scanner rejects known broken checkbox-group opening tag',()=>{
 const source='<view>\n<checkbox disabled="{{loading}}"-group data-id="x"></checkbox-group>\n</view>'
 assert.equal(scanWxml(source,'delivery.wxml')[0].line,2)
})
test('preview scanner does not reject a valid checkbox-group',()=>{
 assert.deepEqual(scanWxml('<checkbox-group><checkbox value="1" /></checkbox-group>'),[])
})
test('preview configuration warns about ES2020/es6=false mismatch without calling it a definite compiler failure',()=>{
 const found=checkConfig({setting:{es6:false,useCompilerPlugins:['typescript']}},{compilerOptions:{target:'ES2020'}})
 assert.deepEqual(found.map(f=>f.rule),['BUILD_TARGET_MISMATCH'])
 assert.equal(found[0].severity,'warning')
})
test('end-to-end audit of disposable fixture detects both real preview blockers',()=>{
 const root=mkdtempSync(join(tmpdir(),'stall-preview-audit-fixture-'))
 try {
  mkdirSync(join(root,'miniprogram','pages'),{recursive:true})
  writeFileSync(join(root,'miniprogram','pages','foo.js'),'if (row?.id) {}')
  writeFileSync(join(root,'miniprogram','pages','foo.wxml'),'<checkbox disabled="{{ok}}"-group></checkbox-group>')
  writeFileSync(join(root,'miniprogram','app.json'),JSON.stringify({permission:{'scope.userLocation':{desc:'这是超过三十个字符的定位权限用途说明，用来确认检查能够识别超长说明文字。'}}}))
  const {findings,jsCount,wxmlCount}=auditProject(root)
  assert.equal(jsCount,1);assert.equal(wxmlCount,1)
  assert(findings.some(x=>x.rule==='OPTIONAL_CHAINING'))
  assert(findings.some(x=>x.rule==='BROKEN_CHECKBOX_GROUP'))
  assert(findings.some(x=>x.rule==='LOCATION_DESCRIPTION_TOO_LONG'))
 } finally {rmSync(root,{recursive:true,force:true})}
})
test('missing generated JS is reported as unverified, not as full preview success',()=>{
 const root=mkdtempSync(join(tmpdir(),'stall-preview-no-js-'))
 try {mkdirSync(join(root,'miniprogram'));const r=auditProject(root);assert(r.findings.some(x=>x.rule==='NO_JS_OUTPUT'))}
 finally{rmSync(root,{recursive:true,force:true})}
})
