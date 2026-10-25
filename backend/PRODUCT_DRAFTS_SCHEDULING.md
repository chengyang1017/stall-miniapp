# 商品草稿与定时上架（Phase 16）

本次只交付源码。未执行迁移、部署、自动测试或数据库操作。

默认业务地区为中国大陆，货币沿用 CNY（人民币 ¥）；时间显示为北京时间（UTC+8）。
本次没有引入海外手机号、地址或货币规则，也没有改变原有大陆业务校验。

## 数据结构与启用顺序

迁移 `sql/008_product_drafts_scheduling.sql` 需要 001–007 的结构已存在。
本地迁移工具的序列检查已更新到 008，但未运行。运维需在另行授权后应用迁移，
并协调后端和小程序版本；新代码访问新字段，未迁移时会报错并拒绝操作。

- `stores.time_zone`：IANA 时区，默认 `Asia/Shanghai`（北京时间 UTC+8）。由店铺配置提供，
  当前没有新增时区管理页面。服务端用 Intl 校验，不信任客户端提交的时区。
- `products.publish_at`：UTC 时间点（PostgreSQL timestamptz）。有计划时 `active=false`，
  由数据库约束保证。`version` 随所有商品写入递增。
- `product_drafts`：独立草稿记录，JSONB 白名单保存原始表单字符串及图片引用，
  允许价格、分类、日期尚未填写完整。`state` 为 draft、published 或 discarded，
  版本用于并发检查。草稿不会成为 products，也不能被订单商品外键引用。

## 服务端生效规则

`productPublishing.mjs` 的同一 SQL 表达式供公开商品列表与创建订单使用：
`active=true OR (publish_at IS NOT NULL AND publish_at <= statement_timestamp())`。
公开列表还要求店铺启用；订单还检查店铺、售罄、配送及其他原有约束。
商品详情、云端购物车价格与有效性均读取这个公开列表，增加购物车数量前也重新查询。
创建订单在事务中对商品加共享锁并重新计算状态，客户端伪造购物车或 active 没有效力。

这是一种服务端即时可售性计算；不依赖页面刷新触发数据库写入，也不需要后台定时进程。
到期后数据库原始 active 仍为 false，publish_at 仍保留；对外有效状态已经为上架。
商家接口返回 effectiveActive，不能用原始 active 推断是否到期。

服务端将店铺墙上时间转换为 UTC；拒绝无效日期、过去时间、夏令时缺口及有歧义的时间。
在取得事务锁后再次使用数据库时钟确认未来时间。

## 手动操作与并发

- 手动下架（包括批量下架及云端软删除）清除计划；到期不会再次上架。
- 批量上架拒绝未来计划，商家需先进入表单取消计划并保存。
- 修改售罄、有货或分类不取消计划；到期不改变 sold_out。
- 未修改计划的完整表单保存会保留原 UTC 时间点；即使计划在编辑过程中到期，也不重新校验为新计划或清空原计划。
- 新建或修改计划由服务端再次检查未来时间；云端不以手机时钟判定是否过期。
- 完整编辑和计划修改携带 expectedVersion；旧表单返回冲突，不能复活已取消计划。
- 复制保留商品内容和图片引用，不复制 ID、定时计划、草稿身份或历史业务记录。
- 草稿更新和放弃必须携带版本。放弃为逻辑状态更新，不删除图片对象。
- 草稿发布走完整商品创建校验；事务锁住草稿并记录发布结果，重复发布同一草稿
  和相同内容返回已创建的商品；更改内容的重试返回冲突。
- **普通新增和复制的 POST 仍没有通用幂等机制**。提交锁、成功锁和超时核对提示保留，
  不应宣称已经解决这两种流程的网络重试重复创建问题。
- 编辑正式商品时“保存草稿”另存一个独立模板，不修改或隐藏原正式商品；该草稿发布创建新商品。
- 未改动的云端折扣时间保留原 UTC 精度，包括复制后另存草稿再发布的流程；手动修改的折扣时间按店铺时区解释。

## 图片与本地模式

云端草稿及商品复用同店铺对象引用并校验对象。没有添加 R2 删除、复制或自动重传。
现有产品删除只有下架语义，没有删除共享图片对象。

本地在 `stall_demo_v1` 添加可选 drafts/timeZone 字段，在商品添加可选 publishAt/version，
旧记录仍兼容；草稿与正式商品分开存放。定时生效使用设备时间，顾客列表、详情、
购物车与演示订单再次校验，**不代表可靠的服务端自动上架**。
非默认时区需要微信运行环境支持 Intl；不支持时拒绝时间转换，不猜测时区。

