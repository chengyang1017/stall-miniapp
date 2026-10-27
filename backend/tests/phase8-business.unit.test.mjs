// Offline safety tests, NOT PostgreSQL integration results. No Docker/DB connection.
import test from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {fileURLToPath} from 'node:url'
import {readFile} from 'node:fs/promises'
import {configuration,PURPOSES} from '../testing/phase8-v2/policy.mjs'
import {grant} from '../testing/phase8-v2/grants.mjs'
import {run} from '../testing/phase8-v2/controller.mjs'
import {BUSINESS_CASES,runBusiness} from '../testing/phase8-v2/business.mjs'
import {sourceManifest} from '../testing/phase8-v2/artifact.mjs'
import {guardedPool} from '../testing/phase8/leases.mjs'
import {environment,pg,node,token,now,hostFake,paths,runner,resources,instance,runId,dbId,runnerId} from './helpers/phase8-v2-fixtures.mjs'
const env=()=>({...environment('business'),PHASE8_V2_TEST:'V2_BUSINESS_TESTS_ONLY'})
const code=expected=>e=>e.phase8Code===expected
test('Windows ACL verifier uses actual PowerShell environment syntax',async()=>{
 const text=await readFile(new URL('../testing/phase8-v2/host.mjs',import.meta.url),'utf8')
 assert.match(text,/\$env:PHASE8_V2_ACL_PATH/);assert.match(text,/\$env:PHASE8_V2_ACL_ROOT/);assert.doesNotMatch(text,/\$env\.PHASE8_V2_ACL_/)
})
test('business purpose requires a distinct explicit write authorization',()=>{
 assert.throws(()=>configuration(environment('business'),'run',pg,node),code('phase8_v2_business_not_authorized'))
 const c=configuration(env(),'run',pg,node);assert.equal(c.purpose,'business');assert.deepEqual(PURPOSES.business,{role:'app',scope:'business-consistency-v1',state:'ready'})
})
for(const patch of [{role:'observer'},{role:'migrator'},{scope:'fixture-connections'}])test('business grant refuses role/scope borrowing '+JSON.stringify(patch),()=>{
 assert.throws(()=>grant({...token('business'),...patch},now),code('phase8_v2_grant_purpose_rejected'))
})
for(const purpose of ['fixture','bootstrap','initialize','ready'])test('business suite refuses '+purpose+' before any query',async()=>{
 let touched=false
 await assert.rejects(()=>runBusiness({query(){touched=true},connect(){touched=true}},token(purpose)),code('phase8_v2_business_scope_rejected'))
 assert.equal(touched,false)
})
test('business suite has unique stable case names and no skipped placeholder cases',()=>{
 assert.equal(BUSINESS_CASES.length,26);assert.equal(new Set(BUSINESS_CASES.map(x=>x.name)).size,26)
 assert(BUSINESS_CASES.every(x=>typeof x.run==='function'&&Object.isFrozen(x)))
})
test('business artifact pins actual business dependency closure without importing service entrypoint',async()=>{
 const manifest=await sourceManifest(fileURLToPath(new URL('../../',import.meta.url))),names=manifest.files.map(x=>x.path)
 for(const path of ['backend/src/checkout.mjs','backend/src/orderWorkflow.mjs','backend/src/inventory.mjs','backend/testing/phase8-v2/business.mjs'])assert(names.includes(path))
 assert.equal(names.length,45);assert(!names.some(x=>/server\.mjs|\.env|secret|receipt/.test(x)))
})
test('active connection transport error destroys its lease once and prevents reuse',async()=>{
 const raw=new EventEmitter(),releases=[];raw.query=async()=>({rows:[]});raw.release=e=>releases.push(e)
 const p=guardedPool({connect:async()=>raw,end:async()=>{}},async()=>{}),c=await p.connect(),failure=Object.assign(Error('synthetic termination'),{code:'57P01'})
 raw.emit('error',failure);assert.deepEqual(releases,[failure]);c.release();assert.equal(releases.length,1)
 await assert.rejects(()=>c.query('SELECT 1'),code('phase8_connection_released'));await p.end()
})
test('business job rejects missing ready prerequisite before Docker creation',async()=>{
 const io=hostFake();io.prerequisite=async()=>({status:'bootstrap_verified'})
 await assert.rejects(()=>run(env(),io),code('phase8_v2_prerequisite_rejected'));assert(!io.calls.some(x=>x.startsWith('create:')||x==='bind'))
})
// Controller fixtures contain only synthetic metadata, not a simulated SQL engine.
function businessIO(failed=0){
 const io=hostFake(),p={...paths,secret:'/synthetic/r2/secrets/app.secret'}
 io.reserveRun=async()=>p;io.prerequisite=async()=>({profile:'internal-runner-v1',instance,dbId,status:'ready_verified'})
 let running=false
 io.docker.resources=async()=>resources({runnerRunning:running})
 io.docker.runner=async()=>{const r=runner(running);r.Mounts[2].Source=p.secret;return r}
 io.docker.start=async()=>{running=true}
 io.docker.waitResult=async()=>{running=false;return {version:1,profile:'internal-runner-v1',instance,runId,dbId,runnerId,purpose:'business',status:'business_finished',passed:failed?0:1,failed,skipped:0,results:[{name:'synthetic report contract only',status:failed?'failed':'passed'}]}}
 return io
}
test('failed database assertion report is preserved then rejects a success result',async()=>{
 const io=businessIO(1);let saved
 io.writeResult=async(_c,r)=>{saved=r}
 await assert.rejects(()=>run(env(),io),code('phase8_v2_business_assertions_failed'))
 assert.equal(saved.failed,1);assert(io.calls.some(x=>x.startsWith('failed:')))
})
