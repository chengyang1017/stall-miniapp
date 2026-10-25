# Phase32 审计增量

按用户本阶段指令，商品评价由原可选转为当前开发范围，收藏仍可选未开发。11.04合并条目保持部分完成，并明确评价源码及外部支付/审核依赖。原Phase28统计为历史口径，不将新增范围重复计入首版核心计数。新增020未执行；三目标静态编译完成，不等同支付、图片、审核或业务验收。详见 [PRODUCT_REVIEWS.md](PRODUCT_REVIEWS.md)。

---

# Phase31 审计增量

原需求11.01的GPS可选项现按用户Phase31指令转为本阶段开发范围；下表对应行已更新源码证据。Phase28原始统计口径/数字保留历史，不将新增范围重复计入首版核心项。前台单任务源码及三目标静态编译已完成；019未执行，微信权限/实际定位/数据库与网络场景均未验证。无后台定位、多单行程、路线规划或支付变更。详见 [GPS_TRACKING.md](GPS_TRACKING.md)。

---

> 历史阶段文档：正文保留原审查时点。Phase29当前最新迁移为018；模块路径/独立构建与双AppID边界以 [APP_SEPARATION_READINESS.md](C:/Users/USER/WeChatProjects/miniprogram-1/backend/APP_SEPARATION_READINESS.md) 为准。未执行迁移或环境验证。

# 需求.md 逐条源码审计（Phase28）

日期：2026-10-25。唯一原始需求基准为项目根目录需求.md第0—12章。本审计保留原文及原始[核心]/[可选]/[待确认]标签；新增功能不另造原始需求计数。逐条证据指向当前本地实际页面、事件/函数、API和结构；不以旧阶段报告判定完成。所有结论仅为源码审计，尚未实际运行验证。

## 统计口径

一条原始checkbox算一项，复合条目不拆分，相同功能在不同原文条目出现仍各算一项；第12章问题与前章业务确认分别保留，不能为了减少分母删除。状态按原始条目互斥归类：完整源码链路→已完成源码；源码不完整→部分完成；纯首版缺失→尚未开发；等待业务答复→需要客户确认；支付/回调混合未完成→依赖客户支付模块；第10章、9.08以及8.12环境启用→测试或上线事项；未纳入首版的选项→可选或未来功能。可选但已完整开发的条目归已完成源码，原可选范围标签保留，不因此增加首版分母。

“首版核心”按原文130个[核心]计算，包含准备、支付、测试和上线，不把这些依赖剔除以虚增完成率。每项只计一次主状态；其他依赖在说明中记录。无测试不导致源码项被标为尚未开发；源码已完成也不表示已测试、环境已配置或客户已验收。

原始需求共 **167项**，原标记首版核心 **130项**；原可选20项、原待确认7项、第12章未加范围标签的问题10项。

| 主状态 | 全部167项 | 原核心130项 |
| --- | ---: | ---: |
| 已完成源码 | 99 | 92 |
| 部分完成 | 2 | 2 |
| 尚未开发 | 0 | 0 |
| 需要客户确认 | 22 | 5 |
| 依赖客户支付模块 | 11 | 11 |
| 属于测试或上线事项 | 20 | 20 |
| 可选或未来功能 | 13 | 0 |

“尚未开发”计数不包含已单列的可选未做、客户待定及支付未接通项目；它们绝非被宣布完成。具体缺口以逐项说明为准。

## 逐条核对证据

### 第0章：需求确认与项目准备

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 0.01 | [核心] 确认摊位经营的商品种类、商家名称和联系方式 | 需要客户确认 | 商家实际品类、名称、联系方式尚无客户确认记录；stores.name可展示，不能代填真实经营资料。 | [cloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/config/cloud.ts:3)；[.env.example:2](C:/Users/USER/WeChatProjects/miniprogram-1/backend/.env.example:2) |
| 0.02 | [核心] 确认第一版范围及客户验收标准 | 需要客户确认 | 核心/可选已分栏，但客户验收标准仍需签定。 | [app.json:5](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json:5)；[admin.wxml:27](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml:27) |
| 0.03 | [核心] 确认商家小程序账号、AppID、开发成员权限与上线主体 | 需要客户确认 | project.config.json有AppID；账号主体、成员和发布资质需客户提供。 | [project.config.json:3](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json:3)；[tsconfig.json:2](C:/Users/USER/WeChatProjects/miniprogram-1/tsconfig.json:2) |
| 0.04 | [核心] 建立 TypeScript 小程序项目和 Git 仓库 | 已完成源码 | TypeScript项目配置及既有.git目录存在；本次只核对路径，未执行Git命令。 | [project.config.json:3](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json:3)；[tsconfig.json:2](C:/Users/USER/WeChatProjects/miniprogram-1/tsconfig.json:2) |
| 0.05 | [核心] 规划顾客页面、商家管理页面与基本导航 | 已完成源码 | app.json注册顾客/商家页面，工作台和个人中心有导航。 | [app.json:5](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json:5)；[admin.wxml:27](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml:27) |
| 0.06 | [核心] 确认后端、数据库、图片存储和部署方案 | 需要客户确认 | Node/PostgreSQL/R2方案已有源码；真实供应配置、域名和部署选择待客户确认。 | [cloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/config/cloud.ts:3)；[.env.example:2](C:/Users/USER/WeChatProjects/miniprogram-1/backend/.env.example:2) |
| 0.07 | [核心] 与客户约定支付模块的接口、责任边界与测试方法 | 依赖客户支付模块 | 已补PAYMENT_INTEGRATION_CONTRACT草案，尚非双方确认协议。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |

