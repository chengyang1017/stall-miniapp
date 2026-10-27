// Public build configuration only. Never reads credentials, connects or deploys.
import fs from 'node:fs'
export function validatePhoneProfile(value) {
  const fields = ['version', 'environment', 'apiBase', 'storeSlug', 'appId']
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !fields.includes(k)) || value.version !== 1 || value.environment !== 'staging') {
    throw Error('Invalid phone preview profile: only public staging fields are accepted')
  }
  let url
  try { url = new URL(value.apiBase) } catch { throw Error('A real staging HTTPS origin is required') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9.-]+\.[a-z]{2,63}$/i.test(url.hostname) || /(?:^|\.)(localhost|local|internal|invalid)$/i.test(url.hostname) ||
      !/(?:^|[.-])(?:staging|stage|testing|test)(?:[.-]|$)/i.test(url.hostname.split('.').slice(0,-1).join('.'))) throw Error('Use a dedicated public HTTPS staging origin, without port/path/credentials')
  if (typeof value.storeSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(value.storeSlug)) throw Error('A real test-store slug is required')
  if (typeof value.appId !== 'string' || !/^wx[a-f0-9]{16}$/.test(value.appId)) throw Error('A WeChat AppID is required; touristappid is not a login identity')
  return { version: 1, environment: 'staging', apiBase: url.origin, storeSlug: value.storeSlug, appId: value.appId }
}
export function readPhoneProfile(file) {
  let value
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch { throw Error('Cannot read public preview profile JSON; never supply a credentials file') }
  return validatePhoneProfile(value)
}
export function cloudSource(profile) {
  const p = validatePhoneProfile(profile)
  return `// Generated public staging configuration. No credentials.\nexport const PUBLIC_API_BASE:string=${JSON.stringify(p.apiBase)}\nexport const DEFAULT_STORE_SLUG:string=${JSON.stringify(p.storeSlug)}\nexport const CLOUD_ONLY:boolean=true\nexport const PREVIEW_APP_ID:string=${JSON.stringify(p.appId)}\n`
}
