// Local offline allowlists only; collect all suite failures without hiding them.
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('..',import.meta.url))
const commands=[['--check','backend/src/server.mjs'],['scripts/verify-frontend.mjs']]
let failed=false
for(const args of commands){
 const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'})
 if(r.error||r.status!==0)failed=true
}
// The backend test script explicitly lists offline payment/order regressions.
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','test','--prefix','backend'],{cwd:root,stdio:'inherit',shell:process.platform==='win32'})
if(r.error||r.status!==0)failed=true
process.exitCode=failed?1:0