## 手动体验

微信开发者工具重新编译后进入商家商品管理。新增商品，留空价格后保存草稿，
在“草稿”筛选继续编辑并保存更新，补全信息后发布。放弃草稿会先确认。
为完整商品开启定时上架，选择未来日期和时间，保存后查看“待定时上架”。
可修改时间或取消计划并保存；批量下架会取消计划，售罄操作保留计划。
商品管理支持下拉刷新，可重新获取服务器有效状态，不需要退出当前页面。
到期后重新读取顾客列表即可观察服务端生效结果；到期前详情、购物车和下单均不允许购买。
已有页面不会通过推送自动重绘，需再次读取数据；这不影响服务端可售性。

云端体验需另行完成迁移和启动新版后端，本次没有执行这些操作。
商品列表和草稿列表各沿用最多 500 条读取，公开列表最多 200 条，无新增分页。

## 逐项实现核对（源码静态检查，未运行测试或数据库）

| 原始要求 | 实现位置及行为 |
| --- | --- |
| 不完整草稿、跨设备恢复 | 独立 product_drafts + JSONB 原始输入；商家 API GET/POST/PATCH |
| 草稿编辑与保存更新 | 现有商品表单 draftId 模式，版本校验，失败保留输入 |
| 草稿发布 | 完整商品创建校验，草稿锁与商品创建处于同一事务，发布后不再进入草稿列表 |
| 放弃草稿 | 列表二次确认 + 状态/版本条件更新，不删除 R2 对象 |
| 正式商品和草稿区分 | 独立表、显式草稿 state；下架和售罄分别由 active/有效状态及 sold_out 表达 |
| 计划新增、修改、取消 | 表单日期/时间选择、IANA 店铺时区、UTC 数据库存储、版本与事务锁 |
| 服务端到期生效 | 公开查询和下单共用 publishedSql，以数据库时间即时计算 |
| 顾客列表和详情 | 仅从已上架正式商品查询；本地详情也拒绝未来商品 |
| 购物车和订单 | 加购前重读云端列表、购物车有效性过滤、服务端订单加锁复核；本地也复核 |
| 批量兼容 | 草稿不参与选择；未来计划禁止批量提前上架；下架取消计划；售罄/分类不改计划 |
| 商品复制兼容 | 不复制原 ID、计划、草稿身份和业务历史；图片继续共享引用 |
| 默认地区 | 中国大陆、Asia/Shanghai、北京时间 UTC+8、CNY/人民币 ¥ |
| 本地演示 | stall_demo_v1 向后兼容扩展；按设备时间计算，不宣称服务端可靠定时 |

尚未执行的启用工作是数据库迁移、启动新版后端及微信开发者工具实际体验，均依照本次限制留待后续。
无另行创建的后台调度任务或实时推送；当前选择的是原指令允许的服务端即时计算方案。
其他 IANA 时区已由数据结构和服务端转换支持，尚未新增店铺时区配置界面。

## Phase 16 文件清单

新增：

- backend/sql/008_product_drafts_scheduling.sql
- backend/src/productDrafts.mjs
- backend/src/productPublishing.mjs
- miniprogram/utils/productPublishing.ts
- backend/PRODUCT_DRAFTS_SCHEDULING.md（本文）

修改（保留这些文件内此前的批量管理、复制和 TypeScript 修复）：

- backend/src/catalog.mjs
- backend/src/server.mjs
- backend/src/checkout.mjs
- backend/scripts/migrate-dev.mjs（只调整迁移序列识别，未运行）
- miniprogram/pages/admin-products/admin-products.ts
- miniprogram/pages/admin-products/admin-products.wxml
- miniprogram/pages/admin-products/admin-products.wxss
- miniprogram/pages/admin-products/admin-products.json
- miniprogram/pages/admin-product-form/admin-product-form.ts
- miniprogram/pages/admin-product-form/admin-product-form.wxml
- miniprogram/pages/admin-product-form/admin-product-form.wxss
- miniprogram/pages/index/index.ts
- miniprogram/pages/product-detail/product-detail.ts
- miniprogram/pages/cart/cart.ts
- miniprogram/pages/checkout/checkout.ts
- miniprogram/utils/cloudMerchantProducts.ts
- miniprogram/utils/store.ts
- miniprogram/utils/authApi.ts
- miniprogram/utils/cloudCart.ts
- miniprogram/utils/cart.ts
- miniprogram/utils/directPurchase.ts
- miniprogram/utils/orders.ts
