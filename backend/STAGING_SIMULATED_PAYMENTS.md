# Staging 模拟支付：源码交付与验收边界

> 2026-10-28 P1整改更新：第6节是初版历史运行记录，旧10项失败已修复。当前环境、最小权限、原子迁移与启用门槛以 [部署准备说明](STAGING_DEPLOYMENT_PREPARATION.md) 为准。NODE_ENV=production可保留，但需要源码审核的部署身份和独立数据库锚点；真实审核档案仍为空。没有迁移或部署，真实PG测试仍待执行。

日期：2026-10-28。基于本地HEAD `503a930465bd94f0ae276bc57e8ac3519d8eee7b` 及已有未提交购物车/首页/底栏修复继续开发，未覆盖它们。本文件是源码交付记录，**不是当前Render/Neon已启用或完整订单流程已验收的声明**。

## 1. 调查结论与根因

- `checkout.mjs/checkoutRoute`：服务器认证顾客，核对营业、起送、地址区域/坐标、配送日期时段；重新查商品可用性和折扣价。按商品UUID顺序锁行，订单/明细/库存预留/流水在事务内写入。按店铺+顾客+checkout-key加advisory lock及唯一索引，重复请求重放，内容不同409。原逻辑未改。
- 创建订单默认 `payment_status=unpaid, fulfillment_status=new`。有限库存创建时扣可销售数量并记held预留，15分钟后由库存worker释放；支付不是再次扣库存。不限库存是none，没有原生库存到期任务。**本次模拟确认对两种库存都检查服务器创建后15分钟窗口；不限库存超时只拒绝模拟确认，不声称已自动取消该订单。**
- `orderWorkflow.mjs`：接单、备货、配送、异常均需paid；符合原规则的未付取消仍允许。held已过期会取消并释放；released不能恢复履约。送达必须使用原私有对象验证的complete接口。没有另一个completed状态，delivered是当前正常履约终态。
- 不能接单的主要阻断是正确的后端支付门槛，而不是缺库存。原商家UI未提前禁用操作；new队列与工作台待接单包含unpaid，容易误导。本次在保留后端门槛的同时修正UI、队列和统计。
- 原结构有payment_events（provider/event id唯一），没有支付尝试/可信回调服务，也没有支付来源及测试授权。原账单、分析和归档实收保持0，不能据paid标签、送达或库存推算到账。

## 2. 最小结构扩展

新增 `sql/021_staging_payment.sql`，顺序在001—020之后，**未执行**。

| 对象 | 用途 |
| --- | --- |
| orders.payment_source | 模拟来源固定staging_simulated；历史订单保留NULL，不自动转换状态 |
| orders.simulation_instance_id | 绑定获准的数据库/部署实例；与模拟来源、paid_at联合CHECK，避免NULL绕过 |
| orders.paid_at | 服务器确认时间；对模拟订单只是模拟确认时间，不证明收款 |
| staging_payment_environment | 默认无记录；唯一实例UUID、实际数据库名称、environment=staging、enabled开关 |
| staging_payment_testers | 实例+店铺+真实微信subject的限时授权，可撤销；owner不自动获得授权 |
| staging_payment_confirmations | 每订单一条审计，记录操作者、服务端金额、请求key、时间；复合外键校验店铺/订单和授权身份 |
| 既有payment_events | provider=staging_simulated，event_type=simulation_confirmed，事件ID为内部staging:订单UUID，不是第三方流水 |

021自身BEGIN/COMMIT；首次执行失败整份回滚。没有IF NOT EXISTS掩盖结构漂移，重复执行应由迁移账本识别；直接重复运行会拒绝，不能盲目补跑。只更新现有migrate-dev/preflight的21份清单提示，没有改其环境限制或迁移机制。**migrate-dev只允许本机stall_dev，不能拿它连接Neon。既有迁移器的SQL提交与账本记录分离风险仍在，不能当正式迁移器使用。**

回退优先关闭模拟开关/环境marker并回退应用版本，保留结构及审计。若已经有模拟确认，禁止直接丢弃来源/审计或把模拟paid改成真实paid；模拟订单不得导入生产。删除结构或清理数据需另行审计授权，本次不提供自动DROP/恢复按钮。

## 3. 服务端授权和接口

新增 `src/stagingPayments.mjs/stagingPaymentRoute`，已在server注册：

