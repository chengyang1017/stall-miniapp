import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
// Explicit offline allowlist. Never expand this to all backend tests: live DB/API
// suites and infrastructure setup live alongside these frontend-only tests.
const tests = [
  'apps/tests/navigation.test.cjs',
  'apps/tests/auth-session.test.cjs',
  'apps/tests/demo-checkout.test.cjs',
  'backend/tests/build-role-contracts.test.mjs',
  'backend/tests/frontend-navigation.test.mjs',
  'backend/tests/frontend-navigation-flows.test.mjs',
  'backend/tests/frontend-navigation-guards.test.mjs',
  'backend/tests/frontend-navigation-lifecycle.test.mjs',
  'backend/tests/frontend-navigation-orders-phase6.test.mjs',
  'backend/tests/frontend-navigation-runtime.test.mjs',
  'backend/tests/merchant-entry-contract.test.mjs',
  'backend/tests/miniapp-preview-audit.test.mjs',
  'backend/tests/miniapp-preview-build-guard.test.mjs'
]
const commands = [
  ['scripts/check-boundaries.mjs'],
  ...['combined', 'customer', 'merchant'].map(target => ['scripts/build-miniapp.mjs', target]),
  ['scripts/check-build-output.mjs'],
  ...['combined', 'customer', 'merchant'].map(target => ['scripts/miniapp-preview-audit.mjs', `dist/${target}`]),
  ['--test', ...tests]
]
for (const args of commands) {
  console.log(`\n> node ${args.join(' ')}`)
  const result = spawnSync(process.execPath, args, {cwd: root, stdio: 'inherit'})
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}
console.log('Frontend offline verification passed. WeChat/device acceptance is WAITING_FOR_OWNER_PREVIEW.')
