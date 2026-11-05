# Stripe Sandbox Checkout 浏览器返回页（仅测试环境）

本服务提供两个无须登录、只显示操作说明的浏览器落地页：

- 成功返回：`https://<测试 API 域名>/v1/payments/stripe-test/return/complete`
- 取消返回：`https://<测试 API 域名>/v1/payments/stripe-test/return/cancel`

在**隔离 Sandbox 后端**环境变量设置：

```dotenv
STRIPE_TEST_SUCCESS_URL=https://<测试 API 域名>/v1/payments/stripe-test/return/complete
STRIPE_TEST_CANCEL_URL=https://<测试 API 域名>/v1/payments/stripe-test/return/cancel
```

以上 URL 仅用于 Stripe Checkout 外部浏览器返回。它们不是 `wx.requestPayment` 参数，不会唤起微信原生支付，也不会产生付款确认。测试后需返回小程序订单详情，等待或手动触发已存在的服务端付款状态查询。Stripe 的签名 Webhook 和经认证的服务端 Stripe Session 查询才决定收款状态。

落地页只有在 `STRIPE_TEST_PAYMENTS_ENABLED=true`、`PAYMENT_DB_ENV=isolated-test` 且 `APP_ENV` 非 production 时出现。配置必须使用实际 HTTPS 域名。不要将隔离测试环境变量复制到生产环境。

**部署注意：** 原有 Checkout Session 保存了创建时的返回 URL；修改后端配置不会改变已经发出的测试 Session。需要部署后端、核对 Stripe Dashboard 的测试 Webhook URL `/v1/payments/stripe-test/webhook`、测试密钥、支付渠道权限和独立数据库。返回页本身不证明 Webhook 已送达或收款成功。

## 配置检查

`npm run preflight` 现在识别仓库中的 `001–030` 迁移（只检查文件，不对数据库执行迁移）。`npm run sandbox:check` 对成功及取消 URL 的路径和 HTTPS 来源进行离线核对。两者均不执行支付或更改数据库。新返回页面需要先部署到沙盒 API 域名，之后将两个完整 HTTPS 地址设置在对应 Sandbox 服务环境变量中。

注意：后端代码已经支持这些入口，不代表 Render/腾讯云上的环境变量已经更改，也不代表 Stripe Webhook 已在账户后台完成配置。
