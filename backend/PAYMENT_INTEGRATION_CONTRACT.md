# 客户支付模块对接契约草案

状态：Phase28源码核对后的待确认契约，**不是已经实现的支付API或双方已确认协议**。支付、退款、支付通知和对账由客户负责；本阶段没有接入、模拟或调用支付，没有改写支付状态。

## 已有订单契约

顾客通过认证会话调用`POST /v1/stores/:slug/orders`，请求头`Idempotency-Key`为20—100位字母/数字/下划线/短横线。请求为：

```json
{
  "items": [{"productId": "商品UUID", "quantity": 1}],
  "address": {"receiverName": "收货人", "phone": "中国大陆手机号", "areaId": "配送区域稳定ID", "detail": "详细地址"},
  "slot": {"id": "配送时段ID", "date": "YYYY-MM-DD"},
  "note": "顾客原始备注"
}
```

地图范围区域还需地址latitude/longitude。服务器重新查价格、折扣、上架/售罄、库存、营业、配送和起送门槛；不接收客户端价格或运费门槛。商品行、单价及总额保留成交快照。当前配送费为0，不表示收费规则已获客户最终确认。

成功首次201、相同请求重放200，主要响应：

| 字段 | 当前含义 | 支付接入要求 |
| --- | --- | --- |
| orderId | 服务器订单UUID | 支付商户单号如何映射需客户确认；不得按商品名重建关联 |
| totalCents | 服务器核定应付，整数人民币分 | 支付后端必须再次从订单读取，不能直接信任前端传值 |
| paymentStatus | 新订单为unpaid | 不是预支付成功或扣款证明 |
| fulfillmentStatus | 重放可能返回当前履约状态 | 独立于支付状态；新订单数据库默认new |
| inventoryState | none / held / committed / released | 有限库存创建时预留，不代表已收款 |
| inventoryExpiresAt | 有限库存预留到期的UTC时间 | 预留15分钟；支付有效期与库存到期关系需客户确认 |
| replayed | 是否返回已存在订单 | 客户端支付重试也需独立幂等，不创建另一商城订单 |

顾客只能通过`GET /v1/stores/:slug/orders/:id`读取本人订单。服务端保存currency=CNY、subtotal_cents、delivery_fee_cents、total_cents及customer_subject。商家内部备注不属于支付请求、顾客订单响应或付款通知。

## 客户需要提供并共同确认的接口

以下接口**尚不存在**，不能直接在小程序调用假定的`/pay`或`/refund`路径：

1. 创建支付请求的服务端路径、认证方式、请求/响应格式、幂等键规则。输入至少能定位订单及所属店铺，后端校验订单所属顾客、状态、服务器金额和支付有效期。
2. 提供给`wx.requestPayment`的真实支付参数来源，包括timeStamp、nonceStr、package、signType、paySign；不把AppSecret、商户私钥或APIv3密钥下发小程序。
3. 可信支付结果通知路径、签名/解密方案、证书或公钥轮换方式、事件ID、商户交易号、微信交易号、AppID/商户号、金额、币种、交易状态、完成时间和验签证据。
4. 主动查询支付结果的服务器接口，及前端付款后断网、超时、取消时的轮询与重试策略。前端SDK成功回调不能直接写paid，SDK取消也不代表服务器最终交易失败。
5. 支付关闭/失败事件与库存释放的映射、退款/部分退款接口及审批责任。退款申请、退款处理中、退款成功不能混为一谈。

需要客户资料：正式小程序AppID、支付商户模式及商户号、支付负责人、回调域名和网络要求、证书/公钥/密钥的受控提供方式、金额与币种约定、支付有效期、退款责任、异常人工处理及对账规则。只记录资料是否齐备，不在仓库保存密钥。

## 当前状态机及库存对接位置

- `checkout.mjs`创建unpaid订单；`inventory.mjs`在创建时预留有限库存，后台任务处理到期释放。服务启动就会运行任务，不能为支付联调误连生产。
- `orderWorkflow.mjs`负责履约步骤new→accepted→preparing→delivering→delivered；取消和异常有现有状态限制。送达必须走已校验图片的complete接口，且payment_status必须paid。
- 第七轮复核整改：有限/不限库存使用统一付款门槛。普通状态接口中，除符合原规则的取消外，合法履约变更（接单、备货、配送、配送异常）均需服务器订单的`payment_status='paid'`；`inventory_state='none'`不再绕过校验。送达仍走带凭证的complete接口并检查paid。refunded/partially_refunded不等于当前paid授权，测试这些字段不表示退款模块已实现。
- 未支付仍允许创建/重放和读取本人订单，以及原状态机允许的取消。new/accepted/preparing才有取消边；有限库存held的释放仍要求unpaid且new/cancelled，遗留已推进订单不放宽释放规则。到期释放、取消原因、授权和店铺校验不变。已支付held转committed不再次扣库存；已释放库存不能直接恢复履约。
- **new队列和待接单统计仍包含未支付订单，但显示在队列不代表可以接单。** 本次只修复履约接口付款门槛，不调整队列和报表口径；原需求“支付成功才进入正常待接单流程”的队列范围仍需与客户支付协议确认。paid字段的校验也不代表支付核验链已经接通。
- 到期释放后收到迟到付款，或已取消/异常订单收到付款，不得直接重新占库存、自动送达或假称退款成功。客户需确定关单、补偿、人工复核和真实退款策略。

## 幂等与可信结果

001的payment_events有provider/provider_event_id唯一约束，003有商城订单创建幂等，009有库存预留及单次释放保护；**这些不等于支付回调验签和业务幂等已实现**。

客户回调模块应验证签名/身份、订单/店铺/AppID归属、金额、币种、交易标识及允许的状态变化，并在事务内锁订单、记录可信事件与支付结果，再协调库存；相同通知安全重放，矛盾结果拒绝并复核。现有payment_events字段并不完整表示验签审计证据，是否扩展由支付接入方另行设计迁移和授权，不在本阶段执行。

账单、分析和归档目前可信收款保持0。即使payment_status被外部写成paid，报表也不会自动成为可信实收报表。可信支付依据、收入归集口径及退款扣回需要单独约定后接通，不能从库存流水或已送达状态推算收款。

## 待客户确认与后续验收

需要客户签定上述接口及异常策略后，再单独授权联调支付成功、失败、关闭、重复通知、退款、付款后断网及晚到通知。第七轮整改仅运行隔离内存夹具下的真实履约函数回归，paid/refunded为分支输入；没有调用支付服务或生成任何真实支付参数、交易、退款记录，尚未完成真实数据库或微信支付联调。

源码依据：[checkout](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs)、[履约与凭证](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs)、[库存](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/inventory.mjs)、[基础结构](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/001_init.sql)、[账单](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/billing.mjs)。
