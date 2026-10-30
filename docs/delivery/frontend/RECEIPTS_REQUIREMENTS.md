# 电子小票需求补充：状态、数据约束与权限（中国大陆）

任务：FE-07；日期：2026-10-30；状态：DRAFT / 待项目及后端负责人评审。本文补充用户提供的第1—8节，不代表功能已实现或支付已验收。

## 1. 范围和当前事实

- 正式电子小票只证明经服务端核实的交易；普通电子小票与增值税电子发票使用独立编号、数据及流程。本次不接入税务开票。
- 一笔商城订单最多一份正式小票；顾客和商家读取同一服务端记录，不在两端各生成一张。顾客收货、客户端支付提示、订单标签、库存扣减均不是可信支付依据。
- 正式小票保存成交时的商家、店铺、商品、数量、金额和付款时间快照；改商品名称/价格、关店或退款，不覆盖原快照。退款另行关联并展示。
- 当前zh源码基线为71ff30e，已有`orders`、`order_items`、`payment_events`、履约/库存状态、支付网关门槛及隔离Stripe测试基础；未发现正式小票表、微信支付V3适配器及其真实支付/退款路由。Staging模拟或Stripe sandbox不得签发微信正式小票。依据：`backend/sql/001_init.sql`、`backend/PAYMENT_INTEGRATION_CONTRACT.md`、`backend/src/payment{Gateway,Settlement,SettlementTransaction}.mjs`。
- 只读fetch时远端main为a28c1ef，PR #5已由负责人合并；main还在推进独立顾客身份/会话。本稿不将远端新增实现声称为当前zh已有，也不自动合并或改动其后端工作。身份关联及历史订单归属必须与负责人确认。
- 本轮仅完善需求和交接文档；下面的新增字段、表、权限、页面与业务能力均为提案，不创建SQL迁移、不启用支付、不猜测或调用`/pay`、`/refund`、`/receipts`接口。

## 2. 状态模型：订单、支付、履约、退款分别管理

### 2.1 订单和履约

建议新增独立订单业务状态`order_status`；迁移及与现有字段的兼容由后端评审，不能只在前端新增枚举。

| 业务状态 | 进入条件 | 合法后续 |
| --- | --- | --- |
| pending_payment 待付款 | 服务端建单成功 | confirmed / cancelled / closed |
| confirmed 已确认付款 | 服务端核实真实支付，且订单仍可履约 | fulfilling / cancelled |
| fulfilling 履约中 | 商家合法接单/备货/配送 | completed / cancelled（须适用的取消规则） |
| completed 已完成 | 合法送达/完成凭证 | 仍可发生售后退款，不倒退为未完成 |
| cancelled 已取消 | 顾客/商家在允许阶段显式取消 | 不因迟到付款自动恢复；支付/退款独立处理 |
| closed 已关闭 | 未付订单到期，并确认渠道未付且关单完成 | 不重新支付原关闭交易；迟到/矛盾结果进入核对 |

当前履约字段仍为`new → accepted → preparing → delivering → delivered`，另有`cancelled`、`abnormal`；退款不新增“送达”或库存入库事件。履约异常不等于支付失败。退款后是否退货、补库存或停止配送，需明确售后规则后独立执行，不能自动把金额变更当作库存变更。

### 2.2 支付尝试及订单支付汇总

新增`payments.status`表达每次支付尝试：`created / paying / unknown / succeeded / failed / closed`。允许同一订单有多次支付尝试；未确认前一次结束前，不能无约束创建新的可支付渠道单。每次尝试具有稳定商户支付单号，同一业务重试复用它。

