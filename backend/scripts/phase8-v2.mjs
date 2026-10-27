import { pathToFileURL } from 'node:url'
import { createDatabase,recoverCreated,run } from '../testing/phase8-v2/controller.mjs'
import { hostIO } from '../testing/phase8-v2/host.mjs'
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===2)console.log('Offline only. No Docker or database operation. V2 needs separate image, material and operation authorization.')
  else if(process.argv.length!==3||!['--create-db','--recover-created','--run'].includes(process.argv[2])){console.error('phase8_v2_arguments_rejected');process.exitCode=1}
  else try{const env=process.env;console.log(JSON.stringify(await ({'--create-db':createDatabase,'--recover-created':recoverCreated,'--run':run}[process.argv[2]])(env,hostIO(env))))}
  catch(e){console.error(/^phase8_[a-z0-9_]+$/.test(e?.phase8Code||'')?e.phase8Code:'phase8_v2_operation_failed');process.exitCode=1}
}
