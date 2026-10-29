const fs=require('fs');let p='miniprogram/pages/cart/cart.wxml',s=fs.readFileSync(p,'utf8').replace(/\r/g,'');const start=s.indexOf('    <view class="cart-footer-status">'),end=s.indexOf('\n  </view>\n</view>',start);if(start<0||end<0)throw Error('Footer not found');s=s.slice(0,start)+`    <view class="cart-footer-error" aria-live="polite" hidden="{{!(quantityError || cloudError || deliveryError || (selectedCount > 0 && !selectedMinimumReached))}}">{{quantityError ? '数量校验失败，请重试' : cloudError ? '商品金额未确认，请重试' : deliveryError ? '当前暂不可配送' : '未达到起送金额'}}</view>`+s.slice(end);s=s.replace('已选 <text>{{selectedCount}}</text> 件商品','已选 <text>{{selectedCount}}</text> 件<text class="quote-state">{{cloudMode && (quantityPending || amountState !== \'confirmed\') ? \' · 待更新\' : \'\'}}</text>');
const marker='<text>配送方式</text><text class="value">按地址核对 ›</text></navigator>';s=s.replace(marker,marker+'<view class="cart-delivery-note">{{deliveryError || deliveryInfo}}</view>');fs.writeFileSync(p,s);
p='miniprogram/pages/cart/cart.wxss';s=fs.readFileSync(p,'utf8').replace(/\r/g,'');const from=s.indexOf('/* Stable footer:'),to=s.indexOf('\n\n.page{padding:0 24rpx 310rpx}',from);if(from<0||to<0)throw Error('Footer CSS not found');s=s.slice(0,from)+`/* Native tabBar owns the safe area. The webview footer sits directly above it. */
.footer.cart-footer-compact {
  position:fixed; z-index:20; left:0; right:0; bottom:0;
  height:104rpx; box-sizing:border-box; padding:12rpx 24rpx;
  background:#fff; overflow:visible;
}
.cart-footer-main { height:80rpx; display:flex; align-items:center; justify-content:space-between; gap:20rpx; }
.cart-footer-summary { flex:1; min-width:0; height:76rpx; overflow:hidden; }
.cart-footer-count { height:28rpx; line-height:28rpx; font-size:22rpx; color:#8b7d9c; white-space:nowrap; }
.cart-footer-summary .total { height:44rpx; line-height:44rpx; font-size:32rpx; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-variant-numeric:tabular-nums; }
.cart-footer-main .cart-checkout { flex:0 0 220rpx; width:220rpx; height:72rpx; min-height:72rpx; line-height:72rpx; padding:0; margin:0; font-size:27rpx; box-sizing:border-box; }
.cart-footer-error { position:absolute; bottom:100%; left:0; right:0; height:32rpx; line-height:32rpx; padding:0 24rpx; box-sizing:border-box; color:#b34351; background:#fff1f3; font-size:21rpx; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.quote-state{font-size:20rpx;color:#9c819f}.cart-delivery-note{font-size:22rpx;color:#8b7d9c;line-height:1.6;overflow-wrap:anywhere}
`+s.slice(to);s=s.replace('.page{padding:0 24rpx 310rpx}', '.page{padding:0 24rpx 136rpx}');fs.writeFileSync(p,s);
