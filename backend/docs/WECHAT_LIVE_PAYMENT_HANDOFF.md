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
1. 选定正式小程序、店铺及腾讯云生产数据库，先备份并在隔离库恢复原始 001—021 账本与数据。**禁止直接将 022—037 视为一条可用于正式库的连续迁移链**：`022_stripe_test_refund_jobs.sql` 明确限定隔离测试分支，`021_staging_payment.sql` 也含 staging 专用表。须先审查并制定正式环境专用、可验证摘要与角色授权的迁移清单，按受控方案在隔离恢复库演练，验收备份/回滚及权限后再决定正式执行。
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

## 退款模块（本轮新增，默认关闭）
- 增加 `backend/sql/035_wechat_live_refunds.sql`，退款请求及真实渠道状态与订单金额绑定。
- 商家 owner/manager 可通过 POST `/v1/merchant/stores/:slug/orders/:id/wechat-refunds`
  提交 `{requestKey,amountCents,reason}`。同一 requestKey 只能重复取得原结果，不得更换退款单号重试。
- GET 同路径查询本店退款记录；GET `.../wechat-refunds/:refundId` 通过微信支付官方退款查单核验状态。
- POST `/v1/payments/wechat-pay/refund-notify` 签名验证和 AES-GCM 解密；只根据微信支付成功/关闭/异常的可信数据更新订单退款状态。
- 需要在正式服务端私密配置 `WECHAT_PAY_LIVE_REFUNDS_ENABLED=true` 以及
  `WECHAT_PAY_REFUND_NOTIFY_URL=https://<商家 API 域名>/v1/payments/wechat-pay/refund-notify`。
  此开关在代码中默认关闭；启用前必须在隔离真实环境核对角色授权、生产数据库结构和回调。
- 正式退款申请的 HTTP 200/202 只代表已受理/可能未知；`unknown`、`abnormal`、`review`
  均不代表资金已退回。退款状态查询与交易对账必须独立运行。
- 商家订单页的退款管理仅在经审核正式构建中显示。不要将退款接口开放给顾客或普通员工。
- 正式构建未配置真实支付时必须阻止用户创建无法付款的订单，不能退回到 Stripe Sandbox。

## 真实付款记录和账单（本轮新增）
- GET `/v1/stores/:slug/orders/:orderId/wechat-receipt`：顾客本人读取服务器验真、金额核对的付款凭证；对应商家只允许 owner/manager 经
  GET `/v1/merchant/stores/:slug/orders/:orderId/wechat-receipt` 读取。
- 凭证包含原订单号、微信交易号、成交商品快照、实付款金额、已确认成功退款及未决退款；附 SHA-256 摘要供发现数据变动。
- **这不是税务发票，也不是微信官方出具的电子发票。** 若付款、退款或商品金额不能相互核对，服务端拒绝生成凭证。
- 商家营业账单已开始使用可信微信支付收款金额，并在正式配置下展示成功退款、待处理退款和异常到账。
  成功退款按**原订单的创建日期**归属，净额未扣除微信手续费，不等于微信商户平台结算账单。正式上线必须人工核对官方交易与结算账单。

## 退款断网恢复（本轮新增，默认关闭）
- 数据库新增 `backend/sql/036_wechat_refund_reconcile.sql`，保存下次核验时间、租约 token 与尝试次数。
- `WECHAT_PAY_REFUND_RECONCILE_ENABLED=true` 才开始定期状态核验，需同时开启真实支付与正式退款。
- 仅向微信支付 GET 查询**已有商户退款单号**；不自动发起退款 POST。即便部署了多个服务实例，也使用短租约、`SKIP LOCKED` 避免重复认领。
- 对处理中、结果未知、异常退款实施渐进式查询。对原路失败、异常到账、对账差异只报警并交由商家处理，不自动把资金转到其他银行卡。
- 此工作器不替代退款通知、运营人工复核或官方对账。
- 首次启用前必须在商家数据库验证表结构、角色权限、调用频率、日志与恢复行为，并测试网络超时与重复通知。