### 第1章：商家端 — 商品分类与商品管理

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 1.01 | [核心] 新增商品分类 | 已完成源码 | 分类页新增→授权POST categories，绑定store_id。 | [admin-categories.ts:63](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts:63)；[categoryManagement.mjs:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/categoryManagement.mjs:3) |
| 1.02 | [核心] 修改商品分类名称 | 已完成源码 | 重命名→PATCH categories/:id，校验名称及版本。 | [admin-categories.ts:63](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts:63)；[categoryManagement.mjs:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/categoryManagement.mjs:3) |
| 1.03 | [核心] 删除商品分类（处理分类中已有商品） | 已完成源码 | 有商品时前后端拒绝删除，提示先移走商品，保留历史关联。 | [admin-categories.ts:63](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts:63)；[categoryManagement.mjs:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/categoryManagement.mjs:3) |
| 1.04 | [核心] 调整分类显示顺序 | 已完成源码 | 分类拖动顺序→PATCH categories/order，稳定ID及revision。 | [admin-categories.ts:63](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts:63)；[categoryManagement.mjs:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/categoryManagement.mjs:3) |
| 1.05 | [核心] 新增商品 | 已完成源码 | 正式表单POST products，017创建幂等，初始库存同事务。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 1.06 | [核心] 编辑商品名称、描述、所属分类和原价 | 已完成源码 | 表单PATCH名称/描述/分类/原价，服务端验证并保护未指定字段。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 1.07 | [核心] 上传、替换商品图片 | 已完成源码 | 正式图片工具签名PUT→complete→保存关联，失败保留原图，不自动删除R2。 | [cloudMerchantImage.ts:23](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudMerchantImage.ts:23)；[imageLifecycle.mjs:28](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/imageLifecycle.mjs:28) |
| 1.08 | [核心] 删除商品（历史订单不受影响） | 已完成源码 | 云端DELETE为软下架，历史order_items成交快照不变。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 1.09 | [核心] 上架、下架商品 | 已完成源码 | 单品/批量窄PATCH active；下架清除计划，未来计划不能提前上架。 | [admin-products.ts:18](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.ts:18)；[catalog.mjs:110](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:110) |
| 1.10 | [核心] 标记商品售罄及恢复销售 | 已完成源码 | soldOut与库存为零分别处理；补货不解除手动售罄。 | [admin-products.ts:18](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-products/admin-products.ts:18)；[catalog.mjs:110](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:110) |
| 1.11 | [可选] 设置商品库存及数量限制 | 已完成源码 | 原为可选，Phase17已有有限/不限、上限、预警、流水和事务预留。 | [inventory.mjs:34](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/inventory.mjs:34)；[009_product_inventory.sql:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/009_product_inventory.sql:3) |
| 1.12 | [待确认] 是否需要规格、口味或加料选项 | 需要客户确认 | 商品/订单模型无规格、口味、加料结构，需先确定是否纳入范围。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |

### 第2章：商家端 — 折扣管理

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 2.01 | [核心] 商品保留独立的原价 | 已完成源码 | price_cents与discount_price_cents独立存储。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |
| 2.02 | [核心] 商家自行输入折扣后的具体售价（不强制按百分比计算） | 已完成源码 | 表单输入具体折后金额，服务端整数分验证，不按百分比强制计算。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 2.03 | [核心] 设置折扣开始及结束时间 | 已完成源码 | 表单转换店铺本地时间为UTC，保存discount_start/end。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 2.04 | [核心] 到时间自动开始、结束促销 | 已完成源码 | 公开查询在数据库当前时间计算有效价；下单再次验证，不依赖手机计时。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |
| 2.05 | [核心] 折扣期间显示折后价与划线原价 | 已完成源码 | 首页、详情显示当前价及划线原价。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 2.06 | [核心] 当前折扣商品自动出现在顾客端折扣专区 | 已完成源码 | 本次补全店有效优惠独立服务端分页；不再仅过滤普通目录已加载商品。 | [index.ts:84](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:84)；[server.mjs:96](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:96) |
| 2.07 | [核心] 活动结束后自动恢复原价 | 已完成源码 | 数据库有效价CASE在到期后回原价；顾客刷新/重新读取获得新价格。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |
| 2.08 | [核心] 商家可提前取消或修改尚未完成的折扣活动 | 已完成源码 | 表单可清空折扣价或修改价/时间，云端PATCH保留其他字段。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 2.09 | [核心] 校验折扣价格合法性，不允许不合理的负数或金额格式 | 已完成源码 | 表单及catalog cents/时间窗、006 CHECK同时限制负数、格式、原价关系。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 2.10 | [核心] 订单保存成交时的价格快照，后续改价不影响已有订单 | 已完成源码 | checkout写order_items.unit_price_cents及生成小计；读取历史不用当前商品价格。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 2.11 | [可选] 折扣活动历史记录 | 可选或未来功能 | 没有独立促销活动历史表/查看入口；订单价格快照不等于活动历史。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |

### 第3章：商家端 — 营业与配送设置

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 3.01 | [核心] 设置营业时间 | 已完成源码 | 营业页按星期保存days，经business-settings局部PATCH。 | [store-hours.ts:22](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-hours/store-hours.ts:22)；[deliveryRules.mjs:53](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:53) |
| 3.02 | [核心] 一键暂停或恢复接受新订单 | 已完成源码 | accepting独立开关，verifyDelivery在服务器拒绝暂停接单。 | [store-hours.ts:22](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-hours/store-hours.ts:22)；[deliveryRules.mjs:53](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:53) |
| 3.03 | [核心] 设置每周允许配送的时间段 | 已完成源码 | 时段weekdays及areaIds落统一配送配置。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.04 | [核心] 添加、编辑、删除配送时段 | 已完成源码 | 配送页增改删slots，服务端验证开始/结束、重复与冲突。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.05 | [核心] 暂停特定配送时段 | 已完成源码 | slot.enabled独立控制，不改历史订单快照。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.06 | [核心] 设置特殊日期休息或临时关闭配送 | 已完成源码 | specialDates与deliveryPaused独立保存；日期检查严格且支持删除/重新开放。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.07 | [核心] 添加可配送的小区、街道或地区 | 已完成源码 | 区域为稳定自定义ID和名称，不写死小区。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.08 | [核心] 修改、删除可配送地区 | 已完成源码 | 区域编辑/删除受统一revision保护，地址重新核对有效性。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.09 | [核心] 启用、暂停指定地区配送 | 已完成源码 | area.enabled单独开关，服务器重新按区域检查。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.10 | [核心] 确保未来可增加配送地区，不把范围写死为某个小区 | 已完成源码 | areas数组允许动态新增，当前合理上限30个而非固定某小区。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.11 | [核心] 设置/修改订单预计送达时间 | 已完成源码 | 商家预计送达输入→授权PUT orders/:id/eta。 | [merchantEtaCloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantEtaCloud.ts:3)；[orderWorkflow.mjs:39](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:39) |
| 3.12 | [核心] 已下单订单不因后续关闭时段而直接删除 | 已完成源码 | 配送配置只作用新校验；订单delivery_slot_snapshot保留原时间。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 3.13 | [待确认] 顾客是否自己选择配送时段，还是商家统一安排 | 需要客户确认 | 现有代码由顾客选日期/时段，但尚无客户最终确认该规则的记录。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.14 | [待确认] 是否有提前截单时间 | 需要客户确认 | 没有独立提前截单参数；当前只按时段结束和营业时间校验，需确认提前量。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.15 | [待确认] 配送费：免费、统一收费，还是按地区收费 | 需要客户确认 | 服务端配送费当前固定0，没有地区/统一收费规则，客户须确认。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 3.16 | [待确认] 谁负责配送（摊主、员工或第三方） | 需要客户确认 | 无骑手身份或指派模型；实际配送人员需确认，不擅自开发配送员端。 | [admin-orders.ts:36](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:36)；[merchantOrderQuery.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:12) |
| 3.17 | [可选] 每个配送时段的最大订单量 | 可选或未来功能 | 没有时段容量/订单数配额校验，留作可选。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 3.18 | [可选] 地图选点、配送半径或多边形配送范围 | 已完成源码 | 已有地址地图选点和区域中心/半径校验；未做多边形，原条目为“或”。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |

