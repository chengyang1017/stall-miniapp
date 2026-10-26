// Explicit, endpoint-pinned Docker transport. No commands on import.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { isAbsolute, dirname } from 'node:path'
import { requireSafe, assertDockerContext, TARGET } from './policy.mjs'
const execute = promisify(execFile)
export function dockerEnvironment(env) {
  requireSafe(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.DOCKER_TLS_VERIFY && !env.DOCKER_CERT_PATH, 'phase8_docker_override_rejected')
  requireSafe(typeof env.STALL_PHASE8_DOCKER_EXE === 'string' && isAbsolute(env.STALL_PHASE8_DOCKER_EXE), 'phase8_docker_executable_required')
  const clean = Object.fromEntries(['SystemRoot','WINDIR','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP'].filter(k => env[k]).map(k => [k,env[k]]))
  clean.PATH = dirname(env.STALL_PHASE8_DOCKER_EXE)
  return { executable: env.STALL_PHASE8_DOCKER_EXE, env: clean }
}
export function createDocker(env, executor = execute) {
  const controlled = dockerEnvironment(env)
  let bound
  const run = async (args, extra = {}) => {
    try { return (await executor(controlled.executable,args,{env:{...controlled.env,...extra},timeout:15000,maxBuffer:1048576,windowsHide:true})).stdout }
    catch { requireSafe(false,'phase8_docker_command_failed') }
  }
  const context = async () => {
    const rows = JSON.parse(await run(['context','inspect']))
    requireSafe(rows.length === 1,'phase8_docker_context_changed'); assertDockerContext(rows[0])
    return {name:rows[0].Name,endpoint:rows[0].Endpoints.docker.Host}
  }
  const revalidate = async () => {
    const current = await context()
    requireSafe(bound && current.name === bound.name && current.endpoint === bound.endpoint,'phase8_docker_context_changed')
  }
  const command = async (args,extra) => {
    const allowed={container:['ls','inspect','start'],volume:['ls','inspect','create'],network:['ls','inspect','create'],image:['inspect']}
    requireSafe(args[0]==='compose'?args[1]==='--project-name'&&args[2]===TARGET.project&&args.includes('create')&&args.includes('--no-recreate')&&args.includes('--no-build')&&args.includes('never')&&!args.includes('up'):
      allowed[args[0]]?.includes(args[1]),'phase8_docker_action_rejected')
    await revalidate(); return run(['--host',bound.endpoint,...args],extra)
  }
  const inspect = async (kind,name) => {
    const rows = JSON.parse(await command([kind,'inspect',name])); requireSafe(rows.length===1,'phase8_resource_inspect_failed'); return rows[0]
  }
  return {
    async bind() { bound = await context(); return {...bound} }, revalidate, command, inspect,
    async inventory() {
      const out=[]
      for (const kind of ['container','volume','network']) {
        const raw=await command([kind,'ls',...(kind==='container'?['--all']:[]),'--format','{{json .}}'])
        for (const line of raw.split(/\r?\n/).filter(Boolean)) {
          const r=JSON.parse(line), labels=typeof r.Labels==='string'?Object.fromEntries(r.Labels.split(',').map(s=>{const p=s.indexOf('=');return [s.slice(0,p),s.slice(p+1)]})):r.Labels||{}
          out.push({kind,name:r.Name||r.Names,project:labels['com.docker.compose.project'],nonce:labels['stall.phase8.launch']})
        }
      }
      return out
    },
    async ensureImage(image) {
      const r=await inspect('image',image.reference)
      requireSafe(r.Id===image.imageId && r.RepoDigests?.some(d=>d.endsWith('@'+image.reference.split('@')[1])),'phase8_local_image_digest_mismatch')
    },
    async inspectAll() { return [await inspect('container',TARGET.container),await inspect('volume',TARGET.volume),await inspect('network',TARGET.network)] }
  }
}