## 异常到账人工核对审计（默认不启用）
- 数据库 037 增加仅追加的 `wechat_abnormal_collection_reviews`，部署前须检查迁移、生产 runtime SELECT/INSERT 最小权限，禁止更新或删除审计记录。
- `GET /v1/merchant/stores/:slug/wechat-abnormal-collections/:transactionId/reviews`：商家 owner/manager 查看**本店**已记录为 `refund_required` 的微信交易的人工处理日志。
- 同路径 `POST` 接收 `{requestKey,action,note}`，其中 action 仅可为 `provider_checked`、`support_contacted`、`refund_requested`、`escalated`；必须使用新的请求键记录新操作，重试同一键返回原记录。
- 日志记录处理者、服务器时间及说明；**它是人工陈述，不是官方退款完成凭据**，不会更新支付/退款/库存/配送状态，也不会自动调用退款 API。
- 接口要求生产环境并启用正式微信支付，且强制商家身份及店铺授权。真实商户验收前不能开启正式支付开关。

## 商家导出账单的手工比对（只读、非官方自动下载）
- `POST /v1/merchant/stores/:slug/wechat-bill-reconciliation`，仅正式微信支付启用且商家 owner/manager 已登录时可用。完全只读，不会修改收款/退款、库存或配送记录。
- 商家从微信商户平台获得原始交易、退款账单并人工核实来源后，**先把选中的行正规化**为如下 JSON；人民币单位为分（整数），不是小数元：

```json
{
  "transactions": [{"id":"4200001234567890123456789012","amountCents":1500}],
  "refunds": [{"id":"wraaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","amountCents":400}]
}
```

- `transactions[].id` 使用微信支付交易号；`refunds[].id` 使用**本系统发起的** `out_refund_no`，并非微信退款 ID。每次 1—200 行，不接受重复 ID、多余字段、负数或小数金额；只对提交的行做比对，不声称比较了整份账单。
- 返回 `matched_local`、`missing_local`、`amount_mismatch`、`abnormal_collection` 或 `refund_not_locally_confirmed`。后两类仍须向微信商户平台复核并走人工审计，不自动发起退款。
- `officiallyVerified:false` 始终表示：**商家上传或手动整理的明细并不是已由本服务认证来源的官方账单。** 本接口也没有下载微信官方交易/结算账单，无法核实手续费、清算时间、付款方或漏提交的账单行。生产最终验收仍需逐笔对照官方原始文件。

## 仍须完成的独立生产工作
- 退款申请、查询、回调与商家操作入口已有初版；**并未在商家真实微信支付账号验收**。人工复核流程、超时退款任务自动恢复、微信账户对账、异常到账的补偿退款、退款告警及企业操作审计仍须完善，不能直接当作已验收的正式资金操作。
- 正式订单付款凭证及内部账单已有实现，但**法定电子发票、微信官方交易/结算账单下载对账**、订单发货管理回传、评价资格及财务全链路验收仍未完成。不能把现有 Stripe Sandbox 小票称为正式微信支付凭证。
- 生产数据库最小权限 GRANT、平台公钥轮换、回调告警、备份恢复、真实腾讯云 HTTPS/微信真机、支付/取消/晚到账/重复通知/退款验证，均需商家提供账户、正式环境及审批。
- 微信支付交易类小程序运营规范、商家主体/经营类目、隐私合规要求需单独核实。

官方文档：
https://pay.wechatpay.cn/doc/v3/merchant/4012791856
https://pay.wechatpay.cn/doc/v3/merchant/4012791898

官方退款文档：
- https://pay.wechatpay.cn/doc/v3/merchant/4012791903
- https://pay.wechatpay.cn/doc/v3/merchant/4012791906
- https://pay.wechatpay.cn/doc/v3/merchant/4012791905

本轮官方参考：https://pay.wechatpay.cn/doc/v3/merchant/4013071031
