const fs=require('fs');let p='miniprogram/modules/shared/components/review-card/review-card.wxml',s=fs.readFileSync(p,'utf8').replace('wx:if="{{customerSummary}}" class="heading"','wx:if="{{customerSummary}}" class="heading customer-heading"');fs.writeFileSync(p,s);
p='miniprogram/modules/shared/components/review-card/review-card.wxss';fs.writeFileSync(p,`.review-card{padding:22rpx 0;border-bottom:1rpx solid #eee6f6;line-height:1.7;word-break:break-all}.heading{font-weight:600;font-size:27rpx}.heading text{font-size:22rpx;color:#8050c1;margin-left:14rpx}.body{font-size:27rpx;margin:12rpx 0;white-space:pre-wrap}.time{font-size:22rpx;color:#9885a5}.reply{padding:16rpx;background:#f5effc;border-radius:12rpx;font-size:25rpx;margin-top:12rpx}button{margin:10rpx 0;color:#8252bf;background:#f6f1fc}\n.customer-heading{display:flex;justify-content:space-between;align-items:center;gap:12rpx}.customer-heading text{margin-left:0}.customer-heading .review-author{color:#625170;font-size:25rpx}.customer-heading .review-rating{font-size:23rpx;color:#8350c8}\n`);
p='backend/tests/frontend-render-stability.test.mjs';s=fs.readFileSync(p,'utf8').replace(/\r/g,'');const start=s.indexOf("test('footer layout contract");s=s.slice(0,start)+`test('compact footer remains mounted with fixed geometry and the native tabBar owning its safe area',()=>{
 const markup=read('miniprogram/pages/cart/cart.wxml').split('<view class="footer cart-footer-compact"')[1],css=read('miniprogram/pages/cart/cart.wxss')
 assert.ok(markup);assert.equal((markup.match(/wx:if=/g)||[]).length,1,'only the optional diagnostic probe is conditional')
 for(const cls of ['cart-footer-main','cart-footer-summary','cart-footer-count','cart-footer-error','cart-checkout'])assert.ok(markup.includes(cls))
 assert.match(markup,/confirmedTotalText \\|\\| totalText/);assert.match(markup,/待更新/);assert.match(markup,/disabled="[^"]*amountState !== 'confirmed'/)
 assert.doesNotMatch(markup,/商品合计 · 以结算及下单校验为准|请在结算时选择配送地址|已达起送金额|cart-footer-status/)
 const footer=css.match(/\\.footer\\.cart-footer-compact \\{([^}]+)\\}/)[1]
 assert.match(footer,/height:104rpx/);assert.match(footer,/bottom:0/);assert.doesNotMatch(footer,/safe-area-inset-bottom/)
 assert.match(css,/\\.cart-footer-error \\{[^}]*position:absolute;[^}]*bottom:100%;[^}]*height:32rpx/)
 assert.match(css,/\\.cart-footer-main \\{ height:80rpx/)
 assert.match(css,/\\.cart-footer-main \\.cart-checkout \\{[^}]*width:220rpx; height:72rpx/)
 assert.doesNotMatch(css,/264rpx|292rpx|310rpx/)
})\n`;fs.writeFileSync(p,s);
