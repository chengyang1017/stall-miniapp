// Build into a disposable sibling, then update the existing WeChat DevTools project in place.
// This avoids deleting an open phone-preview directory (Windows EPERM).
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readPhoneProfile } from './phone-preview-profile.mjs'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const target=path.join(root,'dist','phone-preview')
const profileFile=path.resolve(root,process.argv[2]||'.local/phone-staging.json')
let temporary=''
try{
  const profile=readPhoneProfile(profileFile)
  if(!fs.existsSync(target)||!fs.existsSync(path.join(target,'.stall-build-output'))||!fs.existsSync(path.join(target,'project.config.json'))){
    throw Error('Existing dist/phone-preview is missing or not a verified generated project; refusing to replace it')
  }
  const existingApp=JSON.parse(fs.readFileSync(path.join(target,'project.config.json'),'utf8'))
  if(existingApp.appid&&existingApp.appid!==profile.appId)throw Error('AppID mismatch: refusing to overwrite another project')
  const suffix=Date.now().toString(36)+'-'+process.pid.toString(36)
  const output='phone-preview-'+suffix
  temporary=path.join(root,'dist',output)
  console.log('Building staged Phone Preview with '+profile.apiBase)
  const result=spawnSync(process.execPath,[path.join(root,'scripts/phone-preview.mjs'),'--prepare',profileFile,'--output',output],{cwd:root,stdio:'inherit'})
  if(result.status!==0)throw Error('Build failed; the original Phone Preview was not changed')
  const source=path.join(temporary,'miniprogram')
  const builtApp=JSON.parse(fs.readFileSync(path.join(source,'app.json'),'utf8'))
  if(!builtApp.tabBar?.list?.some(t=>t.pagePath==='pages/orders/orders'))throw Error('Missing Orders tab in the new build')
  const builtProfile=JSON.parse(fs.readFileSync(path.join(temporary,'phone-preview.json'),'utf8'))
  if(builtProfile.apiBase!==profile.apiBase||builtProfile.appId!==profile.appId)throw Error('Build profile mismatch')
  // Never remove the target directory or its WeChat developer private settings.
  fs.cpSync(temporary,target,{recursive:true,force:true})
  const installed=JSON.parse(fs.readFileSync(path.join(target,'phone-preview.json'),'utf8'))
  const installedApp=JSON.parse(fs.readFileSync(path.join(target,'miniprogram','app.json'),'utf8'))
  if(installed.apiBase!==profile.apiBase||!installedApp.tabBar?.list?.some(t=>t.pagePath==='pages/orders/orders'))throw Error('Post-copy verification failed')
  console.log('SUCCESS: original dist/phone-preview updated in place. Orders tab and staging API verified.')
  console.log('Keep WeChat DevTools open; click Compile to reload.')
}catch(error){
  console.error('Phone Preview update failed: '+error.message)
  process.exitCode=1
}finally{
  if(temporary&&fs.existsSync(temporary)){
    try{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:2,retryDelay:150})}
    catch(error){console.warn('Temporary build cleanup skipped: '+error.message)}
  }
}
