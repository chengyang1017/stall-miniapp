// Offline CLI preflight. Shared with the Tencent runtime startup guard.
import {fileURLToPath} from 'node:url'
import path from 'node:path'
export {checkTencentProductionEnvironment} from '../src/tencentProductionStartupGate.mjs'
import {checkTencentProductionEnvironment} from '../src/tencentProductionStartupGate.mjs'
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=checkTencentProductionEnvironment(process.env)
 console.log(JSON.stringify(report,null,2))
 if(!report.safeToStart)process.exitCode=2
}