| 事件 | 服务端处理 | 小票与页面 |
| --- | --- | --- |
| 客户端成功 | 请求服务端核对；不能直接更新paid | 显示“支付结果确认中”，只在正式记录存在后展示小票 |
| 客户端取消 | 不视作渠道终态；保留未支付订单，必要时查单 | 不生成小票；可提示“已取消本次支付，订单待确认/待付款” |
| 客户端失败/断网/超时 | 结果无法证明时记unknown，查单并重试核对 | 不宣称未扣款、已关闭或重新扣款成功 |
| 官方已验真SUCCESS且金额/归属匹配 | 支付记succeeded，锁订单进行唯一结算和小票签发 | 同一订单只返回已有小票或新建一份 |
| 服务端确认支付失败 | 该支付尝试failed，记录原因；订单可付时仍为pending_payment | 显示“本次支付失败”，不签票；不是永久把商城订单判死 |
| 本地支付期限到达 | 发起服务端查单/关单，不以定时器单方面判定资金状态 | 关单确认前可显示“超时，支付状态核对中” |
| 渠道确认未付且关单成功 | payments.closed，订单closed，按现有规则释放未付预留 | 不签票 |
| 已取消/已释放库存后核实真实到账 | 保留可信资金事实；禁止恢复订单、重新占库存或自动履约 | 第一笔合法归属的真实支付仍只签一份小票，标记交易异常/待退款；由批准的补偿流程退款，不假称已退款 |
| 同一交易重复通知/查单 | 验证同订单、同商户、同金额；返回既有结算 | 不重复签票、不重复扣库存 |
| 同一订单另一笔真实交易到账 | 全部记录，标为duplicate_charge，进入异常资金处理 | 不签第二份订单小票；保留额外扣款证据并进行退款/人工核对 |

对原需求“支付失败标记订单支付失败”作精确化：UI可显示最近一次支付失败，但`orders.payment_status`不能因一次失败或取消覆盖已核实的收款。沿用当前`unpaid / paid / partially_refunded / refunded`时：未收款=unpaid；有可信收款且成功退款为0=paid；成功退款介于0与可退总额之间=partially_refunded；达到可退总额=refunded。另设退款处理中/异常标志。履约、资金与业务状态必须一起展示，不能只凭paid就放行已关闭订单。

微信渠道原始`trade_state`单独保留并映射；`REFUND`不代表已经全额退款。不得把未知渠道枚举映射成成功。当前结算门槛对过期/取消订单的限制需要负责人专项设计迟到资金分支，不能直接复用正常结算绕过该门槛。

### 2.3 单笔退款状态

| 本地状态 | 含义及进入条件 | 后续与额度 |
| --- | --- | --- |
| requested | 已授权创建退款意图并占用可退额度，尚未发往渠道 | submitting；仅确认尚未提交时可撤销为closed |
| submitting | 已持久化任务，正在提交同一退款单号 | processing / unknown / failed；发送前后均保留额度 |
| unknown | 提交超时/网络失败，无法确认渠道是否受理 | 查原退款单，不换号重退；额度继续占用 |
| processing | 渠道已受理，尚未成功 | succeeded / abnormal / closed；继续占用 |
| succeeded | 验真的退款通知或查单确认SUCCESS | 正常终态；成功金额只累计一次，不能回退到处理中 |
| abnormal | 官方ABNORMAL，需渠道异常处理 | 仍占用额度；处理后查单可至succeeded，不把它当作失败重新退 |
| failed | 已明确拒绝，确认无有效渠道退款单/无资金处理中 | 释放该意图额度；保留失败原因，不计成功退款 |
| closed | 官方CLOSED或确认从未提交的本地撤销 | 正常终态，释放占用；新退款必须重新授权，使用新业务意图和新单号 |

本地`failed`不是微信退款状态枚举。微信退款查询的SUCCESS、PROCESSING、ABNORMAL、CLOSED分别映射；申请HTTP成功/受理不等于SUCCESS。乱序旧消息不得覆盖succeeded；互相矛盾的终态进入人工核对，不靠枚举大小或到达顺序覆盖。新消息若揭示已关闭记录仍有真实退款，也必须保留资金证据并告警，不能静默丢弃。

订单退款汇总采用“成功退款金额 + 是否有未决退款 + 是否异常”组合，允许“已部分退款，另一笔退款中”，避免单一状态掩盖并发退款。

## 3. 数据字段与约束提案

金额全部为人民币整数分，数据库`bigint`，禁止浮点金额；数量为正整数；货币首版限定CNY。API传递bigint时采用十进制字符串或经安全整数检查的整数，前后端不得隐式损失精度。所有时间为`timestamptz`，UTC存储/传输，页面与日期筛选使用`Asia/Shanghai`（北京时间）。UUID主键由服务端生成，客户端不能提交可替换的归属字段。

### 3.1 现有orders / order_items的补充

