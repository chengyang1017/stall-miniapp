import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {cloudSource} from '../../scripts/phone-preview-profile.mjs'

const root=fileURLToPath(new URL('../../',import.meta.url))
const sandbox={version:1,environment:'staging',apiBase:'https://stall-miniapp-stripe-test.onrender.com',
 storeSlug:'stall-test',appId:'wxeb1890c397d038d8'}
test('generated phone preview flags are defined, live always off, Sandbox only on dedicated test backend',()=>{
 const sandboxSrc=cloudSource(sandbox)
 assert.match(sandboxSrc,/export const LIVE_WECHAT_PAY_ENABLED:boolean=false/)
 assert.match(sandboxSrc,/export const PAYMENT_SANDBOX_UI_ENABLED:boolean=true/)
 const genericSrc=cloudSource({...sandbox,apiBase:'https://api.staging.unit.test'})
 assert.match(genericSrc,/export const LIVE_WECHAT_PAY_ENABLED:boolean=false/)
 assert.match(genericSrc,/export const PAYMENT_SANDBOX_UI_ENABLED:boolean=false/)
})
test('actual isolated phone preview Combined build compiles current payment controllers',()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),'stall-phone-payment-smoke-'))
 const outputName='phone-preview-ci-payment-smoke',outputDir=path.join(root,'dist',outputName)
 try{
  const profilePath=path.join(tmp,'profile.json')
  writeFileSync(profilePath,JSON.stringify(sandbox))
  const result=spawnSync(process.execPath,['scripts/phone-preview.mjs','--prepare',profilePath,'--output',outputName],
   {cwd:root,encoding:'utf8',timeout:120000})
  assert.equal(result.status,0,[result.stdout,result.stderr].join('\n').slice(-5000))
  const js=readFileSync(path.join(outputDir,'miniprogram','config','cloud.js'),'utf8')
  assert.match(js,/LIVE_WECHAT_PAY_ENABLED = false/)
  assert.match(js,/PAYMENT_SANDBOX_UI_ENABLED = true/)
  assert.equal(JSON.parse(readFileSync(path.join(outputDir,'phone-preview.json'),'utf8')).deploymentVerified,false)
 }finally{
  if(existsSync(outputDir))rmSync(outputDir,{recursive:true,force:true})
  rmSync(tmp,{recursive:true,force:true})
 }
})
