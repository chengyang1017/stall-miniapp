import {registerHooks} from 'node:module'
import {execFileSync} from 'node:child_process'
const names=['checkout.mjs','orderWorkflow.mjs','merchantOrderQuery.mjs','paymentSettlementTransaction.mjs','stripeTestPaymentRoute.mjs','stripeCheckoutGateway.mjs','stripeTestRefund.mjs','stripeTestRefundJobs.mjs']
const sources=new Map(names.map(n=>[n,execFileSync('git',['show','cd3097a:backend/src/'+n],{encoding:'utf8'})]))
registerHooks({load(url,context,next){const name=url.split('/').at(-1);if(url.includes('/backend/src/')&&sources.has(name))return {format:'module',source:sources.get(name),shortCircuit:true};return next(url,context)}})
