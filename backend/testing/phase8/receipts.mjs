// Host-owned audit receipts only. Never creates directories, edits passwords,
// deletes a receipt or clears Docker resources. Private directory is a prerequisite.
import { open, readFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireSafe, TARGET } from './policy.mjs'
export function receiptPaths(env) {
  const dir=env.STALL_PHASE8_RECEIPT_DIR, root=fileURLToPath(new URL('../../../',import.meta.url))
  requireSafe(typeof dir==='string' && path.isAbsolute(dir) && !path.resolve(dir).toLowerCase().startsWith(path.resolve(root).toLowerCase()),'phase8_private_receipt_directory_required')
  return {dir,record:path.join(dir,TARGET.project+'.json'),launch:path.join(dir,TARGET.project+'.launch'),restart:path.join(dir,TARGET.project+'.restart.json')}
}
async function regular(file) { const s=await lstat(file); requireSafe(s.isFile()&&!s.isSymbolicLink(),'phase8_receipt_file_rejected') }
export async function readReceipt(env,config) {
  const paths=receiptPaths(env); await regular(paths.record)
  const r=JSON.parse(await readFile(paths.record,'utf8'))
  requireSafe(r.version===1 && r.instance===config.instance && r.image===config.image.reference && r.imageId===config.image.imageId &&
    /^[a-f0-9]{64}$/.test(r.nonce||'') && /^[a-f0-9]{64}$/.test(r.containerId||'') &&
    (config.purpose==='inspect'?['created_verified','ready_verified','restarting']:['created_verified','ready_verified']).includes(r.status),'phase8_receipt_identity_rejected')
  return {...r,paths}
}
export async function claimReceipt(env,mode) {
  const paths=receiptPaths(env), stat=await lstat(paths.dir)
  requireSafe(stat.isDirectory()&&!stat.isSymbolicLink(),'phase8_private_receipt_directory_required')
  let fd
  try { fd=await open(mode==='first'?paths.record:paths.restart,'wx',0o600) } catch { requireSafe(false,'phase8_launch_already_attempted') }
  const write=async value=>{await fd.truncate(0);await fd.write(JSON.stringify(value,null,2)+'\n',0,'utf8');await fd.sync()}
  return {paths,write,close:()=>fd.close(),
    async launch(text) {
      const file=mode==='first'?await open(paths.launch,'wx',0o600):(await regular(paths.launch),await open(paths.launch,'r+'))
      try {await file.truncate(0);await file.write(text,0,'utf8');await file.sync()} finally {await file.close()}
    },
    async updateOriginal(value) {
      if(mode==='first')return write(value)
      await regular(paths.record); const file=await open(paths.record,'r+')
      try{await file.truncate(0);await file.write(JSON.stringify(value,null,2)+'\n',0,'utf8');await file.sync()}finally{await file.close()}
    }
  }
}
