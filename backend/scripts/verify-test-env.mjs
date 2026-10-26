// Default: offline plan only. --connect-ready authorizes READS, never migrations.
import { pathToFileURL } from 'node:url'
import { inspectReady } from '../testing/phase8/postgres.mjs'
import { safeCode } from '../testing/phase8/policy.mjs'
export async function verifyReady(env) {
  return inspectReady(env)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length === 2) console.log('Offline only. --connect-ready requires explicit PHASE8 authorization and an initialized isolated instance. No connection made.')
  else if (process.argv.length !== 3 || process.argv[2] !== '--connect-ready') { console.error('phase8_invalid_arguments'); process.exitCode = 1 }
  else try { await verifyReady(process.env); console.log('Phase8 ready identity and migration ledger verified; no business writes.') }
  catch (error) { console.error(safeCode(error)); process.exitCode = 1 }
}