| 方法/路径 | 含义 |
| --- | --- |
| GET /v1/stores/:slug/orders/:id/staging-payment | 本人订单的测试资格，返回authorized/eligible；不修改订单，不是公开配置接口 |
| POST 同一路径 | 请求体仅 `{ "requestKey": "客户端UUID" }`，服务器确认模拟支付；不接受金额、支付结果、provider或角色参数 |

默认全部拒绝。服务端必须同时满足：

1. Node运行模式与业务环境分开，允许`NODE_ENV=production`；`APP_ENV=staging`且源码审核的Render部署/Neon目标/角色身份完全匹配，不能仅靠环境变量开启。
2. `STAGING_SIMULATED_PAYMENTS=ENABLED_FOR_TESTING_ONLY`。
3. `STAGING_PAYMENT_INSTANCE_ID`为经过运维批准的UUID。
4. 实际数据库内marker启用、UUID匹配、database_name与`current_database()`一致、environment为staging。
5. 使用既有服务器会话认证，subject为现有微信身份格式；事务内重新核对并锁住未撤销/未过期会话。
6. 当前店铺仍启用，存在该实例/店铺/微信subject的未撤销且未过期测试授权。前端不能建立或修改授权；没有测试管理员自助授权接口。
7. 订单属于该顾客和店铺；确认前new/unpaid、尚在支付窗口，有限库存预留完整有效，未released、未cancelled。

`APP_ENV=production`或缺少已审核部署档案/有效开关/UUID时，在模拟路由数据库I/O之前404。NODE_ENV不再作为业务环境证明。另需独立staging_control部署锚点、严格目标/TLS和运行角色核验；微信普通用户不会因访问stall-test自动看到入口。部署人员须保证环境/数据库隔离，应用无法识别被特权管理员整体伪装的生产部署。

授权检查使用真实数据库角色所需的行锁权限（FOR SHARE）及专用表访问权限，部署前需按运行角色审查。不要为了绕过权限错误直接授予超级用户、开放PUBLIC或开放管理授权API。表所有者/数据库管理员本身能修改授权，不在普通客户端威胁模型内。

普通商家履约仍要求既有owner/manager和店铺授权。对模拟paid额外要求当前服务端仍为相同获准实例；复制模拟订单到production不能推进履约。取消保留原状态机规则。

## 4. 事务、并发与库存

单次确认：认证→事务→锁会话/marker/测试授权→按操作者+requestKey加advisory lock→按店铺/顾客锁订单→核对资格和审计→按商品ID锁有限库存并核对预留→再次检查授权与服务器时间→写模拟审计、事件、paid及来源→复用resolveOrderInventory将held转committed→COMMIT。

- 金额和币种来自数据库快照，不使用客户端金额；不改历史单价，不重新按当前售价计算订单。
- committed只转状态/记流水，不再减少stock_quantity。取消与到期任务遵循原订单锁/产品锁顺序。发生冲突返回409；异常回滚，连接不确定或回滚失败时销毁连接。
- 相同requestKey重试返回replayed，不创建第二条审计/事件或重复扣库存。同key其他订单409；已确认订单改用另一个key不能声称安全重放，409并提示读取订单。
- 产品锁等待后重新检查支付窗口及授权，不能用请求开始的时间延长预留。已取消/过期/released不复活。
- COMMIT结果未知返回503和“先读取核对”语义，不假称失败或成功。原key在客户端进程内保留以供安全重试；进程被销毁后应先读取服务器订单，不能承诺恢复未持久化的请求key。
- 撤权与会话撤销会与已获得的共享行锁协调；已进入事务的确认与撤权存在明确先后次序，不宣称能追溯取消已经提交的测试确认。真实锁等待/死锁仍需隔离PostgreSQL验证。
- 已模拟支付后取消遵循原已付规则：**committed库存不自动退回，也不生成退款**。没有新增模拟退款、真实退款或自动恢复库存；需退货/退款策略时另行设计，不能冒充已退款。

## 5. 页面、统计与财务边界

