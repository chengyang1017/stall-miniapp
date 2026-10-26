// Inert unless explicitly invoked. Actual Docker mutations are FUTURE authorized
// operations, never invoked by B0 tests. No pull, stop, remove or recreate path.
import { pathToFileURL,fileURLToPath } from 'node:url'
import { resolve,isAbsolute } from 'node:path'
import { lstat } from 'node:fs/promises'
import { createDocker } from '../testing/phase8/docker.mjs'
import { controlledLaunch,launchConfig } from '../testing/phase8/launch.mjs'
import { claimReceipt,readReceipt } from '../testing/phase8/receipts.mjs'
import { loadImageApproval,inspectReady } from '../testing/phase8/postgres.mjs'
import { safeCode,requireSafe,TARGET } from '../testing/phase8/policy.mjs'
export async function launchTestInstance(env,mode) {
  const approval=await loadImageApproval(),config=launchConfig(env,mode,approval)
  const docker=createDocker(env),root=fileURLToPath(new URL('../../',import.meta.url)),compose=fileURLToPath(new URL('../compose.test.yml',import.meta.url)),emptyEnv=fileURLToPath(new URL('../testing/phase8/empty.env',import.meta.url))
  const secretEnv={}
  if(mode==='first')for(const kind of ['ADMIN','MIGRATOR','APP','OBSERVER']) {
    const key='STALL_PHASE8_'+kind+'_PASSWORD_FILE',file=env[key]
    requireSafe(typeof file==='string'&&isAbsolute(file)&&!resolve(file).toLowerCase().startsWith(resolve(root).toLowerCase()),'phase8_external_secret_file_required')
    const s=await lstat(file);requireSafe(s.isFile()&&!s.isSymbolicLink(),'phase8_external_secret_file_required');secretEnv[key]=file
  }
  const labels=r=>['--label','com.docker.compose.project='+TARGET.project,'--label','stall.phase8.scope='+TARGET.scope,'--label','stall.phase8.instance='+r.instance,'--label','stall.phase8.launch='+r.nonce]
  return controlledLaunch(env,mode,{approval,docker,
    lock:m=>claimReceipt(env,m), previous:()=>readReceipt(env,{...config,purpose:'inspect'}),
    receiptText:(r,m)=>`MODE=${m}\nINSTANCE=${r.instance}\nTOKEN=${r.nonce}\nIMAGE=${r.image}\nCONTAINER=${r.containerId||''}\n`,
    async create(kind,r){await docker.command(kind==='volume'?['volume','create',...labels(r),'--label','com.docker.compose.volume=phase8-data',TARGET.volume]:
      ['network','create','--internal',...labels(r),'--label','com.docker.compose.network=phase8-network',TARGET.network])},
    async createContainer(r,receipt){await docker.command(['compose','--project-name',TARGET.project,'--file',compose,'--env-file',emptyEnv,'create','--no-recreate','--no-build','--pull','never',TARGET.service],{
      ...secretEnv,STALL_PHASE8_INSTANCE_ID:r.instance,STALL_PHASE8_BOOTSTRAP_CONFIRM:'CREATE_NEW_PHASE8_INSTANCE',
      STALL_PHASE8_IMAGE:r.image,STALL_PHASE8_LAUNCH_TOKEN:r.nonce,STALL_PHASE8_LAUNCH_RECEIPT:receipt})},
    start:id=>docker.command(['container','start',id]), verifyDatabase:()=>inspectReady(env)
  })
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===2)console.log('Offline only. No Docker command. Controlled first/restart actions require separate authorization and approved image digest.')
  else if(process.argv.length!==3||!['--create-first','--restart-verified'].includes(process.argv[2])){console.error('phase8_invalid_arguments');process.exitCode=1}
  else try{await launchTestInstance(process.env,process.argv[2]==='--create-first'?'first':'restart');console.log('Phase8 controlled launch verified. No migration was executed.')}
  catch(error){console.error(safeCode(error));process.exitCode=1}
}