- 保留`store_id`、`customer_subject`、`currency`及成交金额/明细。现有`customer_subject`包含身份命名空间，不以裸OpenID、手机号或姓名判为同一人。未来`customer_account_id`只经服务端已验证映射关联，不能回填臆测身份。
- 提议增加：业务状态、`order_number`（唯一且不可复用）、`canonical_payment_id`、`payment_expires_at`、`closed_at`、`close_reason`、`last_payment_result`、退款汇总缓存/版本（若采用缓存）、`reconciliation_status`及`version`。
- `paid_at`已有迁移字段时复用，不重复建名；区分真实支付来源、sandbox和staging_simulated。仅有paid标签或模拟标志不满足正式签票条件。
- 服务端创建支付前冻结本次成交快照/金额版本。折扣、配送费及优惠分摊先形成确定快照；付款后不得用商品当前价格回写原订单。

### 3.2 新增payments（支付尝试与资金事实）

| 字段组 | 建议字段与约束 |
| --- | --- |
| 关联 | id PK；order_id FK；merchant_id、store_id；customer主体；关联必须同一订单/租户 |
| 渠道及环境 | provider、mode（live/sandbox）、mchid、appid；服务商模式需另列sp_mchid/sub_mchid及相应AppID，不能混用普通商户假设 |
| 唯一标识 | out_trade_no；transaction_id（未获渠道返回前可空）；idempotency_key、request_hash |
| 金额 | currency、amount_total_cents、payer_paid_cents；后者在存在微信渠道优惠时不一定等于订单总额，必须保存官方字段及优惠快照 |
| 状态与证据 | status、channel_trade_state、verification_evidence_id、verified_at、succeeded_at、closed_at、last_queried_at、error_code、created_at、updated_at、version |
| 结算归属 | settlement_role：pending / canonical / duplicate_charge；另用reconciliation_status记录normal / late_charge_review / manual_review，第一笔迟到到账可同时为canonical且待异常核对 |

数据库唯一约束：`(provider, mode, mchid, out_trade_no)`；非空transaction_id的`(provider, mode, mchid, transaction_id)`；业务幂等键在服务端定义的租户/订单/动作范围内唯一，同键不同request_hash返回冲突。规范化渠道成功交易可以多条，但每个订单最多一条canonical支付（部分唯一索引），额外扣款不得因这个约束而丢弃财务记录。正式签票只关联已验真live支付，不将测试资金变成正式单据。

### 3.3 receipts

| 字段 | 要求 |
| --- | --- |
| id / receipt_number | UUID PK；小票号NOT NULL UNIQUE，不使用可预测号码替代授权 |
| order_id / payment_id | NOT NULL FK；order_id UNIQUE，一单一正式票；payment_id关联本单canonical支付，可加UNIQUE |
| merchant_id / store_id | NOT NULL，补充store_id以支持本店授权；与订单、支付的商户及店铺一致 |
| customer_subject / customer_account_id | 主体快照与订单一致；账号ID仅在可信映射存在时填写，不把手机号当主键 |
| merchant_snapshot / store_snapshot | 成交时商家/店铺名称等展示信息，结构有版本；不持久化无关顾客资料 |
| currency / subtotal_cents / delivery_fee_cents / discount_cents / total_cents | NOT NULL，非负整数；`total_cents = subtotal_cents + delivery_fee_cents - discount_cents`，禁止双重扣除行折扣 |
| payer_paid_cents / promotion_snapshot | 官方顾客实付与渠道优惠快照，不能把优惠金额误算成待退款现金 |
| paid_at / issued_at / created_at | 官方支付完成时间、实际签发时间、落库时间分开；迟到通知不得把签发时间冒充交易发生时间 |
| snapshot_version / snapshot_hash / verification_evidence_id | 固定序列化版本、快照摘要及可信证据引用；hash用于完整性核对，不替代渠道验签 |

不把可变退款状态写进原始不可变快照；详情通过关联退款与汇总展示当前状态。`refunded_cents`如为查询缓存，应放在独立汇总记录/视图，且可从成功退款重建。原始票金额永不因退款归零或重开。应用服务账号不具有随意UPDATE/DELETE票据快照的权限；更正通过追加更正记录/审计处理。

按原需求永久保留原始成交快照，不因退款、商品删除或店铺更名覆盖、重编号或删除，并具有归档/备份可恢复能力。永久交易留存不等于无期限收集全部顾客个人信息；快照应最小化个人资料，停业/注销、去标识化及适用留存/隐私要求的实现边界由负责人另行确认。本稿不擅自设定年限或将“永久”改为可任意清理。外键默认RESTRICT，不能删除商品/订单/店铺时级联删票。

### 3.4 receipt_items

