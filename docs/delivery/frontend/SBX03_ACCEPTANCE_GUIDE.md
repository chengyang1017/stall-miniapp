# SBX-03 Sandbox 集成验收手册（2026-11-04）

基线 main `4a4e9a1d365b7cc301a6c7694f2799b10830b33a`。本轮只准备和离线验证；没有连接 Render/Neon/Stripe 账号，没有远程迁移、部署、支付或退款。状态 DEVELOPMENT。下述操作仅供以后获授权的独立 Sandbox 验收，全部真实结果初始为 NOT_RUN。微信平台为 WAITING_FOR_OWNER_PREVIEW，由项目负责人另一台电脑操作。

## 商家先看这一页

1. 请技术负责人提供“专用测试小程序”，确认页面有 Sandbox 测试提示。不要拿正式营业入口测试，不要填真实银行卡或顾客资料。
2. 使用标为“测试商品”的商品下单，地址、手机号用技术负责人提供的合成资料，选择有效未来配送时段。一次只测试一个案例，记下订单号。
3. 在结算选择信用卡、支付宝或微信支付，确认订单后进入详情。这里使用 **Stripe 外部测试付款网页**，不是微信原生支付。复制支付链接，在系统浏览器打开；链接应只私下用于本次测试，不发群、不放截图或仓库。
4. 按下表完成一次付款，再回小程序点“刷新状态”。即使浏览器显示成功，也必须等订单服务端确认后才算已支付。网页关闭、手机断网或没有返回小程序，不应产生第二张订单。
5. 查看小票：商品名称、数量、单价、配送费、总额、实际付款渠道、参考编号、支付时间及 Sandbox 字样应完整。商家订单页也应看到同一付款及小票。
6. 用店主/经理测试账号申请一部分退款，再退剩余金额；普通员工应没有可用退款权限。处理中不等于退款成功。退款后原小票仍保留，退款记录另外列出。
7. 遇到失败或一直处理中，记下订单号、时间、机型、步骤和脱敏截图交技术负责人。不要通过改数据库把它改成成功，不要换个订单反复付款。

## 三渠道逐项执行表

每行每渠道分别记录结果，不能把信用卡通过当作钱包通过。

| 案例 | 操作 | 应看到的结果 / 技术核对 |
|---|---|---|
| 信用卡成功 | Stripe 测试页面用 4242 4242 4242 4242、未来有效期及任意三位 CVC | 服务端确认支付；一次库存提交、一次支付事件、一次小票 |
| 信用卡失败 | 用官方测试卡 4000 0000 0000 0002 | 页面提示拒绝，不变成已付款；原 Session 可按支持的流程重试 |
| 信用卡 3DS | 用官方测试卡 4000 0025 0000 3155，分别完成、失败和中断认证 | 需要认证时不发货；返回后查询真实结果，不凭跳转参数改成功 |
| 支付宝 | 同订单选 alipay，打开测试 Checkout，按 Stripe 测试页面提供的授权/失败操作 | 若账户不支持或没有展示该渠道，记 BLOCKED；不得替换成 card 后记支付宝通过 |
| 微信支付 | 同订单选 wechat_pay，按 Stripe 当前测试页面完成模拟授权/扫码流程 | 测试账户资格、二维码、同机限制逐项记录；没有测试入口记 BLOCKED，禁止用真钱扫码替代 |
| 取消 / 换渠道 | 未付时在详情关闭原 Session，再换渠道 | 服务端确认已关闭才允许新渠道；支付处理中不能假取消 |
| 超时 | 留一张未付 Session 等待提供方实际过期；另一单在库存有效期外完成测试付款 | 过期单不复活库存；迟到付款进入补偿退款或人工审核 |
| 异步 / 断网返回 | 在提供方完成测试付款后断开客户端网络、关闭页面，再重开订单并刷新 | 最终由签名通知或可信查询收敛；不重复建单或重复扣库存 |
| 重复通知 | 技术负责人在测试 Workbench 对该真实测试事件重发两次 | 通知被幂等处理；一次小票/库存提交。保留事件编号和服务端计数 |
| 全额 / 部分退款 | 新单全额退；另一单先退 25%，再退剩余；超额申请应被拒绝 | 可信退款成功后状态一致，原小票不被覆盖 |
| 响应丢失 / 重启 | 技术负责人故障注入：退款提交后丢响应、Worker 处理中重启 | 固定请求键，恢复租约，不创建第二笔退款；未知结果留处理中或审核 |
| 重复收款补偿 | 技术负责人在专用夹具/既有旧 Session 制造第二笔真实测试收款 | 不二次履约；第二笔进补偿队列，退款参考编号唯一。普通商家不要自行反复支付 |