### 第4章：商家端 — 订单处理

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 4.01 | [核心] 查看新订单和订单详情 | 已完成源码 | 订单列表及详情均有授权读取，分页覆盖店铺历史。 | [admin-orders.ts:36](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:36)；[merchantOrderQuery.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:12) |
| 4.02 | [核心] 查看订单商品、数量、金额及收货信息 | 已完成源码 | merchantOrderQuery返回商品/金额及联系、配送快照，商家卡片展示。 | [admin-orders.ts:36](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:36)；[merchantOrderQuery.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:12) |
| 4.03 | [核心] 接单、开始备货 | 已完成源码 | 原状态机new→accepted→preparing和批量操作具备；仍受现有支付/库存门槛，不能视为收款闭环。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 4.04 | [核心] 标记订单为配送中 | 已完成源码 | preparing→delivering经原单订单状态接口。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 4.05 | [核心] 填写和更新预计送达时间 | 已完成源码 | 订单卡片修改ETA，与3.11同一功能，原条目分别统计。 | [merchantEtaCloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantEtaCloud.ts:3)；[orderWorkflow.mjs:39](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:39) |
| 4.06 | [核心] 商品送达后拍摄或上传送达照片 | 已完成源码 | delivery-proof选择相机/相册，上传至授权私有凭证Key。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 4.07 | [核心] 照片上传成功后标记订单已送达 | 已完成源码 | 先验证对象登记/HEAD、类型/大小，再complete写delivered；失败不错误完成。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 4.08 | [核心] 保存送达时间及照片凭证 | 已完成源码 | orders保存delivered_at/delivery_proof_key，015历史保护。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 4.09 | [核心] 查看历史订单 | 已完成源码 | 商家列表游标、日期及状态筛选，不限前100条。 | [admin-orders.ts:36](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:36)；[merchantOrderQuery.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:12) |
| 4.10 | [核心] 处理取消订单及记录原因 | 已完成源码 | 取消接口验证状态、记录原因和状态事件，按原规则释放未支付预留。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 4.11 | [核心] 标记配送异常并填写原因 | 已完成源码 | 仅配送中标abnormal，记录issue_reason，不假装退款。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 4.12 | [核心] 显示待处理订单数量和新订单提示 | 已完成源码 | 工作台summary和订单页全店数量一致；页面显示/刷新提示，不含后台推送。 | [admin.ts:4](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.ts:4)；[merchantOrderQuery.mjs:6](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:6) |
| 4.13 | [核心] 商家可记录订单备注 | 已完成源码 | 本次独立merchant_note/version，授权PUT note、版本冲突保护；顾客备注不被覆盖。 | [admin-orders.ts:119](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:119)；[orderWorkflow.mjs:29](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:29)；[018_store_code_merchant_note.sql:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/018_store_code_merchant_note.sql:3) |
| 4.14 | [可选] 订单搜索、筛选、导出 | 已完成源码 | 原可选：已有服务端搜索、组合筛选，以及账单/归档订单导出。 | [billing.mjs:9](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/billing.mjs:9)；[merchantArchives.mjs:43](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantArchives.mjs:43) |
| 4.15 | [可选] 小票打印 | 可选或未来功能 | 无打印机协议、排版或小票打印入口；店铺码PNG导出不是订单小票。 | [app.json:5](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json:5)；[server.mjs:44](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:44) |
| 4.16 | [可选] 简单销售统计 | 已完成源码 | 已有经营分析指标、排行、趋势/小时分布及CSV。 | [salesAnalytics.mjs:84](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/salesAnalytics.mjs:84)；[admin-analytics.ts:18](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-analytics/admin-analytics.ts:18) |

### 第5章：顾客端 — 首页、扫码与商品展示

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 5.01 | [核心] 支持微信扫描正式小程序码进入店铺首页 | 已完成源码 | 本次正式微信getwxacodeunlimit，32位店铺UUID scene→公开店铺解析→首页；依赖正式发布和可信API配置，未生成/扫码验证。 | [storeEntry.mjs:22](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/storeEntry.mjs:22)；[store-code.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts:30)；[storeEntry.ts:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:13) |
| 5.02 | [核心] 商家可保存或打印店铺小程序码 | 已完成源码 | 本次商家码页预览、保存相册、PNG文件分享导出；打印使用导出图片，非硬件驱动。 | [storeEntry.mjs:22](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/storeEntry.mjs:22)；[store-code.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts:30)；[storeEntry.ts:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:13) |
| 5.03 | [核心] 扫码后无需先登录即可浏览商品 | 已完成源码 | 入口验证及products/business-settings均公开GET，不要求先微信登录。 | [storeEntry.mjs:22](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/storeEntry.mjs:22)；[store-code.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts:30)；[storeEntry.ts:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:13) |
| 5.04 | [核心] 显示商家名称、营业状态和公告 | 已完成源码 | 本次营业公开信息返回真实stores.name；首页名称、营业状态和公告一致。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.05 | [核心] 展示商品分类导航 | 已完成源码 | 公开分类元数据及排序→首页分类导航。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.06 | [核心] 按分类展示商品 | 已完成源码 | category参数在服务端作用于完整店铺集合并兼容分页。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.07 | [核心] 展示商品图片、名称、价格和详情 | 已完成源码 | 公开商品图片/名称/价格/描述→详情，库存/有效价不靠本机模拟。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.08 | [核心] 展示正在进行的限时折扣专区 | 已完成源码 | 本次全店促销独立查询discount=1并可续页，不受普通目录前页限制。 | [index.ts:84](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:84)；[server.mjs:96](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:96) |
| 5.09 | [核心] 商品优惠时显示折后价及原价 | 已完成源码 | 有效折后价与原价分别展示，正常价不显示伪折扣。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.10 | [核心] 显示下架、售罄状态并禁止购买 | 已完成源码 | 公开下架商品隐藏；已加载后失效时详情不可售，售罄/零库存展示并禁止加购/下单。 | [cloudCart.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:30)；[cart.ts:41](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts:41) |
| 5.11 | [核心] 支持分享店铺给微信好友 | 已完成源码 | 本次首页onShareAppMessage及分享按钮；路径仅store slug，接收端公开解析，无身份令牌。 | [index.ts:61](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:61)；[storeEntry.ts:28](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:28) |
| 5.12 | [可选] 商品搜索 | 已完成源码 | 原可选：明确搜索按钮、最长100字符、服务器名称部分匹配。 | [index.ts:76](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.ts:76)；[index.wxml:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.wxml:13) |
| 5.13 | [可选] 收藏及再次购买 | 可选或未来功能 | 尚无收藏表或再次购买操作；普通历史订单查看不等于复购。 | [app.json:5](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json:5)；[server.mjs:44](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:44) |
| 5.14 | [可选] 商品专属小程序码 | 可选或未来功能 | 本次仅店铺级码；未做商品专属码。 | [storeEntry.mjs:22](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/storeEntry.mjs:22)；[store-code.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts:30)；[storeEntry.ts:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:13) |

