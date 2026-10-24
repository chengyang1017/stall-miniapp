import test from 'node:test'
import assert from 'node:assert/strict'
import { exchangeWechatCode } from '../src/auth.mjs'

// No WeChat request is made: network requests are replaced by an in-memory mock.
async function withWechatEnvironment({ appId = 'wx-test-app', secret = 'test-secret', response, fetchError } = {}, fn) {
  const oldId = process.env.WX_APPID
  const oldSecret = process.env.WX_APPSECRET
  const oldFetch = globalThis.fetch
  const calls = []
  if (appId == null) delete process.env.WX_APPID
  else process.env.WX_APPID = appId
  if (secret == null) delete process.env.WX_APPSECRET
  else process.env.WX_APPSECRET = secret
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    if (fetchError) throw fetchError
    return response || { ok: true, async json() { return { openid: 'user_123', session_key: 'PRIVATE' } } }
  }
  try { await fn(calls) }
  finally {
    if (oldId === undefined) delete process.env.WX_APPID
    else process.env.WX_APPID = oldId
    if (oldSecret === undefined) delete process.env.WX_APPSECRET
    else process.env.WX_APPSECRET = oldSecret
    globalThis.fetch = oldFetch
  }
}

test('rejects missing WeChat credentials without network access', async () => {
  await withWechatEnvironment({ appId: null }, async calls => {
    await assert.rejects(exchangeWechatCode('valid-code'), /wechat_not_configured/)
    assert.equal(calls.length, 0)
  })
})

test('rejects invalid login codes without network access', async () => {
  await withWechatEnvironment({}, async calls => {
    await assert.rejects(exchangeWechatCode('bad code'), /invalid_code/)
    assert.equal(calls.length, 0)
  })
})

test('uses the official code exchange endpoint and excludes session_key from returned subject', async () => {
  await withWechatEnvironment({}, async calls => {
    const subject = await exchangeWechatCode('valid_code-1')
    assert.equal(subject, 'wx:wx-test-app:user_123')
    assert.equal(calls.length, 1)
    const url = new URL(calls[0].url)
    assert.equal(url.origin, 'https://api.weixin.qq.com')
    assert.equal(url.pathname, '/sns/jscode2session')
    assert.equal(url.searchParams.get('js_code'), 'valid_code-1')
    assert.equal(url.searchParams.get('grant_type'), 'authorization_code')
    assert.ok(!subject.includes('PRIVATE'))
    assert.ok(calls[0].options.signal)
  })
})

test('rejects failed HTTP responses from WeChat', async () => {
  await withWechatEnvironment({ response: { ok: false, status: 503 } }, async () => {
    await assert.rejects(exchangeWechatCode('valid-code'), /wechat_unavailable/)
  })
})

test('rejects missing or malformed openid', async () => {
  for (const openid of [undefined, '', 'not valid open id']) {
    await withWechatEnvironment({ response: { ok: true, async json() { return { openid } } } }, async () => {
      await assert.rejects(exchangeWechatCode('valid-code'), /wechat_auth_failed/)
    })
  }
})

test('propagates WeChat network failures without exposing credentials', async () => {
  await withWechatEnvironment({ fetchError: new Error('network offline') }, async calls => {
    await assert.rejects(exchangeWechatCode('valid-code'), /network offline/)
    assert.equal(calls.length, 1)
  })
})