普通页面关闭只表示中断，不证明 Session 已取消；等待提供方过期和点击服务端取消要分开记录。真实钱包不一定能产生所有异步故障：无法触发时标 NOT_RUN，离线模拟覆盖另列，不伪造真实事件。签名错误测试应由技术人员向测试端点发送错误签名，预期拒绝且账本无变化；不要导出原始顾客 payload 到 Git。

## 微信开发者工具、Android、iOS 清单

负责人分别用 Combined/Customer 构建检查 `pages/checkout/checkout`、`pages/orders/orders`、`pages/order-detail/order-detail?id=<测试订单UUID>`；Combined/Merchant 检查 `pages/admin-orders/admin-orders`。记录基础库、微信版本、系统和设备。三个环境每一项单独勾选：

- 三渠道名称、Sandbox/外部支付说明正确；加载中禁用重复提交，失败能重试；订单号不因返回和切页变化。
- 复制链接、粘贴系统浏览器、3DS/钱包跳转和回小程序刷新分别可用。当前页面没有实现任意 Stripe 网页的内嵌 web-view；不得假定微信允许打开外链或自动拉起钱包。实际域名/平台限制由负责人验证，不关闭微信域名检查冒充通过。
- 页面隐藏后旧响应不写回；切账号、店铺、后端后不显示上一身份的数据；网络恢复或重启能查询同一订单。
- 顾客和商家付款状态、退款记录与小票一致；员工不能退款；小票含测试提示；原小票在退款后保持不变。

源码/编译页检查已有离线测试覆盖；工具预览不等于 Android/iOS 通过。外部 Checkout 的系统浏览器行为仍需逐机验证。

## 技术负责人：先配置专用环境

以下全部需要另外授权后人工执行，本轮未执行。

**Neon**：建立新的独立测试分支/数据库，不用生产连接。核对主机、数据库、角色和父分支来源。由数据库管理员审阅并顺序执行已有 001–027，027 的事务/DDL/索引以仓库文件为准，不由新测试脚本自动迁移。创建运行角色并授予现有订单/库存所需权限；attempts/refund jobs 需 SELECT/INSERT/UPDATE，notifications/receipts 只读和插入；environment marker 仅 SELECT。不要授予 app 对 receipts 的 UPDATE/DELETE/TRUNCATE、marker 修改或迁移权限；以实际 app 身份分别验证拒绝。管理员经独立确认后填入 marker 的 instance_id、current_database、current_user 和 enabled。先禁用 Worker，专用并发测试数据库要求 orders/stores/refund jobs 全空，不能对已使用的业务测试分支执行。

**Render**：人工准备独立 Sandbox 服务，核对它只连接上述测试分支，禁止复用正式服务环境组。沿用现有 Node 启动命令和项目部署流程，不新增另一套支付架构。按 `backend/sandbox.env.example` 配置：APP_ENV=sandbox、PAYMENT_DB_ENV=isolated-test、PG_SSL=true、DATABASE_URL、SANDBOX_PAYMENT_INSTANCE_ID；测试密钥/签名密钥只放受控环境配置，不能写进代码、截图或日志。四个开关 STRIPE_TEST_PAYMENTS_ENABLED、SANDBOX_PAYMENT_LIFECYCLE_ENABLED、SANDBOX_PAYMENT_WORKER_ENABLED、STRIPE_TEST_REFUNDS_ENABLED 初始 false，经迁移/权限/标记审核后才人工启用。关闭或回滚时保留账本和小票，不删除财务记录。

**Stripe**：人工确认选中专用 Sandbox/Test Mode，获取当前适配器支持的 sk_test_ 密钥，签名密钥 whsec_，同账户的三个 pmc_ 配置分别限制对应渠道；CNY、账户地区和钱包资格须实际核对。设置 HTTPS success/cancel URL。创建 **Snapshot** Webhook 到测试服务 `/v1/payments/stripe-test/webhook`，订阅 checkout.session.completed、checkout.session.async_payment_succeeded、checkout.session.async_payment_failed、checkout.session.expired。不能拿 CLI listener 的 secret 当成 Dashboard endpoint secret。在 Workbench 核对发送、返回码和重发；退款由既有 Worker 提交和查询，不在 Dashboard 手工退款后误称应用闭环通过。