### 第6章：顾客端 — 购物车与下单

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 6.01 | [核心] 添加商品到购物车 | 已完成源码 | cloudCart加购先读公开商品，商家售罄/库存规则拦截。 | [cloudCart.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:30)；[cart.ts:41](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts:41) |
| 6.02 | [核心] 增减商品数量、移除商品 | 已完成源码 | 购物车加减/移除保留原操作，云端正向数量验证库存。 | [cloudCart.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:30)；[cart.ts:41](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts:41) |
| 6.03 | [核心] 自动计算购物车金额，展示人民币 ¥ | 已完成源码 | 金额按服务端有效分价计算，展示CNY/¥。 | [cloudCart.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:30)；[cart.ts:41](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts:41) |
| 6.04 | [核心] 保存未提交的购物车 | 已完成源码 | 按API/店铺/身份cacheScope保留设备临时购物车；无跨设备同步承诺。 | [cloudCart.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:30)；[cart.ts:41](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/cart/cart.ts:41) |
| 6.05 | [核心] 提交订单前校验商品是否仍上架、售罄及价格是否有效 | 已完成源码 | 云端购物车刷新价格/状态，下单再从服务器锁定读取，不信客户端金额。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 6.06 | [核心] 提供订单确认页 | 已完成源码 | 现有checkout确认页展示商品、地址和配送选择。 | [checkout.wxml:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.wxml:47)；[checkout.mjs:21](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:21) |
| 6.07 | [核心] 收货人姓名必填 | 已完成源码 | 地址表单/后端validAddress校验receiverName必填。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |
| 6.08 | [核心] 手机号必填并校验格式 | 已完成源码 | 地址簿和下单均校验中国大陆1[3-9]开头11位手机号。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |
| 6.09 | [核心] 配送地区/地址必填 | 已完成源码 | 必须选择当前启用区域稳定ID，并在服务端重新校验。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |
| 6.10 | [核心] 详细地址必填（楼栋、单元、门牌等） | 已完成源码 | 表单/后端detail非空且长度限制。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |
| 6.11 | [核心] 验证地址属于商家开放的配送范围 | 已完成源码 | 命名区域或地图半径由verifyDelivery校验，不允许任意areaId绕过。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 6.12 | [核心] 显示商家允许的配送时间 | 已完成源码 | 公开规则过滤有效区域/星期/特殊日期，结算展示有效时段。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 6.13 | [核心] 按最终确定的规则选择或确认配送时间 | 需要客户确认 | 当前顾客选时段/日期源码具备；最终业务安排方式仍需客户确认，关联3.13。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 6.14 | [核心] 展示商品总额、配送费（如有）和最终应付金额 | 已完成源码 | 本次补齐商品合计、当前配送费0及预计总额展示；收费方式另待3.15确认，最终以服务器核算。 | [checkout.wxml:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.wxml:47)；[checkout.mjs:21](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:21) |
| 6.15 | [核心] 支持顾客填写订单备注 | 已完成源码 | 顾客自由备注及店铺快捷标签写contact_snapshot.note。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 6.16 | [核心] 确认订单并创建订单记录 | 已完成源码 | 认证POST orders，服务器生成ID、价格/地址/配送快照和库存预留。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 6.17 | [核心] 对接客户开发的支付功能 | 依赖客户支付模块 | 无真实创建支付/回调处理模块；本次只补契约草案，等待客户实现。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 6.18 | [核心] 显示订单提交、支付成功/失败的明确结果 | 依赖客户支付模块 | 订单创建成功/失败、待支付结果已显示；真实支付成功/失败通知仍依赖客户模块。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 6.19 | [可选] 保存和选择常用收货地址 | 已完成源码 | 原可选：云端地址CRUD/默认/版本，按顾客与店铺分簿，结算选择。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |

### 第7章：顾客端 — 订单与配送进度

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 7.01 | [核心] 查看自己的订单列表及订单详情 | 已完成源码 | 本人认证列表/详情，Phase27服务端分页及缓存上下文隔离。 | [orders.ts:34](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts:34)；[order-detail.ts:15](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts:15)；[orderWorkflow.mjs:171](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:171) |
| 7.02 | [核心] 显示待支付、待接单、准备中、配送中、已送达状态 | 已完成源码 | 列表/详情独立显示支付和履约状态，不以库存当收款；真实支付状态由外部提供。 | [orders.ts:34](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts:34)；[order-detail.ts:15](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts:15)；[orderWorkflow.mjs:171](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:171) |
| 7.03 | [核心] 配送中显示大约送达时间 | 已完成源码 | delivering时显示estimatedArrival。 | [orders.ts:34](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts:34)；[order-detail.ts:15](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts:15)；[orderWorkflow.mjs:171](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:171) |
| 7.04 | [核心] 商家修改预计时间后同步更新顾客端 | 已完成源码 | 商家ETA持久化后顾客onShow/刷新读取最新；无后台推送承诺。 | [merchantEtaCloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantEtaCloud.ts:3)；[orderWorkflow.mjs:39](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:39) |
| 7.05 | [核心] 已送达时显示送达时间 | 已完成源码 | 已送达显示deliveredAt转换北京时间。 | [orders.ts:34](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts:34)；[order-detail.ts:15](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts:15)；[orderWorkflow.mjs:171](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:171) |
| 7.06 | [核心] 顾客可查看该订单的送达照片 | 已完成源码 | 顾客通过授权proof短链读取照片，支持重新获取。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 7.07 | [核心] 仅订单所属顾客和有权限的商家人员能查看凭证 | 已完成源码 | 本人订单或获授权商家校验，再返回180秒链接；凭证桶必须实际私有。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 7.08 | [核心] 提供联系商家的方式 | 已完成源码 | 首页、详情及个人中心联系入口指向独立云端客服。 | [support.mjs:11](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/support.mjs:11)；[support-chat.ts:4](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/support-chat/support-chat.ts:4) |
| 7.09 | [核心] 显示取消、退款或配送异常等相应状态 | 已完成源码 | 取消/异常显示原因；本次补paymentStatus的refunded/partially_refunded文案，不生成退款。 | [orders.ts:34](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/orders/orders.ts:34)；[order-detail.ts:15](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/order-detail/order-detail.ts:15)；[orderWorkflow.mjs:171](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:171) |
| 7.10 | [待确认] 商家拍照后直接算已送达，还是需要顾客确认收货 | 需要客户确认 | 当前为商家凭证校验后直接送达；是否增加顾客确认收货尚待确认。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 7.11 | [待确认] 顾客取消订单及售后规则 | 需要客户确认 | 只有商家取消流程；顾客主动取消/售后权限和期限未确定，不擅自开放。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 7.12 | [可选] 微信订阅消息提醒订单进度 | 可选或未来功能 | 没有微信订阅授权/服务端发送；通知偏好仅设备设置并已说明。 | [customer-settings.wxml:11](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/customer-settings/customer-settings.wxml:11)；[orderWorkflow.mjs:70](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:70) |