- id PK、receipt_id NOT NULL FK、line_no NOT NULL、order_item_id、product_id（引用可空）、product_name、sku_snapshot、unit_price_cents、quantity、line_discount_cents、subtotal_cents、snapshot_version。
- `UNIQUE(receipt_id,line_no)`；若一订单行对应一票据行，增加`UNIQUE(receipt_id,order_item_id)`及订单归属校验。
- quantity > 0；unit_price_cents >= 0；`subtotal_cents = unit_price_cents * quantity - line_discount_cents >= 0`，乘法先提升到bigint；字段含义确定后不得再从票头重复扣减同一折扣。
- 票头subtotal_cents必须等于行subtotal_cents之和；商品下架/删除不损失快照，不动态JOIN商品名称/价格充当交易明细。

### 3.5 refunds

| 字段组 | 建议字段与约束 |
| --- | --- |
| 关联 | id PK；order_id、payment_id、merchant_id、store_id为NOT NULL真实关联；receipt_id在签票尚未完成或处理额外重复扣款时可空，有值时必须关联同订单/同支付/同租户的票 |
| 单号 | refund_number（本地唯一，可映射out_refund_no）；provider_refund_id；provider/mode/mchid；两个外部号各按渠道/环境/商户范围唯一 |
| 金额 | refund_amount_cents > 0、payer_refund_cents（官方实际退给顾客）、currency、original_total_cents；原单总额来自服务端，不从前端接收 |
| 状态 | refund_status、channel_refund_status、reason_code、脱敏reason、failure_code、version |
| 操作与重试 | requested_by、approved_by（按审批策略）、idempotency_key、request_hash、attempt_count、next_retry_at、lease_token/lease_expires_at（如采用任务租约） |
| 时间及证据 | created_at、submitted_at、completed_at、closed_at、updated_at、last_queried_at、verification_evidence_id |

`completed_at`仅成功时写入，失败/关闭使用自己的时间字段；成功必须具有已验真结果、渠道退款号及实际成功金额，重复结果不能重复填账。金额不能超过对应支付原始金额；用户实退`payer_refund_cents`与订单口径退款额不能混用。小票退款汇总只累计其canonical支付的退款；额外重复扣款的退款另列异常资金，不能扣减一次正常成交的净额，也不能为其补签第二张订单小票。异常处理资金退回商家账户不等于顾客已收到退款，应记录处置结果后继续人工核对。部分退款按商品分摊/退货数量若纳入首版，需增加refund_items关联票据行并校验累计数量与金额；未纳入时只承诺按金额部分退款，不伪造退货明细。

### 3.6 去重事件、可靠任务和审计

- 扩展现有payment_events或设计payment/refund事件收件箱，不能假定当前唯一键已经实现完整回调：id、provider/mode/mchid、provider_event_id、event_type、payment_id/refund_id、payload_hash、verification_result、received_at、processed_at、processing_status、retry_count、error_code、证书/公钥ID及证据引用。
- `UNIQUE(provider,mode,mchid,provider_event_id)`去通知重放；不同通知ID指向同一transaction_id/refund_id时仍用资金记录唯一键及状态变更去重。主动查单不能伪造渠道通知ID，保留独立查询证据，通过同一结算入口去重。
- 小票签发、通知、导出及退款提交使用事务outbox/持久任务；事件已可靠落库后才确认接收。若采用异步签票，支付成功到票签发之间显示“生成中”；任务幂等补偿并告警，不永久停在“已收款无票”。不得把仅入内存队列当作可靠持久化。
- 记录操作主体/角色/店铺、关联ID、动作、前后状态、结果、request_id和时间。金额及票据快照改动必须可追溯。日志不输出私钥/APIv3密钥、Token、微信临时code、完整手机号/地址或原始解密报文；必要原始证据应受控加密存储并按最小权限访问。

### 3.7 跨表、并发及索引

