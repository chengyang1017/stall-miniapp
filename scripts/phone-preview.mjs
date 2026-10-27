import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPhoneProfile } from './phone-preview-profile.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
try {
  const [mode, file, ...extra] = process.argv.slice(2)
  if (!['--check', '--prepare'].includes(mode) || !file || extra.length) throw Error('Use --check or --prepare <public-staging-profile.json>')
  const profile = readPhoneProfile(path.resolve(file))
  console.log(`Public staging profile: ${profile.apiBase}; store=${profile.storeSlug}; AppID=${profile.appId}`)
  console.log('Syntax only: DNS/TLS, WeChat domains/account rights, database and merchant binding are NOT verified.')
  if (mode === '--prepare') {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-miniapp.mjs'), 'combined'], {
      cwd: root, stdio: 'inherit', env: { ...process.env, STALL_PHONE_PREVIEW_PROFILE: path.resolve(file) }
    })
    if (result.status !== 0) throw Error('Phone preview build failed; no upload, deployment or database operation was performed')
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