### 第8章：后端、权限与数据安全

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 8.01 | [核心] 设计商品分类、商品、折扣、配送地区、配送时段、购物车、订单、订单明细等数据表 | 部分完成 | 已有商品/订单/配送等数据库结构；购物车明确为隔离设备临时存储，未建cart表，是否要求云端购物车须确认，不能以空表假装接通。 | [001_init.sql:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/001_init.sql:3)；[004_delivery_rules.sql:1](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/004_delivery_rules.sql:1)；[cloudCart.ts:20](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:20) |
| 8.02 | [核心] 设计商家权限，普通顾客不能管理商品或他人订单 | 已完成源码 | authenticate+permittedStore+角色检查；普通顾客不能读商品管理或他人订单。 | [auth.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:12)；[auth.mjs:58](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:58) |
| 8.03 | [核心] 设计顾客身份与订单归属校验 | 已完成源码 | subject由微信服务器身份产生；订单/地址/客服按subject及店铺过滤。 | [auth.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:12)；[auth.mjs:58](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:58) |
| 8.04 | [核心] 服务端验证商品状态、活动有效期、价格和运费 | 已完成源码 | checkout重新读商品、有效价/库存、配送规则；运费现由服务器固定0，不接受客户端随意金额。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 8.05 | [核心] 服务端验证配送范围及配送时段 | 已完成源码 | verifyDelivery在事务内锁规则并重新校验日期/区域/时段。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 8.06 | [核心] 创建唯一订单编号 | 已完成源码 | 订单UUID由数据库gen_random_uuid创建。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 8.07 | [核心] 记录订单价格、收货姓名、电话、地址及配送时间的快照 | 已完成源码 | order_items成交价、contact_snapshot、delivery_slot_snapshot在下单时保存，变更不追溯。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 8.08 | [核心] 支付状态与配送状态分别管理 | 已完成源码 | payment_status和fulfillment_status独立列，未实现的支付不伪造成已完成。 | [001_init.sql:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/001_init.sql:3)；[004_delivery_rules.sql:1](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/004_delivery_rules.sql:1)；[cloudCart.ts:20](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudCart.ts:20) |
| 8.09 | [核心] 处理重复下单、重复回调与并发请求 | 依赖客户支付模块 | 订单重复提交及库存并发已有事务/唯一约束；重复支付回调仍无模块，依赖客户实现。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 8.10 | [核心] 上传和存储商品图片与送达凭证 | 已完成源码 | 商品签名上传/完成验证及私有订单凭证登记、历史保护具备源码。 | [cloudMerchantImage.ts:23](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/cloudMerchantImage.ts:23)；[imageLifecycle.mjs:28](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/imageLifecycle.mjs:28) |
| 8.11 | [核心] 对姓名、手机号、住址及送达照片设置访问控制 | 已完成源码 | 私有API按本人/商家授权读取；导出默认不含联系信息；本机演示不作为真实隐私边界。 | [customer-settings.wxml:11](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/customer-settings/customer-settings.wxml:11)；[orderWorkflow.mjs:70](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:70) |
| 8.12 | [核心] 配置 HTTPS API 和微信小程序合法服务器域名 | 属于测试或上线事项 | 这是环境配置/上线事项：有HTTPS校验和域名依赖说明，但本阶段未配置实际域名。 | [cloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/config/cloud.ts:3)；[.env.example:2](C:/Users/USER/WeChatProjects/miniprogram-1/backend/.env.example:2) |
| 8.13 | [核心] 处理服务端异常、日志和必要的数据备份 | 已完成源码 | 服务端错误码、脱敏日志、DB/R2备份元数据与校验脚本存在；本阶段未实际备份或演练。 | [server.mjs:123](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:123)；[backup-db.mjs:32](C:/Users/USER/WeChatProjects/miniprogram-1/backend/scripts/backup-db.mjs:32)；[backup-r2.mjs:31](C:/Users/USER/WeChatProjects/miniprogram-1/backend/scripts/backup-r2.mjs:31) |
| 8.14 | [核心] 准备隐私规则和个人信息处理说明 | 部分完成 | 设置页只有基本存储/通知说明；主体、隐私联系人、保留与删除规则及平台隐私申报未完成。 | [customer-settings.wxml:11](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/customer-settings/customer-settings.wxml:11)；[orderWorkflow.mjs:70](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:70) |
| 8.15 | [可选] 数据导出与管理端统计 | 已完成源码 | 原可选：已有owner归档/账单/经营分析导出，CSV BOM与公式防护。 | [billing.mjs:9](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/billing.mjs:9)；[merchantArchives.mjs:43](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantArchives.mjs:43) |

### 第9章：客户负责支付模块 — 对接清单

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 9.01 | [核心] 明确客户使用的支付方案和小程序支付接入要求 | 依赖客户支付模块 | 支付方案、商户模式和AppID关系尚待客户提供，契约只是草案。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.02 | [核心] 确认创建支付请求需要的订单号、金额及其他字段 | 依赖客户支付模块 | 草案列出orderId、totalCents、CNY、subject和预留状态；客户支付请求接口未确认。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.03 | [核心] 约定支付成功、失败、取消及超时的处理方式 | 依赖客户支付模块 | 草案列出成功/失败/取消/超时及晚到付款边界；没有双方确认规则。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.04 | [核心] 约定服务端支付结果通知/查询接口 | 依赖客户支付模块 | 没有已注册支付回调/查询接口；草案要求验签、金额/归属、唯一事件与查询协议。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.05 | [核心] 确保前端无法自行修改支付金额 | 依赖客户支付模块 | 商城金额来自服务端快照；支付模块尚缺，不能宣称真实支付金额防篡改已验收。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.06 | [核心] 支付成功才进入正常待接单流程 | 依赖客户支付模块 | new队列含未支付订单，不限库存部分推进未统一paid门槛；需客户支付协议与待接单语义共同接通。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.07 | [核心] 约定退款责任、接口及订单状态同步 | 依赖客户支付模块 | 退款责任/接口/状态同步未约定，禁止伪造退款成功。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 9.08 | [核心] 联调和测试支付异常、重复通知及付款后断网情形 | 属于测试或上线事项 | 明确属于联调测试事项，本阶段未运行；同时依赖客户支付模块。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |

