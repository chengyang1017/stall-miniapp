import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertPreviewCompatibleJS } from '../../scripts/miniapp-output.mjs'

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)))
const compiler=join(root,'node_modules','typescript','lib','tsc.js')
const modernSource = `declare const row: any; const reply = row?.publicReplyRevisionId ?? ''; export { reply }`

function compile(target){
 const dir=mkdtempSync(join(tmpdir(),'stall-preview-tsc-'))
 try {
  const source=join(dir,'sample.ts'),output=join(dir,'sample.js')
  writeFileSync(source,modernSource)
  const result=spawnSync(process.execPath,[compiler,'--ignoreConfig','--target',target,'--module','commonjs','--skipLibCheck','--outDir',dir,source],{cwd:root,encoding:'utf8'})
  assert.equal(result.status,0,`tsc ${target} failed: ${result.stderr || ''}${result.stdout || ''}`)
  return readFileSync(output,'utf8')
 } finally {rmSync(dir,{recursive:true,force:true})}
}

test('real TypeScript ES2019 emission removes optional chaining and nullish coalescing',()=>{
 const result=compile('ES2019')
 assertPreviewCompatibleJS(result,'compiled.js')
 assert.doesNotMatch(result,/\?\.|\?\?/)
})

test('mutation: emitted ES2020 optional chaining is rejected by build guard',()=>{
 const result=compile('ES2020')
 assert.throws(()=>assertPreviewCompatibleJS(result,'bad-build.js'),/Preview-incompatible JS: bad-build\.js:.*OPTIONAL_CHAINING/)
})

test('mutation: injected nullish syntax is rejected by build guard',()=>{
 assert.throws(()=>assertPreviewCompatibleJS('const a = x ?? 1','injected.js'),/NULLISH_COALESCING/)
})

test('string literals mentioning optional chaining do not fail the build',()=>{
 assert.doesNotThrow(()=>assertPreviewCompatibleJS('const label = "row?.name"','plain.js'))
})
