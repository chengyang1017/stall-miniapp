// Offline SQL analysis only. Dollar-quoted bodies are opaque, not split on BEGIN
// or semicolons inside PL/pgSQL. No SQL is executed by this module.
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { requireSafe } from './policy.mjs'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export const sourceHash = raw => sha256(raw.toString('utf8').replace(/\r\n/g, '\n'))
export function statements(sql) {
  const out = []; let part = '', i = 0, quote = null, dollar = null, block = 0, line = false
  while (i < sql.length) {
    const ch = sql[i], next = sql[i + 1]
    if (line) { if (ch === '\n') { line = false; part += '\n' } i++; continue }
    if (block) { if (ch === '/' && next === '*') { block++; i += 2 } else if (ch === '*' && next === '/') { block--; i += 2; part += ' ' } else i++; continue }
    if (dollar) { if (sql.startsWith(dollar, i)) { part += dollar; i += dollar.length; dollar = null } else { part += ch; i++ } continue }
    if (quote) {
      part += ch; i++
      if (ch === quote) { if (sql[i] === quote) { part += sql[i++]; continue } quote = null }
      continue
    }
    if (ch === '-' && next === '-') { line = true; i += 2; part += ' '; continue }
    if (ch === '/' && next === '*') { block = 1; i += 2; part += ' '; continue }
    if (ch === '$') {
      const match = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (match) { dollar = match[0]; part += dollar; i += dollar.length; continue }
    }
    if (ch === "'" || ch === '"') { quote = ch; part += ch; i++; continue }
    if (ch === ';') { if (part.trim()) out.push(part.trim()); part = ''; i++; continue }
    part += ch; i++
  }
  requireSafe(!quote && !dollar && !block, 'phase8_unterminated_sql')
  requireSafe(!part.trim(), 'phase8_missing_sql_terminator')
  return out
}
export function migrationBody(sql, transaction) {
  let list = statements(sql)
  requireSafe(['wrapped', 'bare'].includes(transaction), 'phase8_invalid_transaction_mode')
  if (transaction === 'wrapped') {
    requireSafe(/^BEGIN$/i.test(list[0]) && /^COMMIT$/i.test(list.at(-1)), 'phase8_transaction_wrapper_changed')
    list = list.slice(1, -1)
  }
  requireSafe(list.length > 0, 'phase8_empty_migration')
  for (const statement of list) {
    // Exact approved hashes below also pin function/DO contents. This whitelist
    // does NOT claim arbitrary future SQL is transaction-compatible.
    requireSafe(/^(?:CREATE (?:TABLE|(?:UNIQUE )?INDEX|FUNCTION|TRIGGER)\b|ALTER TABLE\b|INSERT INTO\b|SELECT pin_image_reference\(|DO \$\$)/i.test(statement), 'phase8_unapproved_top_level_sql')
    requireSafe(!/^CREATE (?:UNIQUE )?INDEX\s+CONCURRENTLY\b/i.test(statement), 'phase8_nontransactional_sql')
  }
  return list.map(s => s + ';').join('\n')
}
export function checkedMigration(entry, raw) {
  requireSafe(sourceHash(raw) === entry.sha256, 'phase8_migration_hash_changed')
  return { ...entry, body: migrationBody(raw.toString('utf8'), entry.transaction) }
}
export async function loadMigrations({ sqlDir = new URL('../../sql/', import.meta.url), manifestUrl = new URL('./migration-manifest.json', import.meta.url) } = {}) {
  const bytes = await readFile(manifestUrl), manifest = JSON.parse(bytes.toString('utf8'))
  const names = (await readdir(sqlDir)).filter(n => n.endsWith('.sql')).sort()
  requireSafe(manifest.version === 1 && manifest.hashEncoding === 'utf8-lf' && manifest.files?.length === 20 && names.length === 20 &&
    manifest.files.every((f, i) => f.filename === names[i] && Number(f.filename.slice(0, 3)) === i + 1 &&
      /^\d{3}_[a-z0-9_]+\.sql$/.test(f.filename) && /^[a-f0-9]{64}$/.test(f.sha256) && f.transaction === (i === 6 ? 'bare' : 'wrapped')), 'phase8_migration_list_rejected')
  const files = []
  for (const entry of manifest.files) {
    const raw = await readFile(new URL(entry.filename, sqlDir))
    files.push(checkedMigration(entry, raw))
  }
  return { files, manifestHash: sha256(JSON.stringify(manifest)) }
}
