# 微信支付 API v3 直连商户：单商家交付

**状态：源码准备，不等于可以正式收款。** 所有生产入口默认关闭。
仅支持普通直连商户与一个微信小程序 AppID、一个店铺，人民币 CNY。
Stripe Sandbox 独立保留；不允许以测试凭据操作生产。

## 商家准备
商家自有、认证的微信小程序与微信支付普通商户号，完成 AppID 与商户号绑定。
商家在自己的腾讯云账户购买、持有资源；通过最小权限协助开发者部署。
商家保管并授权生成的商户 API 证书私钥、APIv3 密钥；微信支付平台公钥另行核验。
禁止把密钥发送在聊天、提交 GitHub、存入小程序或写入客户端。

## 部署前审查
1. 选定正式小程序、店铺及腾讯云生产数据库，审查并按顺序执行 001—034 迁移，在独立测试库验收备份/回滚及权限。
2. 正式环境必须 APP_ENV=production 且 PAYMENT_DB_ENV 不是 isolated-test。
3. 在可信的腾讯云服务器私密环境配置 WX_APPID、WX_APPSECRET、WECHAT_PAY_MCH_ID、
   WECHAT_PAY_STORE_SLUG、WECHAT_PAY_MERCHANT_SERIAL、
   WECHAT_PAY_MERCHANT_PRIVATE_KEY、WECHAT_PAY_PLATFORM_SERIAL、
   WECHAT_PAY_PLATFORM_PUBLIC_KEY、WECHAT_PAY_API_V3_KEY (32 字节)、
   WECHAT_PAY_NOTIFY_URL=https://<已备案可访问域名>/v1/payments/wechat-pay/notify。
   平台公钥序列号必须与响应和通知 Wechatpay-Serial 匹配；密钥轮换需发布新版兼容配置。
4. WEB/小程序正式构建配置 PUBLIC_API_BASE、DEFAULT_STORE_SLUG、CLOUD_ONLY=true 和
   LIVE_WECHAT_PAY_ENABLED=true；不要直接采用本仓库默认值。
5. **最后**，经过支付服务端代码审核与正式环境隔离验证后，才设置 WECHAT_PAY_LIVE_ENABLED=true。
   不接受把生产环境伪装成测试环境以绕过授权门槛。

## 现有接口
- POST /v1/stores/:slug/orders/:orderId/wechat-pay：仅本人未付有效订单，服务端金额、店铺、微信身份与库存窗口校验；持久化唯一预支付 ID，返回 wx.requestPayment 参数。
- GET 同路径：仅本人查询微信官方订单状态；验真 SUCCESS 后在事务内幂等记账。
- POST /v1/payments/wechat-pay/notify：验证签名和 AES-GCM 密文，匹配交易号、AppID、商户号、openid、币种、金额，事务内结算；异常到账写入 refund_required 待财务处理，不自动恢复库存或配送。

生产交付必须以微信支付后台对账为准，客户端 wx.requestPayment success 不是收款凭证。
如果下单 API 结果不确定，请先查单，不要切换商户订单号重复扣款。

## 仍须完成的独立生产工作
- **退款 APIv3、退款异步通知、退款账务一致性、商家退款审核界面尚未接通**。实际收款前必须另行完成并验收；异常到款的 refund_required 事件需运营人工跟进并安排正式退款。
- 正式电子小票、交易金额账单、订单发货管理回传、评价资格和财务对账的端到端联调仍需完成。不能把现有 Stripe Sandbox 小票称为正式微信支付小票。
- 生产数据库最小权限 GRANT、平台公钥轮换、回调告警、备份恢复、真实腾讯云 HTTPS/微信真机、支付/取消/晚到账/重复通知/退款验证，均需商家提供账户、正式环境及审批。
- 微信支付交易类小程序运营规范、商家主体/经营类目、隐私合规要求需单独核实。

官方文档：
https://pay.wechatpay.cn/doc/v3/merchant/4012791856
https://pay.wechatpay.cn/doc/v3/merchant/4012791898
