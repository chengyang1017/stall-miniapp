import { isIP } from 'node:net'
import { check,V2,UUID,HEX,DIGEST,PURPOSES } from './policy.mjs'
export function grant(g,now=Date.now()) {
  const allowed=['version','profile','instance','runId','nonce','dbId','runnerId','networkId','bundleSha256','manifestSha256','receiptSha256','pgReference','pgImageId',
    'runnerReference','runnerImageId','purpose','role','scope','database','port','host','issuedAt','expiresAt','deadlineAt']
  // Even unused command/URL properties are forbidden, including false/empty values.
  check(g&&Object.keys(g).every(k=>allowed.includes(k)||['url','command','args','connectionString'].includes(k)),'grant_rejected')
  check(g?.version===1&&g.profile===V2.profile&&UUID.test(g.instance||'')&&g.instance!=='43805bf5-1391-4d3f-b8ce-e3bfa9448d48'&&
    UUID.test(g.runId||'')&&HEX.test(g.nonce||'')&&HEX.test(g.dbId||'')&&HEX.test(g.runnerId||'')&&HEX.test(g.networkId||'')&&
    HEX.test(g.bundleSha256||'')&&HEX.test(g.manifestSha256||'')&&HEX.test(g.receiptSha256||'')&&
    /^postgres@sha256:[a-f0-9]{64}$/.test(g.pgReference||'')&&DIGEST.test(g.pgImageId||'')&&
    /^stall-phase8-r2-runner@sha256:[a-f0-9]{64}$/.test(g.runnerReference||'')&&DIGEST.test(g.runnerImageId||''),'grant_rejected')
  check(Object.hasOwn(PURPOSES,g.purpose||'')&&g.role===PURPOSES[g.purpose].role&&g.scope===PURPOSES[g.purpose].scope,'grant_purpose_rejected')
  check(g.database===V2.database&&g.port===5432&&isIP(g.host)===4&&/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(g.host)&&
    !['url','command','args','connectionString'].some(k=>Object.hasOwn(g,k)),'grant_target_rejected')
  check(Number.isSafeInteger(g.issuedAt)&&Number.isSafeInteger(g.expiresAt)&&Number.isSafeInteger(g.deadlineAt)&&
    g.issuedAt<=now&&now<=g.expiresAt&&g.expiresAt>g.issuedAt&&g.expiresAt-g.issuedAt<=60000&&g.deadlineAt>g.expiresAt&&g.deadlineAt-g.issuedAt<=300000,'grant_expired')
  return g
}
export function pgOptions(g,password) {
  check(/^[a-f0-9]{64}$/.test(password),'credential_rejected')
  return {host:g.host,port:5432,database:V2.database,user:'stall_test_'+g.role,password,ssl:false,max:6,
    application_name:'stall-phase8-r2-'+g.runId,connectionTimeoutMillis:5000,query_timeout:12000,
    options:'-c search_path=public -c statement_timeout=8000 -c lock_timeout=4000 -c idle_in_transaction_session_timeout=15000 -c default_transaction_read_only='+(g.role==='observer'?'on':'off')}
}
export async function consume(g,io) {
  grant(g,io.now());check(io.hostname()===g.runnerId.slice(0,12),'runner_self_identity_rejected')
  await io.claim() // Persistent exclusive file, NOT tmpfs. Never removed on exit/restart.
  return g
}