1. 订单、支付、票据、退款关联必须防跨店/跨商户/跨顾客串接；使用对应复合唯一键+复合外键，或在同一事务锁定并检查，并配真实数据库负例测试。冗余merchant_id必须与stores.merchant_id一致。
2. 一单一票/资金号/退款号/幂等键靠数据库唯一约束；不能只做“先SELECT未存在再INSERT”。撞唯一键后读取并核对既有记录，不能吞掉不同金额/归属的冲突。
3. 多行合计和累计退款额度不能写成普通行级CHECK并声称跨行有效。采用固定锁序（订单→支付→退款/票据）、事务重算及必要的可延迟约束触发器；是否采用触发器由后端决定，需有真实PG并发验证。
4. `可再申请退款额 = 已核实原支付总额 - 成功退款额 - 未决退款占用额`。requested/submitting/unknown/processing/abnormal均占用；failed/closed经可信确认才释放。同一事务锁支付后核算并创建意图，防两名商家并发超退。
5. 成功退款累计以唯一退款记录求和或“非成功→成功”的条件更新增加一次；不能每收到一次回调就相加。缓存汇总与底层记录同事务更新，并可重建核对。
6. 建议索引：receipts `(store_id,issued_at DESC,id DESC)`、`(customer_subject,store_id,issued_at DESC,id DESC)`、order_number唯一/精确搜索；refunds `(payment_id,refund_status)`、`(store_id,completed_at,id)`；事件/任务按待处理状态与next_retry_at的部分索引。所有列表稳定游标分页，时间相同以id破平，禁止无限全表下载。

## 4. 微信支付V3回调、查单与退款处理

### 4.1 支付结果

1. HTTPS接收原始请求体，限制体积/频率；用Wechatpay-Timestamp、Nonce、Serial、Signature及原始body按官方方案验签，支持平台证书/微信支付公钥轮换与防重放时间窗。不能用IP白名单、客户端状态或“解密成功”代替验签。
2. 验签后用APIv3密钥解密resource（AEAD_AES_256_GCM），校验事件类型/算法，匹配mchid、appid、out_trade_no、transaction_id、订单租户、币种、金额及允许的付款主体。服务商模式另核sub_mchid等真实归属。主动查单也在服务端签名请求、校验官方响应真实性并走相同资金核对入口。[支付成功通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791861)
3. 可信结果可靠入库，事务内锁订单/支付，去重，写资金事实、唯一票据及快照；异步签票时同事务写可靠签票任务。正常支付才按既有规则提交预留库存；迟到付款、重复扣款、金额/归属不符单独异常处理，不放宽正常履约门槛。
4. 在官方应答时限内处理；正式确认已可靠接收后按官方要求返回200/204。验签失败/解密失败/持久化失败不得伪装业务处理成功；重复已处理通知可安全应答。已验真但内容矛盾的事件进入持久隔离/告警，不生成票据或改错订单；HTTP策略由后端区分“尚未可靠接收”和“已可靠接收但业务隔离”。[支付成功通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791861)
5. 回调丢失/服务重启用持久重试、主动查单和定期对账补偿，不保证只依赖微信重推就最终一致。失败支付/关单/超时核查均保留证据与重试限制；客户端轮询到上限后提示稍后查看，不自行置paid/failed。[小程序支付开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791911)

### 4.2 退款结果

