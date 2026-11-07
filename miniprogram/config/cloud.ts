// Release configuration: fill the trusted backend HTTPS origin before publishing.
// Never accept apiBase from a share URL or QR scene. No keys or session tokens here.
export const PUBLIC_API_BASE:string=''
export const DEFAULT_STORE_SLUG:string=''
// Only the dedicated generated phone-preview output sets these values.
export const CLOUD_ONLY:boolean=false
export const PREVIEW_APP_ID:string=''

// Opt-in only after audited production WeChat Pay V3 and merchant acceptance.
// Keep false for all Sandbox/staging builds.
export const LIVE_WECHAT_PAY_ENABLED:boolean=false

// Enabled ONLY for a dedicated isolated Sandbox build, never merchant production.
export const PAYMENT_SANDBOX_UI_ENABLED:boolean=false
