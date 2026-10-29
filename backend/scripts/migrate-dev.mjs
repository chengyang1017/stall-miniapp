// Strictly local development database migration runner; never targets a remote DB.
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const raw = process.env.DATABASE_URL
if (!raw) throw new Error('Set DATABASE_URL to a LOCAL stall_dev database before running')
const url = new URL(raw)
if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname) || url.pathname !== '/stall_dev') {
  throw new Error('Refusing nonlocal or non-stall_dev database')
}
if (process.env.CONFIRM_DEV_MIGRATIONS !== 'YES') throw new Error('Set CONFIRM_DEV_MIGRATIONS=YES explicitly')
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql')
const files = (await readdir(base)).filter(n => /^\d{3}_[a-z0-9_]+\.sql$/.test(n)).sort()
if (files.length !== 21 || files.some((n,i) => Number(n.slice(0,3)) !== i+1)) throw new Error('Expected migrations 001 through 021 in order')
const client = new Client({ connectionString: raw, connectionTimeoutMillis: 5000 })
try {
  await client.connect()
  // Refuse DB which contains user tables but does not have our migration history.
  const existing = await client.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public'`)
  const names = existing.rows.map(x => x.tablename)
  if (names.length && !names.includes('stall_schema_migrations')) throw new Error('Untracked schema exists; refusing to change it')
  await client.query(`CREATE TABLE IF NOT EXISTS stall_schema_migrations (filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`)
  const applied = await client.query('SELECT filename, sha256 FROM stall_schema_migrations ORDER BY filename')
  const history = new Map(applied.rows.map(r => [r.filename, r.sha256]))
  if (applied.rows.some((r,i) => r.filename !== files[i])) throw new Error('Migration history is not a valid prefix of expected files')
  for (const file of files) {
    const sql = await readFile(path.join(base,file),'utf8')
    const hash = createHash('sha256').update(sql).digest('hex')
    if (history.has(file)) {
      if (history.get(file) !== hash) throw new Error(`Previously applied migration changed: ${file}`)
      console.log(`SKIP ${file} (checksum matches)`); continue
    }
    // SQL files own their BEGIN/COMMIT; ledger written only after migration succeeded.
    await client.query(sql)
    await client.query('INSERT INTO stall_schema_migrations(filename,sha256) VALUES($1,$2)',[file,hash])
    console.log(`APPLIED ${file}`)
  }
  const tables = await client.query(`SELECT count(*)::int AS n FROM pg_catalog.pg_tables WHERE schemaname='public'`)
  console.log(`Local test database ready; public tables: ${tables.rows[0].n}`)
} finally { await client.end() }