本地配置检查：`npm run sandbox:check --prefix backend`。只检查当前进程环境变量格式，绝不联网/读 secret 文件/打印值。退出 2 表示待配置；CONFIGURED 不证明账户、数据库或渠道可用，false 开关是合法的安全初始配置。

## 真实 PostgreSQL 多连接命令

专用、空的、已人工迁移到 027 并配置 marker 的数据库；需要合成数据写权限。工具不清库，不自动创建角色/迁移，不调用 Stripe。测试保留合成证据，下一次请准备新的空库，不向已有库重复灌数据。停止同库 Worker 和 HTTP 服务，以免其消费合成任务。

在私密终端设置以下变量（不要将实际值提交、发给聊天或写入验收截图）：

```text
APP_ENV=sandbox
PAYMENT_DB_ENV=isolated-test
SBX_NATIVE_ACCEPTANCE=I_CONFIRM_EMPTY_ISOLATED_TEST_DATABASE
SBX_TEST_DATABASE_URL=<专用空测试数据库连接，不能等于应用DATABASE_URL；无URL query参数>
SBX_EXPECT_HOST=<独立核对过的主机>
SBX_EXPECT_DATABASE=<数据库名>
SBX_EXPECT_ROLE=<连接角色>
SANDBOX_PAYMENT_INSTANCE_ID=<管理员已配置的marker UUID>
```

执行 `npm run test:sandbox:native --prefix backend`。远程连接强制验证 TLS，本机 localhost 可免 TLS。该命令验证真实不同 backend PID、六调用同单预留、唯一约束、锁等待超时、结算后段失败整体回滚、四路重复确认下库存/事件/小票一次，以及四 Worker 抢同一退款任务只执行一次提供方调用。**提供方调用仍是合成响应**，结果分类 NATIVE_POSTGRES_SYNTHETIC_PROVIDER，不能写真实 Stripe 通过。真实数据库本轮 NOT_RUN；安全门禁只能核对声明和已配置 marker，无法替代人工核对数据库来源，禁止把生产地址填入允许清单。

## Stripe 只读证据工具

`npm run sandbox:stripe:verify --prefix backend -- session` 仅在明确设置 SBX_STRIPE_READONLY=I_CONFIRM_STRIPE_TEST_ACCOUNT、APP_ENV=sandbox、PAYMENT_DB_ENV=isolated-test 后访问官方 Stripe GET Session。还需 STRIPE_TEST_SECRET_KEY 和从本次合成订单/账本取得的 SBX_SESSION_ID、SBX_ORDER_ID、SBX_AMOUNT_CENTS、SBX_CHANNEL。它校验 test mode、归属、CNY、金额、成功 Intent 和实际渠道；不创建、修改、退款或写数据库。serverLedgerVerified 永远 false，需另与服务端账本核对。不要把 Session 链接/凭证放命令行参数。

`npm run sandbox:stripe:verify --prefix backend -- webhook <私密原始payload文件>` 在本地用环境中的 SBX_STRIPE_SIGNATURE 和 STRIPE_TEST_WEBHOOK_SECRET 验签，不发送事件。必须保留原始字节；签名有五分钟时效，过期失败不能解释为服务端故障。该工具只输出是否验签，不打印 payload，不证明端点去重/结算；重复通知必须用真实测试 Workbench 重发后检查账本。工具捕获错误只打印脱敏提示。原始 payload 文件存仓库之外，不能带真实个人数据。

## 记录、通过条件和本轮结果

每个案例复制一行：日期 / commit / 渠道 / 设备 / 测试订单号 / 脱敏Session事件退款参考 / 操作 / 预期 / 实际 / PASS或FAIL或BLOCKED或NOT_RUN / 证据负责人。禁止记密钥、Token、完整支付链接、真实个人信息。只有真实测试交易+服务端账本+小票/库存/退款相互核对才记端到端 PASS。

本轮新增代码只在 backend/testing/sandbox-acceptance、backend/scripts、安全工具单测和 package 命令；支付业务模块、迁移、UI、营业政策未改。P7-39 的原始失败与历史证据保留，详见 SANDBOX_LOCAL_MAIN.md；不通过改营业政策或删断言消除它。缺少真实凭证不阻止完成本地工具，但真实验收保持待办。

参考官方文档（本轮只读公开文档，没有连接账户）：[测试卡](https://docs.stripe.com/testing)、[Alipay Checkout](https://docs.stripe.com/payments/alipay/accept-a-payment?payment-ui=checkout)、[WeChat Pay](https://docs.stripe.com/payments/wechat-pay)、[签名与重发](https://docs.stripe.com/webhooks)。钱包页面和资格以测试账户实际结果为准。