- 顾客订单详情：后端确认测试授权后才显示“授权测试：模拟支付确认”；二次确认明确非真实付款。发送期间禁用，超时保留key和错误，成功后重新读取服务器状态，不画微信支付成功页。隐藏/卸载/换身份的旧响应不公布，401/403移除授权入口。
- 顾客订单列表及详情、商家订单管理：统一显示“测试订单 · 模拟支付已确认（非真实收款）”。支付状态独立于履约状态。
- 商家待支付独立tab：new+unpaid；待接单/new及工作台角标：new+paid，覆盖全店，包含已确认模拟订单。全部列表仍可见未付；已接单/备货/配送/终态按原状态统计。各计数不是互斥分组总和，因为all包含其他支付/履约组合。
- 单笔按钮及批量选择拒绝unpaid，后端仍独立检查；普通刷新保留已有列表，渲染按key/字段差异更新，不因支付刷新清空全部卡片。原分页、筛选、编辑输入保留。
- 账单/CSV、经营分析和归档的真实确认收款仍为0。模拟来源保留在订单导出中；分析有simulatedCount/simulatedOrderCents及提示、导出元数据标识。订单金额/件数可包含模拟订单以验流程，绝不当作收入。旧paid标签同样不等于可信收款。
- 模拟支付不能成为真实已购评价证据；保留reviewPolicy的可信支付接缝。客服、购物车与其他业务不新增模拟数据。
- 未接入真实网关、真实退款、对账或支付尝试生命周期。未来渠道仍应通过服务端验签/金额/订单校验、独立provider/event幂等接入；本次没有支付宝外跳等功能。

## 6. 本轮测试与未验证内容

新增staging-payments 38项（真实后端路由+原Phase7内存事务适配器）、staging-payments-ui 12项（真实页面/API函数+可控微信I/O）、review-purchase-boundary 1项模拟支付拒评。适配器只扩展本次SQL效果，不复制真实路由算法，**但它不执行PostgreSQL的SQL、唯一索引、外键或行锁**。

联合实际运行452项：452通过、0失败、0跳过/取消。其中345项前端/构建/配送等含上述12项UI回归，另有38项新后端、63项Phase7及6项评价边界；这些集合不与历史运行数字重复累加。

额外运行三份历史后端文件23项，13通过、10失败。再用只读git show HEAD的checkout/orderWorkflow源码通过Node加载钩子复跑，得到**同样10项失败**；没有修改这些测试断言或回退业务以迁就。具体为：

- order-security：checkout does not support GET；unpaid delivering order cannot be marked delivered。
- order-state-transitions：new→accepted；stale action；repeated accepted；cancellation reason；unpaid delivered proof；failed event rollback。
- order-status-safety：delivered requires proof key；unpaid delivered with plausible proof。

原因包括旧SQL模拟精确匹配已过时、旧角色夹具以及旧generic-delivered预期已被凭证complete接口取代。它们仍是待整理的历史测试债，不能报“所有后端测试全绿”。本轮452成功集合不包含这23项；若合并看为475项、465通过、10失败，不能只汇报465通过。

TypeScript noEmit、依赖边界、三目标实际纯TS编译和产物检查、16个相关MJS语法检查通过。**没有连接PostgreSQL、调用真实Staging、访问R2或运行手机验收**。没有执行021或为tester建立授权；现有Phase8封存仍为001—020，本次未扩白名单或修改实例。真实PG验收需另行授权新安全测试目标及021，不能拿内存并发测试当数据库验收。

重点未验证：真实PG两个确认/取消/到期竞争、唯一键等待、触发器/复合FK/CHECK、40P01、COMMIT连接丢失、迁移账本、授权角色行锁权限、真实R2凭证完成、Render冷启动、微信真机。现有送达仍需真实合法的私有照片；本轮没有上传/伪造照片，也没有声称送达全过程已实测。

## 7. 单独授权后的启用与微信验收

当前Staging不能直接使用本功能。先审查并单独授权部署/迁移/测试数据授权；按部署准备说明建立独立部署档案和DB锚点、审查真实角色与001—020账本/实际结构，使用新受控迁移器原子执行021、ACL、账本和审计。管理员以非公开流程建立环境记录和**仅具体测试微信用户、仅指定店铺、限时有效**的tester授权。配置不止初版四项，完整清单以新说明为准；生产禁用。以上均未执行，不能用前端按钮替代这些步骤。

前后端须配套启用：旧顾客包可能把paid统一写成“已付款”，无法辨识新paymentSource。必须先确保测试人员和商家使用本次新源码编译的包，不能在默认预览仍旧且EPERM时启用模拟确认，然后宣称旧客户端已正确区分来源。新迁移未就绪时也不能先部署依赖新列的查询代码。

启用后：