### 第10章：测试与上线交付

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 10.01 | [核心] 测试分类增删改、商品上架下架、售罄状态 | 属于测试或上线事项 | 分类和商品变更的功能验证未执行。 | [admin-categories.ts:63](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-categories/admin-categories.ts:63)；[categoryManagement.mjs:3](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/categoryManagement.mjs:3) |
| 10.02 | [核心] 测试折扣开始前、生效中、到期后及手动取消 | 属于测试或上线事项 | 折扣时间边界验证未执行；源码已具备服务端时间规则。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |
| 10.03 | [核心] 测试改价后历史订单价格保持不变 | 属于测试或上线事项 | 历史成交价验证未执行；快照源码已实现。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 10.04 | [核心] 测试暂停接单、关闭配送时段及修改配送范围 | 属于测试或上线事项 | 营业配送变更验证未执行；源码保留原有订单。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 10.05 | [核心] 测试非法手机号、空姓名、无效地址和范围外地址 | 属于测试或上线事项 | 表单/服务端非法输入验证未执行。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |
| 10.06 | [核心] 测试购物车、订单金额、重复下单和并发下单 | 属于测试或上线事项 | 购物车/下单并发功能验证未执行。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 10.07 | [核心] 测试支付成功、失败、超时、重复回调及退款 | 属于测试或上线事项 | 支付异常及退款验证未执行，且支付模块仍为外部依赖。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 10.08 | [核心] 测试配送状态、预计时间更新与订单权限 | 属于测试或上线事项 | 履约/ETA/权限验证未执行。 | [orderWorkflow.mjs:225](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:225)；[admin-orders.ts:86](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:86) |
| 10.09 | [核心] 测试送达图片上传失败时订单不能错误标记完成 | 属于测试或上线事项 | 图片失败与送达一致性验证未执行。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 10.10 | [核心] 测试顾客只能查看自己的订单与照片 | 属于测试或上线事项 | 顾客订单和凭证隔离验证未执行。 | [auth.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:12)；[auth.mjs:58](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:58) |
| 10.11 | [核心] Android 微信真机测试 | 属于测试或上线事项 | 未运行Android真机验证。 | [project.config.json:3](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json:3)；[tsconfig.json:2](C:/Users/USER/WeChatProjects/miniprogram-1/tsconfig.json:2) |
| 10.12 | [核心] iOS 微信兼容性测试（可借设备） | 属于测试或上线事项 | 未运行iOS微信验证。 | [project.config.json:3](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json:3)；[tsconfig.json:2](C:/Users/USER/WeChatProjects/miniprogram-1/tsconfig.json:2) |
| 10.13 | [核心] 使用正式 AppID 进行体验版测试 | 属于测试或上线事项 | 未使用正式AppID运行体验版验证。 | [project.config.json:3](C:/Users/USER/WeChatProjects/miniprogram-1/project.config.json:3)；[tsconfig.json:2](C:/Users/USER/WeChatProjects/miniprogram-1/tsconfig.json:2) |
| 10.14 | [核心] 生成正式小程序码并测试扫码进入 | 属于测试或上线事项 | 正式码API源码已补，但本阶段未实际生成、扫码或操作微信平台。 | [storeEntry.mjs:22](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/storeEntry.mjs:22)；[store-code.ts:30](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/store-code/store-code.ts:30)；[storeEntry.ts:13](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/storeEntry.ts:13) |
| 10.15 | [核心] 完成主体资质、备案和所需的平台审核流程 | 属于测试或上线事项 | 资质、备案、主体及平台审核由客户/运营完成，本阶段未操作。 | [INTEGRATION_READINESS.md:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/INTEGRATION_READINESS.md:24)；[server.mjs:128](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:128) |
| 10.16 | [核心] 提交正式版本审核并发布 | 属于测试或上线事项 | 未提交审核或发布小程序。 | [INTEGRATION_READINESS.md:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/INTEGRATION_READINESS.md:24)；[server.mjs:128](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:128) |
| 10.17 | [核心] 向商家交付管理说明、必要账号权限和约定的源代码 | 属于测试或上线事项 | 已有源码/后台说明，正式管理说明交付和账号移交需双方确认，尚未完成交付。 | [app.json:5](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/app.json:5)；[admin.wxml:27](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin/admin.wxml:27) |
| 10.18 | [核心] 客户验收：完整演示从扫码到送达拍照的全过程 | 属于测试或上线事项 | 完整客户验收未执行，不能将源码检查算作验收。 | [INTEGRATION_READINESS.md:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/INTEGRATION_READINESS.md:24)；[server.mjs:128](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:128) |

### 第11章：以后再考虑（非首版必需）

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 11.01 | [原可选，Phase31已纳入] 地图 GPS 实时骑手位置 | 已完成源码 | Merchant主动前台定位、明确指派、单任务会话、Customer本人订单最近点地图、到期/终态撤权；后台和多单行程不在本次实现内，未运行验证。 | [GPS_TRACKING.md](GPS_TRACKING.md)；[deliveryTracking.mjs](src/deliveryTracking.mjs)；[019](sql/019_delivery_tracking.sql)；[Customer控制器](../miniprogram/modules/customer/controllers/tracking.ts)；[Merchant设备单例](../miniprogram/modules/merchant/controllers/trackingDevice.ts) |
| 11.02 | [可选] 路线规划及自动预计送达时间 | 可选或未来功能 | ETA是商家文字，不是路线规划或自动预计到达。 | [merchantEtaCloud.ts:3](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/utils/merchantEtaCloud.ts:3)；[orderWorkflow.mjs:39](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:39) |
| 11.03 | [可选] 复杂优惠券、满减、会员积分 | 可选或未来功能 | 无优惠券/满减/积分模型或计算；当前只支持单商品折扣。 | [server.mjs:103](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/server.mjs:103)；[006_product_description_discount.sql:4](C:/Users/USER/WeChatProjects/miniprogram-1/backend/sql/006_product_description_discount.sql:4) |
| 11.04 | [原可选；评价已纳入Phase32，收藏仍可选] 商品评价与收藏 | 部分完成 | 评价/评分/图片/修订/回复/举报/独立人审源码已实现；可信支付核验未接入，当前真实发表仍不满足资格。微信自动内容安全为预留适配器，默认待审；收藏尚未开发。未运行验证。 | [PRODUCT_REVIEWS.md](PRODUCT_REVIEWS.md)；[productReviews.mjs](src/productReviews.mjs)；[reviewPolicy.mjs](src/reviewPolicy.mjs)；[020](sql/020_product_reviews.sql)；[顾客页](../miniprogram/pages/customer-reviews/customer-reviews.ts)；[商家页](../miniprogram/pages/merchant-reviews/merchant-reviews.ts) |
| 11.05 | [可选] 多商家入驻 | 可选或未来功能 | 虽有店铺隔离，但没有多商家自助入驻/审核模块；不把多店查询当作入驻。 | [auth.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:12)；[auth.mjs:58](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/auth.mjs:58) |
| 11.06 | [可选] 专门的配送员端 | 可选或未来功能 | 无独立配送员小程序；Phase31仅在Merchant内实现本店被指派成员的定位页面，不等同完整骑手调度平台。 | [GPS_TRACKING.md](GPS_TRACKING.md)；[merchant-tracking](../miniprogram/pages/merchant-tracking/merchant-tracking.ts) |
| 11.07 | [可选] 高级营收与销量报表 | 可选或未来功能 | 已有销售分析基础；“高级”进一步规则未定义，原文明确非首版必需，不额外扩展。 | [salesAnalytics.mjs:84](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/salesAnalytics.mjs:84)；[admin-analytics.ts:18](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-analytics/admin-analytics.ts:18) |

