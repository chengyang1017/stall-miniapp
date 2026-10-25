# Phase 20 商家经营数据云端整合

本阶段只修改源码。未执行测试、数据库迁移、生产数据库写入、部署、发布或 Git 操作，未创建备份。静态类型／语法检查不代表数据库和微信运行验证。

## A 营业账单

现有 admin-billing 页面在有效 MerchantContext 下调用既有 `GET /v1/merchant/stores/:slug/billing`，无配置时继续读取现有本机演示订单。云端失败明确报错，不读取演示数据替代云端账单。

接口扩展：

- `from=YYYY-MM-DD&to=YYYY-MM-DD` 按北京时间业务日期查询，最多366天；不传时默认为北京时间今天。
- `all=1` 支持原界面的“全部日期”，不能与 from／to 混用。
- 明细每页默认50条，limit 1–100；以创建时间和 ID 倒序游标分页，游标含店铺、查询和分页大小摘要，换条件会重置。并发新增订单不混入已经向后翻过的页面，手动刷新可查看新记录。
- 汇总针对全部匹配订单，不限当前页。订单数包含取消；订单金额、未支付金额剔除取消；已送达按履约状态单独计数，不能当作支付证明。币种只统计 CNY。
- 未支付金额只计未取消且 payment_status='unpaid'。缺少可信支付核验链路，已确认收款固定为0，与 Phase 19 保持一致；其他支付标签只显示未核验。
- 每次读取使用短暂 REPEATABLE READ READ ONLY 事务，汇总和该页明细一致；翻页后状态可能已变化，刷新可重新核对。没有宣称跨所有翻页持有同一个数据库快照。
- 原有 `/billing/export` 仍提供 CSV 文件响应，兼容已有下载入口。新增 `format=json` 返回 CSV 内容和文件名，供当前账单页使用同一鉴权接口写入 USER_DATA_PATH，再通过 shareFileMessage 分享。
- 云端需要 owner／manager，明细和 CSV 都不选择顾客姓名、电话、地址、备注。中文表头、UTF-8 BOM、CRLF、单元格引号转义及公式注入防护；明细保留取消订单的原金额与状态，汇总金额排除取消，CSV 说明注明口径。
- CSV 最多10000订单、50000商品行、5MiB；SQL设置5秒超时。超限报错，不截断后声称导出完整；导出当前筛选全集而非只导出当前显示页。

修正旧 cloud-catalog 账单控制台的 authorizedGet 查询参数传法；其 CSV 下载接口保持兼容。演示账单同样不把本地 paid 标签认作收款，普通 CSV 不再输出联系方式等字段。

## B 工作台待处理数量

新增 `GET /v1/merchant/stores/:slug/orders/summary`，复用现有商家会话和店铺授权，只返回待接单数量及状态定义 new。聚合完整店铺订单，不取前100条再计数。

既有 orders 列表接口的 pendingCount 同步改为完整店铺 new 状态计数；admin-orders 的待接单标签使用该值。工作台每次 onShow 重新读取，完成接单返回即可刷新。失败显示“—”和错误说明，不用演示订单数或假零替代。

工作台不修改订单。无云端配置时使用现有演示订单加载器（包括库存演示订单）。订单管理原有列表仍最多返回100条；本阶段没有扩展完整订单分页，其他状态标签仍按现有已加载列表计数。

## C 营业时间／接单／公告

没有新增重复配置表。复用迁移004已有 `store_delivery_rules.configuration` JSONB：

- 接单开关 accepting、每周 days 使用原字段，星期日为下标0，start包含、end不包含，继续要求同日 start < end。
- 新增可选 notice（最多200字）及 minimumOrderCents。旧配置缺失时采用服务端默认空公告、0分，兼容现有数据；不会读取或上传某手机的本地配置。
- `GET /v1/merchant/stores/:slug/business-settings` 返回编辑所需字段及配置内容摘要 revision。
- `PATCH` 同路径只接受 accepting／days／notice／minimumOrderCents 加 expectedRevision。owner／manager 验证后对既有配置做局部合并，保留配送区域、半径、时段和未知扩展字段。
- 初次保存可以建立空区域／空时段配置，绝不生成虚构配送地区。没有有效配送配置时不能创建订单。只读取未配置店铺时返回明确未配置状态，不自动保存默认值。
- 使用 stores 的 NO KEY UPDATE 锁串行化初次建立及其他配置写入，兼容订单外键的 KEY SHARE；随后锁配送配置行并核对 revision，冲突返回409。避免覆盖另一台设备的新设置。
- 旧 delivery-rules PUT 在现有配置上合并，保留本阶段公告和起送门槛，避免旧配送客户端无意清空新字段；其既有 accepting、days、areas、slots 的显式更新继续生效。
- `GET /v1/stores/:slug/business-settings` 是公开只读投影，只对活动店铺返回公开营业时间、公告、起送门槛和服务端营业状态，不返回商家配置摘要、配送定位或管理权限。

