import {customerSmsSendRoute} from './customerSmsSend.mjs'
import {customerSmsLoginRoute} from './customerSmsLogin.mjs'
import {customerAccountAddressWriteRoute} from './customerAccountAddressWrite.mjs'
import {customerAccountOrdersReadRoute} from './customerAccountOrdersRead.mjs'
import {customerAccountAddressReadRoute} from './customerAccountAddressRead.mjs'
import {customerSessionRoute} from './customerSessionRoute.mjs'
import {customerWechatPhoneLoginRoute} from './customerWechatPhoneLogin.mjs'
import {customerAccountSnapshotRoute} from './customerAccountSnapshot.mjs'
import {customerAvatarPhotoRoute} from './customerAvatarPhoto.mjs'
import {customerWechatPhoneBindRoute} from './customerWechatPhone.mjs'
import {customerWechatIdentityLinkRoute} from './customerWechatIdentityLinkRoute.mjs'
import { storeEntryRoute } from './storeEntry.mjs'
import { stripeTestPaymentRoute } from './stripeTestPaymentRoute.mjs'
import { stagingPaymentRoute } from './stagingPayments.mjs'
import {runtimeDeployment,parsedDatabase} from './stagingDeployment.mjs'
import { productReviewRoute } from './productReviews.mjs'
import { deliveryTrackingRoute,startTrackingRetention } from './deliveryTracking.mjs'
import { pageScope,pageQuery,pageResult,cursorTime } from './customerPagination.mjs'
import http from 'node:http'
import { supportRoute } from './support.mjs'
import { merchantArchivesRoute } from './merchantArchives.mjs'
import { imageManagementRoute } from './imageManagement.mjs'
import { customerAddressRoute } from './customerAddresses.mjs'
import { Pool } from 'pg'
import { catalogRoute } from './catalog.mjs'
import { publishedSql } from './productPublishing.mjs'
import { inventoryRoute } from './inventoryRoute.mjs'
import { inventoryColumns, startInventoryWorker } from './inventory.mjs'
import { checkoutRoute } from './checkout.mjs'
import { orderWorkflowRoute } from './orderWorkflow.mjs'
import { billingRoute } from './billing.mjs'
import { salesAnalyticsRoute } from './salesAnalytics.mjs'
import { merchantDeliveryRoute, businessSettingsRoute } from './deliveryRules.mjs'
import { authenticate, createSession, revokeSession, exchangeWechatCode, merchantStores, permittedStore } from './auth.mjs'
import { resolveVerifiedWechatAccount } from './customerIdentity.mjs'