### 第12章：待向商家确认的关键问题

| ID | 原始需求 | 主状态 | 实际链路、依赖与缺口 | 具体源码证据 |
| --- | --- | --- | --- | --- |
| 12.01 | 配送费用如何计算？ | 需要客户确认 | 同3.15，当前运费0并非客户最终确认。 | [checkout.mjs:24](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:24)；[checkout.ts:1](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/checkout/checkout.ts:1) |
| 12.02 | 配送时段是顾客选择，还是商家决定？ | 需要客户确认 | 同3.13，当前顾客选择，但最终安排方式待确认。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 12.03 | 是否需要每个时段最晚下单时间？ | 需要客户确认 | 同3.14，当前无提前截单参数。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 12.04 | 商品是否有大小份、口味等规格？ | 需要客户确认 | 同1.12，规格/口味模型未定义。 | [admin-product-form.ts:296](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-product-form/admin-product-form.ts:296)；[catalog.mjs:98](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/catalog.mjs:98) |
| 12.05 | 实际配送人是谁？ | 需要客户确认 | 同3.16，实际配送人员未确认。 | [admin-orders.ts:36](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/admin-orders/admin-orders.ts:36)；[merchantOrderQuery.mjs:12](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/merchantOrderQuery.mjs:12) |
| 12.06 | 顾客付款后能否申请取消或退款？ | 需要客户确认 | 同7.11/9.07，付款后取消和退款责任待定。 | [PAYMENT_INTEGRATION_CONTRACT.md:46](C:/Users/USER/WeChatProjects/miniprogram-1/backend/PAYMENT_INTEGRATION_CONTRACT.md:46)；[checkout.mjs:57](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/checkout.mjs:57)；[orderWorkflow.mjs:118](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:118) |
| 12.07 | 送达照片上传后是否直接算完成？ | 需要客户确认 | 同7.10，当前商家确认送达但未记录客户业务确认。 | [delivery-proof.ts:47](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery-proof/delivery-proof.ts:47)；[orderWorkflow.mjs:90](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/orderWorkflow.mjs:90) |
| 12.08 | 首批可配送的小区或区域有哪些？ | 需要客户确认 | 区域可以配置，但首批真实范围资料仍需商家提供。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 12.09 | 是否需要限制每个时段的订单数量？ | 需要客户确认 | 时段容量是可选功能，是否首版纳入待商家答复。 | [deliveryRules.mjs:143](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/deliveryRules.mjs:143)；[delivery.ts:37](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/delivery/delivery.ts:37) |
| 12.10 | 第一版是否需要保存常用地址？ | 需要客户确认 | 地址源码已有，不等于客户已确认其首版验收范围。 | [addresses.ts:54](C:/Users/USER/WeChatProjects/miniprogram-1/miniprogram/pages/addresses/addresses.ts:54)；[customerAddresses.mjs:7](C:/Users/USER/WeChatProjects/miniprogram-1/backend/src/customerAddresses.mjs:7) |

## 本次实际补齐及边界

1. 微信正式店铺码：新store-code页和后端storeEntry模块。仅owner/manager取码，服务端stable_token及getwxacodeunlimit；scene为店铺UUID无短横线的32位十六进制，不包含API地址或登录令牌，固定正式版release、首页page、check_path=true。官方返回PNG才视为成功；缓存存PostgreSQL，重复取码复用；大小限制、失败冷却及并发店铺锁。没有实际向微信发起生成请求，没有生成二维码实体、没有写R2。
2. 商家可查看缓存码、保存相册、导出PNG供好友发送或打印；这不是打印机驱动。本机演示不制造模拟码。
3. 扫码/分享入口：App和首页接收scene或store，公开GET解析当前启用店铺。新配置miniprogram/config/cloud.ts的PUBLIC_API_BASE必须在正式构建前填写可信HTTPS来源，可选DEFAULT_STORE_SLUG用于单店直接打开；不从分享参数接收apiBase。未配置时明确拒绝入口，不以演示冒充云端。正式新设备不能依赖商家原设备Storage配置。
4. 好友分享：原首页增加open-type=share，onShareAppMessage路径只带storeSlug，无管理标记、token或顾客身份。扫码/分享无需登录浏览；地址/下单等私有业务仍需原微信认证。
5. 商家内部备注：orders独立merchant_note/merchant_note_version，与contact_snapshot.note完全分开。原商家列表展示和编辑，PUT note按店铺、角色和版本更新；状态转换不清空。顾客API显式投影不返回备注，顾客本机UI也剥离此字段。staff仍仅按原管理权限只读；本机演示Storage不是可靠身份安全边界，不能用于真实私人资料。
6. 首页真实店名来自stores.name，营业和公告仍用现有统一配置。优惠专区新增discount=1服务端筛选与独立游标，不受普通目录前页/分类/搜索加载窗口限制；每页30，更多优惠按需续页，不加载全库。缺货优惠仍可展示但按钮禁用。
7. 结算显示当前服务端固定0配送费及预计总额，未新增收费规则；顾客订单对已有refunded/partially_refunded标签显示退款文案，不生成退款记录或声称退款成功。
8. preflight迁移上限提示由旧005改为当前018，未运行preflight脚本。迁移工具和备份元数据仅同步顺序/应用预期版本，不改造迁移系统。

## API与迁移