顾客首页读取该公开接口；失败显示读取失败，不再展示本机营业设置冒充云端信息。营业管理页面保留原布局和操作，云端失败保留输入并要求核对；暂停接单不阻止浏览商品。

创建订单沿用 verifyDelivery，在事务内锁定服务器配送配置。检查接单开关、北京时间营业区间、配送地区／半径、日期和时段；等待商品锁后再核对时间边界，防止跨过关闭时间仍按旧时刻创建订单。原有未来7天配送范围和时段规则不变。

未发现独立的云端特殊日期设置或执行模块。本阶段不新增特殊日期规则；已有 JSONB 未知扩展字段原样保留，不会被营业设置 PATCH 删除。现有 delivery 页面仍是本地配送编辑器，本阶段没有把本地地区、半径或时段静默写入云端。

## D 起送金额

工作台有云端配置时从上述商家接口读取、局部保存 minimumOrderCents，整数分，范围0–99999900。保存冲突或失败保留输入并要求刷新核对，不提示虚假成功。

顾客购物车、结算页都从同一公开接口读取起送金额，以整数分计算差额，展示人民币。读取失败不沿用本机门槛；未达门槛禁止继续提交，服务端仍最终复核。

checkout 用服务器商品、折扣和订单行快照算商品小计，在订单写入及库存预留之前验证小计 >= 服务器门槛，配送费不参与。客户端即使伪造阈值也不被使用。校验失败不会创建订单或执行这次库存预留。

已有订单的金额和快照不追溯修改；现有幂等重试仍返回原订单，不因为后来修改门槛或暂停营业重建订单。没有实现或模拟支付成功，没有修改支付、库存预留或释放规则。

## 依赖与剩余事项

本期没有新增 SQL migration。JSONB 已允许这些字段，无需重复建表。配置接口依赖已有004；下单沿用既有 checkout／库存所需迁移（含009），经营分析继续依赖011。本任务没有执行任何既有迁移。

云端代码已经覆盖账单、工作台待接单、营业设置、公告、起送门槛及下单校验；无云端配置时各功能仍保留原有本地演示存储。实际运行尚需维护者另行处理后端更新、既有迁移和域名／会话配置。真实支付核验、完整订单列表分页、云端配送编辑页面均未在本期实现。

建议下一阶段优先把现有配送设置页面接入既有云端 delivery-rules API，形成经营与配送配置的完整管理流程；继续保留客户负责的支付边界。

## 修改文件清单

- 后端：src/billing.mjs、src/orderWorkflow.mjs、src/deliveryRules.mjs、src/checkout.mjs、src/server.mjs。
- 工具：utils/merchantOrdersCloud.ts、utils/storeHours.ts、utils/minimumOrder.ts、utils/cloudCheckout.ts；新增 utils/businessCloud.ts、utils/shareCsvFile.ts。
- 页面：admin/admin.ts、admin/admin.wxml；admin-orders/admin-orders.ts；admin-billing/admin-billing.ts、admin-billing/admin-billing.wxml；store-hours/store-hours.ts、store-hours/store-hours.wxml；cart/cart.ts、cart/cart.wxml；checkout/checkout.ts、checkout/checkout.wxml；index/index.ts；cloud-catalog/cloud-catalog.ts。
- 新增本文档 backend/BUSINESS_CLOUD_INTEGRATION.md。没有修改任何旧 SQL、图片、商品或经营分析源码。

## 后续手动体验入口（本任务未执行）

1. 在已有商家云端配置与会话下进入账单，查看今天／指定日期／全部日期，加载更多并导出CSV；断网应出现错误，不显示演示数据。
2. 工作台查看待接单数字，在订单管理接单后返回，数字应重新同步；无权限时显示“—”。
3. 营业管理编辑公告、周计划和接单开关；另一台已授权设备修改后，本设备旧版本保存应冲突，不能覆盖。
4. 设置起送门槛，顾客首页应显示服务器公告和状态，购物车与结算应显示相同门槛；未达门槛、暂停接单或休息中，应被服务器拒绝创建新订单。
5. 配送日期、地区及半径仍由既有服务器规则决定。没有配置云端地区／时段时明确不能下单；本地配送编辑器不会暗中创建云端配置。
6. 删除有效云端配置后，仅体验本机演示设置和订单，确认本地修改没有写入云端。