// Public read-only API. Do not add merchant writes or customer checkout before
// implementing verified WeChat identity, tenant authorization and rate limits.
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required')
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
const approvedStaging=runtimeDeployment()
if(process.env.STAGING_SIMULATED_PAYMENTS&&!approvedStaging)console.warn('Staging simulation disabled: deployment identity not approved')
// Startup diagnostics only: never print AppSecret, login codes, sessions or tokens.
if(process.env.PAYMENT_DB_ENV==='isolated-test'){
  const configured=!!process.env.WX_APPID&&!!process.env.WX_APPSECRET
  const appIdMatches=process.env.WX_APPID==='wxeb1890c397d038d8'
  console.log('Staging WeChat auth readiness',configured?'credentials_present':'credentials_missing',appIdMatches?'app_id_matches':'app_id_mismatch_or_missing')
  const avatarBucketPresent=!!process.env.S3_AVATAR_BUCKET
  const avatarCredentialsPresent=!!process.env.S3_ENDPOINT&&!!process.env.S3_ACCESS_KEY_ID&&!!process.env.S3_SECRET_ACCESS_KEY
  console.log('Staging avatar storage readiness',avatarBucketPresent?'private_bucket_named':'private_bucket_missing',avatarCredentialsPresent?'s3_credentials_present':'s3_credentials_missing')
}
const pool = new Pool({
  ...(approvedStaging?parsedDatabase(connectionString,approvedStaging):{connectionString,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined}),
  max: 10,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000
})

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(body))
}
const server = http.createServer(async (req, res) => {
  let url
  try { url = new URL(req.url || '/', 'http://localhost') }
  catch { return reply(res, 400, { error: 'invalid_url' }) }
  try {
    if (await stripeTestPaymentRoute(req,res,url,pool)) return
    if (await stagingPaymentRoute(req,res,url,pool)) return
    if (await productReviewRoute(req,res,url,pool)) return
    if (await deliveryTrackingRoute(req,res,url,pool)) return
    if (await customerAccountSnapshotRoute(req,res,url,pool)) return
    if (await customerAvatarPhotoRoute(req,res,url,pool)) return
    if (await customerWechatPhoneBindRoute(req,res,url,pool)) return
    if (await customerWechatPhoneLoginRoute(req,res,url,pool)) return
    if (await customerSmsLoginRoute(req,res,url,pool)) return
    if (await customerSmsSendRoute(req,res,url,pool)) return
    if (await customerSessionRoute(req,res,url,pool)) return
    if (await customerAccountAddressReadRoute(req,res,url,pool)) return
    if (await customerAccountAddressWriteRoute(req,res,url,pool)) return
    if (await customerAccountOrdersReadRoute(req,res,url,pool)) return
    if (await customerWechatIdentityLinkRoute(req,res,url,pool)) return
    if (await storeEntryRoute(req,res,url,pool)) return
    if (await supportRoute(req,res,url,pool)) return
    if (await merchantArchivesRoute(req,res,url,pool)) return
    if (await imageManagementRoute(req,res,url,pool)) return
    if (await customerAddressRoute(req,res,url,pool)) return
    if (await inventoryRoute(req,res,url,pool)) return
    if (await catalogRoute(req,res,url,pool)) return
    if (await checkoutRoute(req,res,url,pool)) return
    if (await orderWorkflowRoute(req,res,url,pool)) return
    if (await billingRoute(req,res,url,pool)) return
    if (await salesAnalyticsRoute(req,res,url,pool)) return
    if (await merchantDeliveryRoute(req,res,url,pool)) return
    if (await businessSettingsRoute(req,res,url,pool)) return
    if (url.pathname === '/v1/auth/wechat' && req.method === 'POST') {
      const length = Number(req.headers['content-length'] || 0)
      if (!Number.isFinite(length) || length > 2048) return reply(res, 413, { error: 'too_large' })
      let raw = ''
      for await (const chunk of req) {
        raw += chunk.toString('utf8')
        if (Buffer.byteLength(raw) > 2048) return reply(res, 413, { error: 'too_large' })
      }
      let payload
      try { payload = JSON.parse(raw) } catch { return reply(res, 400, { error: 'invalid_json' }) }
      if (!payload || typeof payload.code !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.code)) return reply(res, 400, { error: 'invalid_code' })
      let subject
      try { subject = await exchangeWechatCode(payload.code) }
      catch (err) {
        if (err.message === 'invalid_code') return reply(res, 400, { error: 'invalid_code' })
        if (err.message === 'wechat_not_configured') return reply(res, 503, { error: 'auth_not_configured' })
        return reply(res, 401, { error: 'wechat_auth_failed' })
      }
      // Opt-in only on isolated staging. Legacy subject remains the session/order identity.
      // Do not enable in production until legacy orders and merchant role migration is designed.
      if (process.env.PAYMENT_DB_ENV === 'isolated-test' && process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED === 'true') {
        const accountId=await resolveVerifiedWechatAccount(pool,subject)
        const session=await createSession(pool,subject)
        return reply(res,200,{...session,accountId})
      }
      return reply(res, 200, await createSession(pool, subject))
    }
    if (url.pathname === '/v1/auth/me' && req.method === 'GET') {
      const subject = await authenticate(pool, req)
      if (!subject) return reply(res, 401, { error: 'unauthorized' })
      const stores = await merchantStores(pool, subject)
      return reply(res, 200, { stores })
    }
    // Cloud profile is available only in isolated staging after verified WeChat login.
    if(url.pathname==='/v1/customer/profile' && (req.method==='GET'||req.method==='PUT')){
      if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true')
        return reply(res,404,{error:'not_found'})
      const subject=await authenticate(pool,req)
      if(!subject)return reply(res,401,{error:'unauthorized'})
      if(req.method==='GET'){
        const result=await pool.query("SELECT a.id,a.nickname,a.avatar_style FROM customer_accounts a JOIN customer_login_identities i ON i.account_id=a.id WHERE i.provider='wechat' AND i.provider_subject=$1",[subject])
        if(!result.rows.length)return reply(res,404,{error:'profile_not_found'})
        return reply(res,200,{accountId:result.rows[0].id,nickname:result.rows[0].nickname,avatarStyle:result.rows[0].avatar_style})
      }
      if(Number(req.headers['content-length']||0)>1024)return reply(res,413,{error:'too_large'})
      let raw=''
      for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>1024)return reply(res,413,{error:'too_large'})}
      let payload
      try{payload=JSON.parse(raw)}catch{return reply(res,400,{error:'invalid_json'})}
      if(!payload||typeof payload.nickname!=='string'||payload.nickname.length>30||/[\u0000-\u001F\u007F]/u.test(payload.nickname))
        return reply(res,400,{error:'invalid_nickname'})
      const nickname=payload.nickname.trim()
      const result=await pool.query("UPDATE customer_accounts a SET nickname=$1,updated_at=now() FROM customer_login_identities i WHERE i.account_id=a.id AND i.provider='wechat' AND i.provider_subject=$2 RETURNING a.id,a.nickname",[nickname,subject])
      if(!result.rows.length)return reply(res,404,{error:'profile_not_found'})
      return reply(res,200,{accountId:result.rows[0].id,nickname:result.rows[0].nickname})
    }
    if(url.pathname==='/v1/customer/phone' && req.method==='GET'){
      if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true')return reply(res,404,{error:'not_found'})
      const subject=await authenticate(pool,req)
      if(!subject)return reply(res,401,{error:'unauthorized'})
      const result=await pool.query("SELECT p.phone_e164,p.verified_at FROM customer_login_identities i LEFT JOIN customer_verified_phones p ON p.account_id=i.account_id WHERE i.provider='wechat' AND i.provider_subject=$1",[subject])
      if(!result.rows.length)return reply(res,404,{error:'profile_not_found'})
      const value=result.rows[0].phone_e164
      const masked=typeof value==='string'&&value.length>4?value.slice(0,3)+'*'.repeat(Math.min(value.length-5,9))+value.slice(-2):null
      return reply(res,200,{bound:!!value,maskedPhone:masked,verifiedAt:result.rows[0].verified_at||null,verificationAvailable:process.env.WECHAT_PHONE_BIND_ENABLED==='true'})
    }
    if(url.pathname==='/v1/customer/avatar-style' && req.method==='PUT'){
      if(process.env.PAYMENT_DB_ENV!=='isolated-test'||process.env.CUSTOMER_ACCOUNT_MAPPING_ENABLED!=='true')return reply(res,404,{error:'not_found'})
      const subject=await authenticate(pool,req)
      if(!subject)return reply(res,401,{error:'unauthorized'})
      if(Number(req.headers['content-length']||0)>512)return reply(res,413,{error:'too_large'})
      let raw=''
      for await(const chunk of req){raw+=chunk.toString('utf8');if(Buffer.byteLength(raw)>512)return reply(res,413,{error:'too_large'})}
      let payload
      try{payload=JSON.parse(raw)}catch{return reply(res,400,{error:'invalid_json'})}
      if(!payload||typeof payload.avatarStyle!=='string'||!['violet','blue','green','peach'].includes(payload.avatarStyle))return reply(res,400,{error:'invalid_avatar_style'})
      const changed=await pool.query("UPDATE customer_accounts a SET avatar_style=$1,updated_at=now() FROM customer_login_identities i WHERE i.account_id=a.id AND i.provider='wechat' AND i.provider_subject=$2 RETURNING a.avatar_style",[payload.avatarStyle,subject])
      if(!changed.rows.length)return reply(res,404,{error:'profile_not_found'})
      return reply(res,200,{avatarStyle:changed.rows[0].avatar_style})
    }
    if (url.pathname === '/v1/auth/logout' && req.method === 'POST') {
      if (!await authenticate(pool, req)) return reply(res, 401, { error: 'unauthorized' })
      await revokeSession(pool, req)
      return reply(res, 200, { ok: true })
    }
    if (req.method !== 'GET') return reply(res, 405, { error: 'method_not_allowed' })
    if (url.pathname === '/health') {
      await pool.query('SELECT 1')
      return reply(res, 200, { status: 'ok' })
    }
    const match = /^\/v1\/stores\/([a-z0-9][a-z0-9-]{1,62})\/products$/.exec(url.pathname)
    if (match) {
      const q=url.searchParams,ids=q.has('ids')?q.get('ids').split(','):null
      const search=(q.get('q')||'').trim(),category=q.get('category')||null,discount=q.get('discount')||''
      if(discount&&discount!=='1'||search.length>100||category&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(category)||ids&&(!ids.length||ids.length>40||new Set(ids).size!==ids.length||[...q.keys()].some(k=>k!=='ids')||ids.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))))return reply(res,400,{error:'invalid_product_query'})
      const scope=pageScope(['products',match[1],search,category,discount])
      let page
      try{page=pageQuery(q,ids?['ids']:['q','category','discount','limit','cursor'],30,scope)}catch(e){return reply(res,400,{error:e.message})}
      const { rows } = await pool.query(`
        SELECT ${cursorTime('p')} AS "cursorTime", p.id, p.name, p.price_cents AS "priceCents", p.sold_out AS "soldOut",c.name AS "categoryName",c.sort_order AS "categorySortOrder",
               ${inventoryColumns()},p.category_id AS "categoryId", p.image_object_key AS "imageObjectKey", p.description, p.discount_price_cents AS "discountPriceCents", p.discount_start AS "discountStart", p.discount_end AS "discountEnd", CASE WHEN p.discount_price_cents IS NOT NULL AND (p.discount_start IS NULL OR p.discount_start <= now()) AND (p.discount_end IS NULL OR p.discount_end > now()) THEN p.discount_price_cents ELSE p.price_cents END AS "effectivePriceCents"
        FROM products p JOIN stores s ON s.id = p.store_id LEFT JOIN categories c ON c.store_id=p.store_id AND c.id=p.category_id
        WHERE s.slug = $1 AND s.is_active = true AND ${publishedSql('p')} AND ($2::uuid[] IS NULL OR p.id=ANY($2))
        AND ($3::text = '' OR strpos(lower(p.name),lower($3))>0)
          AND ($4::uuid IS NULL OR p.category_id=$4)
          AND ($5::timestamptz IS NULL OR (p.created_at,p.id)<($5::timestamptz,$6::uuid))
        AND ($8::boolean=false OR (p.discount_price_cents IS NOT NULL AND (p.discount_start IS NULL OR p.discount_start<=now()) AND (p.discount_end IS NULL OR p.discount_end>now())))
        ORDER BY p.created_at DESC, p.id DESC LIMIT $7
      `, [match[1],ids,search,category,page.anchor?.[1]??null,page.anchor?.[2]??null,ids?40:page.limit+1,discount==='1'])
      const result=pageResult(rows,ids?40:page.limit,scope)
      const categories=ids?{rows:[]}:await pool.query(`SELECT c.id,c.name,to_jsonb(c)->>'icon_key' AS "iconKey" FROM categories c JOIN stores s ON s.id=c.store_id WHERE s.slug=$1 AND s.is_active=true ORDER BY c.sort_order,c.name,c.id LIMIT 1001`,[match[1]])
      if(categories.rows.length>1000)return reply(res,413,{error:'category_limit'})
      const imageBase = (process.env.IMAGE_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
      return reply(res, 200, { hasMore:result.hasMore,nextCursor:result.nextCursor,categories:categories.rows,products: result.items.map(p => ({ ...p,
        imageUrl: p.imageObjectKey && /^https:\/\/[^/]+/.test(imageBase)
          ? `${imageBase}/${p.imageObjectKey.split('/').map(encodeURIComponent).join('/')}` : null
      })) })
    }
    return reply(res, 404, { error: 'not_found' })
  } catch (err) {
    console.error('API request failed', err?.code || err?.name || 'unknown')
    return reply(res, 503, { error: 'service_unavailable' })
  }
})
let stopInventoryWorker=async()=>{}
let stopTrackingRetention=()=>{}
server.listen(port, host, () => { console.log(`Stall API listening on ${host}:${port}`);stopInventoryWorker=startInventoryWorker(pool);stopTrackingRetention=startTrackingRetention(pool) })
async function shutdown() { server.close(); stopTrackingRetention(); await stopInventoryWorker(); await pool.end() }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