新增公开GET /v1/store-entry/store/:slug、/v1/store-entry/scene/:scene，只返回启用店铺slug/名称/时区；店铺解析不要求登录。新增商家GET/POST /v1/merchant/stores/:slug/store-code，POST主体为expectedAppId（当前小程序AppID），服务端在生成前比对配置，不接受任意page或scene；返回受权PNG base64，缓存绑定店铺和微信AppID。正式码取决于WX_APPID/WX_APPSECRET、微信服务器IP/平台配置及正式首页发布；前端还核对当前小程序AppID与后端一致。

新增PUT /v1/merchant/stores/:slug/orders/:id/note，输入note（最多1000字）及expectedVersion；仅owner/manager可写，商家成员按原权限读取。409后保留输入、刷新核对，不覆盖顾客备注。原公开products扩展discount=1，同样使用原身份隔离/公开上架和库存规则，不新增平行商品API。营业公开响应增加storeName。

新增018_store_code_merchant_note.sql，必须在001—017之后由另行授权流程应用：orders两个备注字段、store_miniapp_codes缓存表。没有执行迁移；新列表读取备注需要018，不可在旧结构上直接启用新版后端。未修改001—017。缓存码是微信官方图片内容，不是灾难恢复备份，不使用R2。

## 支付契约与剩余核心缺口

新增PAYMENT_INTEGRATION_CONTRACT.md列出已有orderId、totalCents、CNY、unpaid、库存预留/到期、履约和客户需提供的通知/查询/退款资料。只是待客户确认草案，没有实现支付端点或调用wx.requestPayment。new队列仍含未支付，不限库存部分履约未统一paid门槛，因此9.06仍是支付依赖；没有因送达或扣库存而确认收款。

剩余部分完成：8.01原文包含购物车数据库表，而当前购物车为设备隔离暂存；此前明确允许设备购物车，需客户确认是否还要求云端购物车/跨设备同步，不能建空表冒充接通。8.14只有简要数据说明，缺正式隐私主体、联系人、保留/删除规则及平台申报。客户业务待确认项保持独立；运费、截单、配送责任、规格、售后、收货确认等不擅自定案。测试/上线事项全部保持未完成。

## 集成风险承接

已阅读INTEGRATION_READINESS.md，保留其历史审查结果，本阶段不覆盖原文。增量说明：B03的扫码/分享配置入口源码已补，但PUBLIC_API_BASE及可选单店默认slug仍须由实际环境确认；B01/B02现在包含018和discount协议；旧预检数量提示源码已修正至018。其余风险仍存在：启动后端立即运行库存任务并可能写库；迁移SQL与账本写入不原子、有中断窗口；015/016历史图片引用兼容须核对；Phase21 expectedRevision及Phase27商品创建clientKey不可省略；域名/凭证私有桶需实际确认。没有尝试通过运行服务器、迁移、生产库、R2、备份或清理来验证。

## 静态检查及未验证范围

只允许并执行TypeScript --noEmit及修改后端文件的node --check，检查发现并移除退款文案调整后的两个未使用变量；最终TypeScript --noEmit退出0，本次8个新增/修改后端及脚本文件node --check均退出0。这只是静态检查，不是功能测试通过；不写、不生成、不运行功能测试，也未执行现有测试。没有运行迁移、后端、部署、Git命令、备份/恢复或R2操作。官方码依赖AppID、正式页面和微信平台配置；官方文档链接本次抓取受限，参数和错误处理仍需实际平台核对，不把源码完成当成正式码已经生成或扫码验收。

官方机制参考（不作为已经运行的证明）：
- [微信获取不限制的小程序码](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/getUnlimitedQRCode.html)
- [微信稳定版access_token](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-access-token/getStableAccessToken.html)
- [微信Page好友分享](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)
- [微信保存图片到相册](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.saveImageToPhotosAlbum.html)

后续应先完成客户规则/支付契约确认、可信API配置和001—018迁移核对，再另行授权隔离环境人工集成。正式发布、图片生成、域名配置和完整扫码到送达验收均不属于本次已经执行的内容。完成Phase28后停止，不进入Phase29。


## 本次新增和修改文件清单

以下均相对于项目根目录，不包含之前阶段已有未提交修改的归属推断；本阶段没有使用Git查询或操作工作区。

新增：
- backend/sql/018_store_code_merchant_note.sql
- backend/src/storeEntry.mjs
- miniprogram/config/cloud.ts
- miniprogram/utils/storeEntry.ts
- miniprogram/pages/store-code/store-code.ts
- miniprogram/pages/store-code/store-code.wxml
- miniprogram/pages/store-code/store-code.wxss
- miniprogram/pages/store-code/store-code.json
- backend/PAYMENT_INTEGRATION_CONTRACT.md
- backend/REQUIREMENTS_AUDIT.md

修改：
- 需求.md
- backend/src/server.mjs
- backend/src/orderWorkflow.mjs
- backend/src/merchantOrderQuery.mjs
- backend/src/deliveryRules.mjs
- backend/scripts/preflight.mjs
- backend/scripts/migrate-dev.mjs
- backend/scripts/backup-metadata.mjs
- miniprogram/app.ts
- miniprogram/app.json
- miniprogram/pages/admin/admin.wxml
- miniprogram/pages/index/index.ts
- miniprogram/pages/index/index.wxml
- miniprogram/utils/remoteApi.ts
- miniprogram/utils/businessCloud.ts
- miniprogram/utils/merchantOrdersCloud.ts
- miniprogram/utils/orders.ts
- miniprogram/pages/admin-orders/admin-orders.ts
- miniprogram/pages/admin-orders/admin-orders.wxml
- miniprogram/pages/checkout/checkout.wxml
- miniprogram/pages/orders/orders.ts
- miniprogram/pages/order-detail/order-detail.ts

## 后续手动体验路径（未执行）

先另行授权核对001—018结构，配置PUBLIC_API_BASE、WX_APPID/WX_APPSECRET及已发布的正式首页；正式生成按钮要求当前店铺API与构建内的可信API一致，页面核对小程序AppID，不能拿开发者设备Storage冒充正式配置。没有这些条件时应显示明确失败/未配置，不出现假码。

商家工作台→店铺小程序码→获取正式码→保存相册或导出PNG；新设备微信扫码→首页公开解析店铺→无需登录浏览。首页分享按钮仅在可信构建配置就绪时显示，好友打开店铺路径应得到相同店铺；分享不包含API地址和管理权限。顾客商品、优惠分页分别续页，确认优惠列表不依赖普通目录前30件。

商家订单页→订单卡片“商家内部备注”→填写保存；多设备旧版本写入应409，输入保留，刷新核对后再操作。顾客订单仍只显示原下单备注；备注保存和状态变更互不覆盖。云端失败不回退本机；本机演示只能用于无真实私人资料的演示。
