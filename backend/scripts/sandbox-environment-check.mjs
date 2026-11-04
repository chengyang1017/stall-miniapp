import {inspectSandboxEnvironment} from '../testing/sandbox-acceptance/guards.mjs'
const report=inspectSandboxEnvironment(process.env)
console.log(JSON.stringify(report,null,2))
process.exitCode=report.ready?0:2
