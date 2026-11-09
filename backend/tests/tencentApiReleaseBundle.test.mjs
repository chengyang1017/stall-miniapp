import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {createRelease,verifyRelease,readReleaseInputs,inspectRuntimeImports} from '../scripts/tencent-api-release-bundle.mjs'
test('live backend package is bundled without backup or test artifacts',async()=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'stall-release-test-'))
 const output=path.join(parent,'artifact')
 try{
  const inputs=await readReleaseInputs()
  assert(inputs.some(f=>f.name==='backend/src/server.mjs'))
  assert(inputs.every(f=>!f.name.includes('.bak-')&&!f.name.includes('tests/')&&!f.name.includes('.env')))
  const manifest=await createRelease(output,{commit:'a'.repeat(40)})
  assert.equal(manifest.releaseReadyForProduction,false)
  assert.equal((await verifyRelease(output)).files,manifest.files.length)
  await assert.rejects(()=>createRelease(output),/release_destination_exists/)
  await writeFile(path.join(output,'backend/src/server.mjs'),'tampered')
  await assert.rejects(()=>verifyRelease(output),/release_file_integrity_failed/)
 }finally{await rm(parent,{recursive:true,force:true})}
})
test('release verification rejects new secrets and extra files even when manifest valid',async()=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'stall-release-extra-'))
 try{
  const output=path.join(parent,'artifact')
  await createRelease(output)
  await writeFile(path.join(output,'backend/.env'),'not-a-real-secret')
  await assert.rejects(()=>verifyRelease(output),/unexpected_release_file/)
 }finally{await rm(parent,{recursive:true,force:true})}
})
test('disallows unknown relative module imports',()=>{
 assert.throws(()=>inspectRuntimeImports([{name:'backend/src/main.mjs',bytes:Buffer.from("import './missing.mjs'")}]),/runtime_relative_import_missing/)
})
