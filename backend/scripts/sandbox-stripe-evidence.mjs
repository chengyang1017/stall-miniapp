import {readFileSync} from 'node:fs'
import {verifyTestSession,verifyTestWebhook} from '../testing/sandbox-acceptance/stripe-evidence.mjs'
try{
 let report
 if(process.argv[2]==='session')report=await verifyTestSession(process.env)
 else if(process.argv[2]==='webhook'&&process.argv[3])report=verifyTestWebhook(readFileSync(process.argv[3]),process.env.SBX_STRIPE_SIGNATURE,process.env.STRIPE_TEST_WEBHOOK_SECRET)
 else throw Error('usage')
 console.log(JSON.stringify(report,null,2))
}catch{
 console.error('NOT_VERIFIED: check explicit test authorization, expected transaction, credentials, signature age and provider availability. Secret values and raw errors suppressed.')
 process.exitCode=1
}
