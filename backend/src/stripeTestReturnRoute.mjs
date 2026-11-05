// Public Stripe TEST Checkout redirect landing only. Never authenticates or settles an order.
// A browser redirect is not proof of payment; signed webhooks and authenticated
// server-side Stripe retrieval remain the only settlement inputs.
export function stripeTestReturnRoute(req,res,url,env=process.env){
 const match=/^\/v1\/payments\/stripe-test\/return\/(complete|cancel)$/.exec(url.pathname)
 if(!match)return false
 const headers={
  'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store, max-age=0',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'x-frame-options':'DENY',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){
  res.writeHead(405,{...headers,allow:'GET, HEAD'});res.end();return true
 }
 if(env.STRIPE_TEST_PAYMENTS_ENABLED!=='true'||env.PAYMENT_DB_ENV!=='isolated-test'||env.APP_ENV==='production'){
  res.writeHead(404,headers);res.end();return true
 }
 const cancelled=match[1]==='cancel'
 const heading=cancelled?'已返回测试支付页面':'Stripe 测试付款页面已完成'
 const message=cancelled
  ?'你已从 Stripe Checkout 返回，但这不代表服务器已确认取消或未收款。'
  :'Stripe Checkout 已将浏览器返回此页面，这不代表服务器已确认付款成功。'
 const body=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Stripe Sandbox 测试支付</title><style>body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#f6f7f8;color:#24352e;margin:0;padding:40px 16px}.card{max-width:520px;margin:36px auto;background:white;padding:32px;border-radius:18px;box-shadow:0 8px 24px #0000000a}h1{font-size:24px}p{line-height:1.75;color:#526058}.hint{padding:16px;background:#f4f7f5;border-radius:12px}.test{font-size:12px;color:#8b988e;letter-spacing:1px}</style></head><body><main class="card"><div class="test">STRIPE SANDBOX · TEST ONLY</div><h1>${heading}</h1><p>${message}</p><p class="hint">请返回微信小程序，打开「我的订单」→ 对应订单详情，点击「立即刷新支付状态」。如仍显示处理中，请稍后再次查询。不要凭此页面重复付款。</p><p>付款与退款结果以店铺服务器核验记录为准。本页面不会自动创建支付、退款或修改订单。</p></main></body></html>`
 res.writeHead(200,headers)
 res.end(req.method==='HEAD'?'':body)
 return true
}