1. 服务端查明真实支付后，鉴权、核对退款策略/审批、金额和可退额度，事务内创建退款意图与稳定out_refund_no并占用额度，再提交渠道。调用微信网络接口时不长时间持有数据库事务/行锁。
2. 超时或状态未知先按原退款单号查单，同业务重试仍用原单号；明确未受理与已存在退款单分开处理，不能“换号再试”制造重复退款。微信官方限制如退款期限、部分退款次数/间隔按当时官方能力校验，不在客户端硬编码为永久规则。[退款开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4013071031)
3. 退款通知同样验签解密并校验退款单、原支付、商户、币种和金额；通知与查单共用幂等更新入口。只有可信SUCCESS更新成功金额，PROCESSING继续等待，ABNORMAL保持未决并走异常处置，CLOSED不计退款成功。[退款结果通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791865)、[退款查询](https://pay.wechatpay.cn/doc/v3/merchant/4012791863)
4. 原小票保留；关联多笔退款并显示每笔状态、实际成功金额/时间、累计退款、尚在处理金额。支付/退款已验真而本地业务落库失败，依靠同单号查单和重试修复，不再次发起新扣款/退款。

## 5. 商家与顾客权限边界

所有列表、详情、图片/PDF生成、退款、CSV任务创建、任务状态与下载均独立服务端鉴权；隐藏按钮不是授权。顾客身份由有效会话解析，store_id/merchant_id/customer_id不采信客户端自报。

| 身份 | 小票查询/保存 | 分享 | 导出本店交易 | 发起/批准退款 |
| --- | --- | --- | --- | --- |
| 游客/过期会话 | 禁止，要求登录 | 不获得私有票据访问权 | 禁止 | 禁止 |
| 顾客 | 仅本人订单，支持本人跨店历史但必须逐项校验归属；不能读取他人 | 仅主动分享自己的脱敏图片/摘要；私有详情仍验证归属 | 不允许本店批量；仅本人单票保存 | 不直接操作资金；售后申请若需要另定流程 |
| owner | 仅当前有效授权范围内的本店票据 | 仅授权范围内的脱敏副本 | 需receipts.export权限和审计 | 需refunds.create/refunds.approve及配置的审批/金额规则 |
| manager | 本店读取需有效membership | 同读取范围 | 默认不扩大权限，另授receipts.export才可用 | 默认无；明确授予且满足审批规则后可用 |
| staff/只读 | 仅显式授予本店读取的最小必要字段 | 默认无 | 默认无 | 无 |
| 内部任务/支付回调 | 仅专用服务身份的限定动作，不能充当商家会话 | 无任意公开分享权 | 任务授权范围内 | 仅既有已批准意图/可信渠道事件，不接受任意前端paid/refund声明 |

当前merchant_members只有merchant级owner/manager/staff，不能假称已有独立店铺授权、只读角色或上述细粒度权限。`permittedStore`按merchant会员查店铺；若目标是逐店授权或受限店员，需后端增加/明确store范围和capability，实施前保持默认拒绝新增退款/导出权限。切换商家工作台或输入订单号不会扩大授权。

共享数据不等于所有人可访问：跨顾客、跨店、无授权店、商家成员被撤销、顾客/商家会话混用均应拒绝；按统一策略返回401/403或防枚举404，不能泄露订单是否存在。main独立顾客会话不能直接复用legacy商家session或凭手机号自动合并历史；同人关联需既有受控身份机制证明。

小票不默认展示顾客完整手机号/地址、OpenID、内部subject、支付密钥、完整渠道流水号或商家内部备注。分享图片应由本人主动触发并提示包含消费信息；截图为生成时快照，显示生成时间及“退款状态以本人登录后查询为准”。分享卡片/二维码/猜到单号不授予详情读取权，接收者无权限时不显示他人交易。若未来需公开验票链接，应另行设计最小字段、短期授权、撤销及防枚举，首版不默认开启。

## 6. 页面、查询、保存与导出验收要求

- 顾客中心→我的小票：列表/日期筛选→详情；商家管理→小票记录：本店列表/日期/完整订单号精确查询→详情/导出。具体小程序路由和HTTP路径待共同确认，本轮不新增可点击占位入口冒充可用功能。
- 默认筛选小票签发日期issued_at，另显示官方paid_at；需要按交易日期查询时显式选择paid_at，不能混淆。日期区间按北京时间起始日00:00到结束日次日00:00的半开区间转换成UTC，拒绝无效/倒序/超限区间，起始/结束边界有测试。
- 详情展示票号、订单号、成交商家/店铺、商品行/数量/单价/小计、配送/优惠、订单总额、顾客实付、支付/签发时间、关联退款及实际退款金额。区分订单总额、顾客实付、成功退款与净额，存在渠道优惠时不混成同一个数字。
- 保存提供当前授权票据的图片/PDF（二者具体首版范围由负责人确认）；图片生成/相册授权/文件打开失败有明确提示，不把拒绝授权当成功。顾客可主动分享脱敏图片；具体微信能力与iOS/Android行为由负责人验收，不承诺绕过平台分享限制。
- 服务端支付已确认而票据尚在可靠队列中时显示生成中/可重试；加载中、空态、未登录、无权限、网络/存储失败和导出失败均应区分，不显示DEMO正式票、不以重试再付一次解决生成延迟。
- 导出单票副本及本店交易CSV，批量图片/PDF另定首版范围。所有导出任务在固定数据截点/筛选条件下分页生成，记录生成时间和授权范围，CSV按现有规范处理公式注入；不得导出别店/别人的顾客信息。
- 交易流水分别按支付成功时间、退款成功时间记录收款与退款；期内净额=本期可信收款-本期成功退款。不能只按本期签发小票减其截至当前退款来冒充本期现金流水；模拟交易单列并排除正式实收，跨期退款不改原交易金额。
- 下载对象私有、短时有效、绑定授权范围；任务创建与下载时再次核对有效会话/权限，撤权后不可继续下载。单纯长期对象URL或可转发签名URL不能替代需要即时撤权的鉴权下载；不在日志保留下载令牌。
- 页面异步操作绑定当前账号/店铺/请求序号；切身份/店铺或退出后清除旧票据和下载结果，迟到响应/分享回调不能泄露前一个账号的数据。

## 7. 腾讯云迁移边界

订单/支付/票据/退款的数据库事务和唯一约束是权威，不把小程序storage、消息队列或图片对象当账本。支付网关、任务队列、对象存储分别抽象；数据保留中立对象key与摘要，避免将当前供应商签名URL固化到快照。未来迁移到腾讯云数据库/COS/队列时必须核对事务能力、唯一索引、时区/整数精度、事件重放和权限策略，进行备份恢复及金额/行数/摘要对账后切换；迁移能力是设计目标，不代表已验证或获准部署。

## 8. 必须通过的验收与后端交接清单

| 用例 | 必须结果 |
| --- | --- |
| 真正验签成功支付、客户端成功但服务端未确认、取消/失败/未知 | 仅真实核实成功可签正式票；其余正确等待/重试，无假paid |
| 同通知重复、不同事件ID同交易、通知与查单并发 | 一份票、一笔资金结算、库存只提交一次 |
| 两个真实交易、伪造签名/错误公钥/过期重放/错商户/错币种/错金额 | 双扣不丢账；不可信或不匹配结果不误签、无跨单写入 |
| 服务重启、落库失败、任务/通知丢失 | 查单/重试可恢复，一单一票，不能先成功应答再丢失事件 |
| 超时关单与支付并发、取消后晚到到账、库存已释放 | 保留实际资金、禁止自动恢复履约，有可审计补偿/退款 |
| 全额/多次部分退款、两商家并发申请、同幂等键不同金额 | 成功额与占用额不超原款；冲突明确拒绝，不重复退 |
| 退款重复/乱序通知、未知/PROCESSING/ABNORMAL/CLOSED/失败 | 成功只累计一次；未决保留额度；非SUCCESS不能假称退成 |
| 商品改价/删除、店铺更名、退款后回看 | 原成交快照不变，退款关联可查 |
| 顾客读他人、商家跨店、撤权/过期、猜号/分享/下载/导出 | 服务端拒绝，列表/统计/文件均不泄露；旧异步结果清屏 |
| 日期跨日边界、跨期退款、分页/大量数据、CSV恶意名称 | 北京时间边界正确，无分页漏重，金额口径明确，导出安全 |
| 双端查看、微信保存/分享、iOS/Android | 同一服务端票号及退款结果；平台失败如实提示 |

执行层次必须分别留证：纯函数/适配器离线测试、真实隔离PG事务/唯一键/并发/回滚测试、微信V3签名与查单/退款集成、受控业务验收、微信平台及iOS/Android。当前这些小票专项测试均未运行，不能用现有215项前端回归代替。

后端负责人需确认：普通商户或服务商模式、支付来源/正式与测试边界、canonical支付及异常资金处理、迟到到账策略、字段/约束迁移、身份映射、逐店权限与退款审批、优惠/实退口径、留存/归档策略、持久队列与对账告警，并提供已实现的列表/详情/支付状态查询/保存/导出/退款契约及稳定错误码。本前端不得先猜这些路由。

本轮需求补充可评审；实现与发布仍为DEVELOPMENT。下一步是后端/项目负责人评审此契约，前端在已确认的只读小票协议基础上实现双方入口与页面、补充真实编译页面测试；真实资金、数据库迁移和发布另行授权。微信平台及真机仍由负责人完成，WAITING_FOR_OWNER_PREVIEW。

## 9. 官方参考（2026-10-30核对）

微信能力和状态语义依据下列官方文档；本文的本地表结构、状态命名、角色矩阵、事务/队列方案是项目设计提案，不是微信强制数据库模型。

- [支付成功回调通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791861)：回调真实性、解密及应答。
- [小程序支付开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791911)：查单、关单与支付状态核实。
- [退款开发指引](https://pay.wechatpay.cn/doc/v3/merchant/4013071031)：退款受理/结果区分、同单号重试、异常状态。
- [退款结果回调通知](https://pay.wechatpay.cn/doc/v3/merchant/4012791865)：SUCCESS/ABNORMAL/CLOSED通知及加密资源。
- [查询单笔退款](https://pay.wechatpay.cn/doc/v3/merchant/4012791863)：官方退款结果及响应验真。
