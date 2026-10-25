// Read-only deployment preflight. Does not connect to databases or cloud services.
import { readdir, readFile, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const warnings = []
const ok = (label) => console.log(`PASS ${label}`)
const fail = (label) => { console.error(`FAIL ${label}`); problems.push(label) }
const warn = (label) => { console.warn(`WARN ${label}`); warnings.push(label) }
const version = Number(process.versions.node.split('.')[0])
version >= 20 ? ok(`Node.js ${process.version}`) : fail(`Node.js 20+ required (found ${process.version})`)

const sqlDir = path.join(base, 'sql')
const filenames = (await readdir(sqlDir)).filter(x => x.endsWith('.sql')).sort()
let last = 0
for (const name of filenames) {
  const m = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name)
  if (!m || Number(m[1]) !== last + 1) fail(`Migration sequence issue: ${name}`)
  if (m) last = Number(m[1])
  const data = await readFile(path.join(sqlDir, name))
  if (!data.length) fail(`Empty migration: ${name}`)
  else console.log(`SQL ${name} SHA256 ${createHash('sha256').update(data).digest('hex')}`)
}
filenames.length === 20 && last === 20 ? ok('Found 001-020 SQL migrations in order') : fail(`Expected migrations 001-020; found ${filenames.length} (last=${last})`)

const srcDir = path.join(base, 'src')
for (const name of (await readdir(srcDir)).filter(x => x.endsWith('.mjs')).sort()) {
  const child = spawnSync(process.execPath, ['--check', path.join(srcDir, name)], {encoding:'utf8'})
  child.status === 0 ? ok(`Syntax ${name}`) : fail(`Syntax ${name}: ${(child.stderr || '').trim().slice(0, 500)}`)
}
for (const name of (await readdir(path.join(base, 'scripts'))).filter(x => x.endsWith('.mjs') && x !== 'preflight.mjs').sort()) {
  const child = spawnSync(process.execPath, ['--check', path.join(base,'scripts',name)], {encoding:'utf8'})
  child.status === 0 ? ok(`Syntax scripts/${name}`) : fail(`Syntax scripts/${name}`)
}
for (const key of ['DATABASE_URL','WX_APPID','WX_APPSECRET','S3_BUCKET','S3_ENDPOINT','S3_ACCESS_KEY_ID','S3_SECRET_ACCESS_KEY','IMAGE_PUBLIC_BASE_URL']) {
  const value = process.env[key] || ''
  if (!value || /CHANGE_ME|example\.com|your[-_]/i.test(value)) warn(`${key} not configured for runtime integration`)
  else ok(`${key} configured (value hidden)`)
}
if (process.env.DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
  try {
    const u = new URL(process.env.DATABASE_URL)
    if (['127.0.0.1','localhost'].includes(u.hostname)) warn('DATABASE_URL points to localhost (development only)')
  } catch { fail('DATABASE_URL is not a valid URL') }
}
if (process.env.IMAGE_PUBLIC_BASE_URL && !/^https:\/\//.test(process.env.IMAGE_PUBLIC_BASE_URL)) fail('IMAGE_PUBLIC_BASE_URL must use https://')
if (process.env.PG_SSL !== 'true') warn('PG_SSL is not true: check TLS configuration before remote deployment')
console.log(`\nResults: ${problems.length} failed, ${warnings.length} warnings`)
console.log('Read-only check: no SQL executed and no cloud resources changed.')
process.exitCode = problems.length ? 1 : 0