1. 用测试微信登录，以真实商品/有效配送规则创建本人订单，核对服务器totalCents、unpaid、held/none。
2. 商家“待支付”看到订单，接单禁用；直接构造状态操作仍应409。
3. 同一获测试授权的顾客在订单详情使用独立测试入口，明确确认模拟；核对服务器来源、审计、paid和库存committed，无第二次扣减。
4. 商家刷新看到“待接单”和模拟来源，依次接单→备货→配送。已有ETA/配送追踪权限不变。
5. 通过原送达照片页上传合法照片并走complete，最终delivered；没有跳过私有存储和图片归属检查。核对订单事件、库存流水、未取消模拟金额和真实收款0。
6. 新建普通unpaid、超期/取消/错误顾客订单作拒绝验收；限时授权撤销、会话失效、production直接请求均须拒绝。并发测试优先在新的隔离PG完成，勿拿Staging库存做无范围压力实验。

预览只尝试既有命令：

```text
npm run preview:phone -- --prepare ".local\phone-staging.json"
```

本轮在 `dist/phone-preview` 的目录替换阶段遇到Windows EPERM，**重建失败**。未强删、修改ACL、修改编译JS或创建替代预览项目；不能确定占用者。请关闭占用该项目的开发者工具/文件操作后重新执行同命令，再在原项目重新编译。不要继续用旧包声称本次功能已预览；此前trace/footer目录本轮没有新建或更新。

## 8. 本轮文件清单（不含此前保留的未提交修复）

新增：sql/021_staging_payment.sql、src/stagingPayments.mjs、tests/staging-payments.test.mjs、tests/staging-payments-ui.test.mjs、miniprogram/modules/shared/domain/payment.ts、本文件。

修改后端：src/server.mjs、orderWorkflow.mjs、merchantOrderQuery.mjs、billing.mjs、salesAnalytics.mjs、merchantArchives.mjs、reviewPolicy.mjs；scripts/migrate-dev.mjs、preflight.mjs；PAYMENT_INTEGRATION_CONTRACT.md。

修改前端：modules/customer/api/orders.ts、modules/merchant/api/orders.ts；pages/order-detail的TS/WXML、orders.ts、admin-orders的TS/WXML、admin-analytics的TS/WXML、admin-billing.ts；utils/salesAnalytics.ts。

修改测试：helpers/business-phase7-db.mjs（复用事务模型扩展）；frontend-navigation-lifecycle、frontend-navigation-orders-phase6（类型/导入/新状态夹具适配，原断言保留）；review-purchase-boundary。永久档案：docs/testing/TEST_STATUS.md、TEST_HISTORY.md。原购物车、首页和底栏修改完整保留，本轮没有改动它们。

## 2026-10-28 V2复用计划更正（只读复核）

上文“必须另建全新隔离集群”是初版loopback测试入口的限制，不是本轮继续建设新环境的建议。当前用户要求复用既有V2，未授权任何Docker/DB写入。既有V2仍created，恢复被原容器规格摘要不匹配阻断；没有重新初始化或重建。

后续优先同一V2完成历史001—020和26项验收，再明确授权021升级及新阶段回执，保留旧基线/ready证据。现有11项默认跳过；其loopback/三角色入口尚不能在V2执行，需要扩展现有固定runner用途/grant/角色和测试身份适配，不放宽URL隔离、不发布端口、不创建平行框架。当前源码读021列且新增staging模块未在旧runner闭包中，不能直接重打包执行020测试。021迁移中途失败的真实DDL/ACL/账本/审计整体回滚等覆盖仍待补齐。

准确差异、版本衔接、389项离线结果（375通过/3失败/11跳过）、恢复授权前置条件和外部部署步骤见[现有恢复说明](../docs/testing/PHASE8_V2_RECOVERY.md)。本轮无Neon/Render操作；本地测试通过后仍须单独完成真实元数据核验、身份登记/迁移及部署授权。

## 2026-10-28 21:35 UTC+8：021固定运行器源码已接通，尚未运行

新增upgrade021/ready021/business021/payments021及version2严格grant，staging021独立镜像版本；54文件封存，默认020边界不变。schema021实现原子增量账本/审计/独立catalog基线，保留历史20基线；payments021仅固定三角色凭据、5挂载，复用共享11场景，business021复用已有26项。未来DBA登记脚本enroll021.sql不由runner自动执行，本轮未登记角色/锚点，也未构建/批准镜像或执行SQL。

最终离线446项，435通过/0失败/11跳过；真实PG均未运行。部署/Neon仍禁止，当前镜像批准不覆盖新源码。A旧现场恢复仍须接受证据缺口及绑定追加登记的恢复机制；优先B保留旧现场、复用现有全部测试代码与审核成果，补固定新资源配置和完整登记，再单独授权创建/测试。详细契约、权限、日志和风险比较见[恢复说明](../docs/testing/PHASE8_V2_RECOVERY.md)最新节。
